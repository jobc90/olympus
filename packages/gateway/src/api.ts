import type { IncomingMessage, ServerResponse } from 'node:http';
import { authMiddleware, loadConfig, validateApiKey } from './auth.js';
import { handleCorsPrefllight, setCorsHeaders } from './cors.js';
import type { RunManager, RunOptions } from './run-manager.js';
import { SessionManager, type SessionEvent } from './session-manager.js';
import { runParallel, GeminiExecutor, TaskStore, ContextStore, ContextService } from '@olympus-dev/core';
import type { CreateTaskInput, UpdateTaskInput, CreateContextInput, UpdateContextInput, ContextScope, CreateMergeInput, ReportUpstreamInput } from '@olympus-dev/protocol';
import type { CodexAdapter } from './codex-adapter.js';

export interface ApiHandlerOptions {
  runManager: RunManager;
  sessionManager: SessionManager;
  cliSessionStore?: import('./cli-session-store.js').CliSessionStore;
  memoryStore?: import('./memory/store.js').MemoryStore;
  codexAdapter?: CodexAdapter;
  workerRegistry?: import('./worker-registry.js').WorkerRegistry;
  onRunCreated?: () => void;  // Callback to broadcast runs:list
  onSessionEvent?: (sessionId: string, event: SessionEvent) => void;
  onContextEvent?: (eventType: string, payload: unknown) => void;
  onSessionsChanged?: () => void;  // Callback to broadcast sessions:list
  onCliComplete?: (result: import('@olympus-dev/protocol').CliRunResult) => void;
  onCliStream?: (chunk: import('@olympus-dev/protocol').CliStreamChunk) => void;
}

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {} as T);
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Parse URL path and extract route info
 */
function parseRoute(url: string): { path: string; id?: string; query?: Record<string, string> } {
  const urlObj = new URL(url, 'http://localhost');
  const parts = urlObj.pathname.split('/').filter(Boolean);
  const query: Record<string, string> = {};
  urlObj.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // /api/runs/:id
  if (parts[0] === 'api' && parts[1] === 'runs' && parts[2]) {
    return { path: '/api/runs/:id', id: parts[2], query };
  }

  // /api/sessions routes
  if (parts[0] === 'api' && parts[1] === 'sessions') {
    // /api/sessions/discover
    if (parts[2] === 'discover') {
      return { path: '/api/sessions/discover', query };
    }
    // /api/sessions/connect
    if (parts[2] === 'connect') {
      return { path: '/api/sessions/connect', query };
    }
    if (parts[2]) {
      // /api/sessions/:id/context
      if (parts[3] === 'context') {
        return { path: '/api/sessions/:id/context', id: parts[2], query };
      }
      // /api/sessions/:id/input
      if (parts[3] === 'input') {
        return { path: '/api/sessions/:id/input', id: parts[2], query };
      }
      // /api/sessions/:id/output
      if (parts[3] === 'output') {
        return { path: '/api/sessions/:id/output', id: parts[2], query };
      }
      // /api/sessions/:id
      return { path: '/api/sessions/:id', id: parts[2], query };
    }
  }

  // /api/tasks special routes (before :id matching)
  if (parts[0] === 'api' && parts[1] === 'tasks') {
    // /api/tasks/search
    if (parts[2] === 'search') {
      return { path: '/api/tasks/search', query };
    }
    // /api/tasks/stats
    if (parts[2] === 'stats') {
      return { path: '/api/tasks/stats', query };
    }
    // /api/tasks/:id
    if (parts[2]) {
      // /api/tasks/:id/children
      if (parts[3] === 'children') {
        return { path: '/api/tasks/:id/children', id: parts[2], query };
      }
      // /api/tasks/:id/context
      if (parts[3] === 'context') {
        return { path: '/api/tasks/:id/context', id: parts[2], query };
      }
      // /api/tasks/:id/history
      if (parts[3] === 'history') {
        return { path: '/api/tasks/:id/history', id: parts[2], query };
      }
      return { path: '/api/tasks/:id', id: parts[2], query };
    }
  }

  // /api/contexts routes
  if (parts[0] === 'api' && parts[1] === 'contexts') {
    // /api/contexts/:id/merge
    if (parts[2] && parts[3] === 'merge') {
      return { path: '/api/contexts/:id/merge', id: parts[2], query };
    }
    // /api/contexts/:id/report-upstream
    if (parts[2] && parts[3] === 'report-upstream') {
      return { path: '/api/contexts/:id/report-upstream', id: parts[2], query };
    }
    // /api/contexts/:id/versions
    if (parts[2] && parts[3] === 'versions') {
      return { path: '/api/contexts/:id/versions', id: parts[2], query };
    }
    // /api/contexts/:id/children
    if (parts[2] && parts[3] === 'children') {
      return { path: '/api/contexts/:id/children', id: parts[2], query };
    }
    // /api/contexts/:id
    if (parts[2]) {
      return { path: '/api/contexts/:id', id: parts[2], query };
    }
  }

  // /api/cli routes
  if (parts[0] === 'api' && parts[1] === 'cli') {
    if (parts[2] === 'run') {
      // /api/cli/run/async
      if (parts[3] === 'async') {
        return { path: '/api/cli/run/async', query };
      }
      // /api/cli/run/:id/status
      if (parts[3] && parts[4] === 'status') {
        return { path: '/api/cli/run/:id/status', id: parts[3], query };
      }
      return { path: '/api/cli/run', query };
    }
    if (parts[2] === 'sessions') {
      if (parts[3]) {
        return { path: '/api/cli/sessions/:id', id: parts[3], query };
      }
      return { path: '/api/cli/sessions', query };
    }
  }

  // /api/codex routes
  if (parts[0] === 'api' && parts[1] === 'codex') {
    if (parts[2] === 'route') {
      return { path: '/api/codex/route', query };
    }
    if (parts[2] === 'chat') {
      return { path: '/api/codex/chat', query };
    }
  }

  // /api/workers routes
  if (parts[0] === 'api' && parts[1] === 'workers') {
    if (parts[2] === 'register') {
      return { path: '/api/workers/register', query };
    }
    if (parts[2] && parts[3] === 'heartbeat') {
      return { path: '/api/workers/:id/heartbeat', id: parts[2], query };
    }
    if (parts[2]) {
      return { path: '/api/workers/:id', id: parts[2], query };
    }
    return { path: '/api/workers', query };
  }

  // /api/operations/:id
  if (parts[0] === 'api' && parts[1] === 'operations' && parts[2]) {
    return { path: '/api/operations/:id', id: parts[2], query };
  }

  return { path: urlObj.pathname, query };
}

/**
 * Create HTTP API request handler
 */
export function createApiHandler(options: ApiHandlerOptions) {
  const { runManager, sessionManager, cliSessionStore, memoryStore, codexAdapter, workerRegistry, onRunCreated, onSessionEvent, onContextEvent, onSessionsChanged, onCliComplete, onCliStream } = options;

  // 비동기 CLI 실행 태스크 저장소 (in-memory, 1시간 TTL)
  const asyncTasks = new Map<string, { status: 'running' | 'completed' | 'failed'; result?: import('@olympus-dev/protocol').CliRunResult; error?: string; startedAt: number }>();

  return async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Handle CORS
    if (handleCorsPrefllight(req, res)) {
      return;
    }
    setCorsHeaders(req, res);

    const { path, id, query } = parseRoute(req.url || '/');
    const method = req.method || 'GET';

    try {
      // Health check (no auth required)
      if (path === '/healthz' && method === 'GET') {
        sendJson(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: Date.now(),
        });
        return;
      }

      // Auth verification endpoint
      if (path === '/api/auth' && method === 'POST') {
        const body = await parseBody<{ apiKey: string }>(req);
        const valid = validateApiKey(body.apiKey);
        sendJson(res, 200, { valid });
        return;
      }

      // All other endpoints require authentication
      if (!authMiddleware(req, res)) {
        return;
      }

      // POST /api/chat - Simple chat (lightweight, no run tracking)
      if (path === '/api/chat' && method === 'POST') {
        const body = await parseBody<{ message: string }>(req);

        if (!body.message) {
          sendJson(res, 400, { error: 'Bad Request', message: 'message is required' });
          return;
        }

        try {
          const gemini = new GeminiExecutor();
          const result = await gemini.execute(body.message, { timeout: 30000 });

          if (result.success) {
            sendJson(res, 200, { reply: result.output });
          } else {
            sendJson(res, 200, { reply: '죄송합니다. 응답을 생성할 수 없습니다.' });
          }
        } catch {
          sendJson(res, 200, { reply: '죄송합니다. 응답을 생성할 수 없습니다.' });
        }
        return;
      }

      // ── Worker Registry endpoints ──

      // POST /api/workers/register
      if (path === '/api/workers/register' && method === 'POST') {
        if (!workerRegistry) {
          sendJson(res, 503, { error: 'Worker registry not available' });
          return;
        }
        const body = await parseBody<{ name?: string; projectPath: string; pid: number }>(req);
        if (!body.projectPath || !body.pid) {
          sendJson(res, 400, { error: 'projectPath and pid required' });
          return;
        }
        const worker = workerRegistry.register(body);
        sendJson(res, 201, { worker });
        return;
      }

      // DELETE /api/workers/:id
      if (path === '/api/workers/:id' && method === 'DELETE' && id) {
        if (!workerRegistry) {
          sendJson(res, 503, { error: 'Worker registry not available' });
          return;
        }
        const removed = workerRegistry.unregister(id);
        sendJson(res, removed ? 200 : 404, { removed });
        return;
      }

      // GET /api/workers
      if (path === '/api/workers' && method === 'GET') {
        const workers = workerRegistry?.getAll() ?? [];
        sendJson(res, 200, { workers });
        return;
      }

      // POST /api/workers/:id/heartbeat
      if (path === '/api/workers/:id/heartbeat' && method === 'POST' && id) {
        if (!workerRegistry) {
          sendJson(res, 400, { error: 'Invalid request' });
          return;
        }
        const ok = workerRegistry.heartbeat(id);
        sendJson(res, ok ? 200 : 404, { ok });
        return;
      }

      // ── Codex Chat endpoint ──

      // POST /api/codex/chat — Codex 대화 + 워커 위임
      if (path === '/api/codex/chat' && method === 'POST') {
        const body = await parseBody<{ message: string; chatId?: number }>(req);
        if (!body.message) {
          sendJson(res, 400, { error: 'message is required' });
          return;
        }

        const workers = workerRegistry?.getAll() ?? [];
        const workerListStr = workers.length > 0
          ? workers.map(w => `- "${w.name}" (${w.status}) @ ${w.projectPath}`).join('\n')
          : '없음';

        const systemPrompt = `당신은 Olympus Codex — 사용자의 개인 AI 비서입니다.
사용자의 로컬 컴퓨터 환경에서 작업을 실행하며,
업무와 일상 생산성을 돕는 것이 역할입니다.

사용자 환경은 macOS / Windows / Linux 모두 가능합니다.
항상 상황에 맞게 자연스럽게 행동하세요.

---

## 역할 분리

- Codex는 대부분의 작업을 직접 수행합니다.
- Claude 워커는 오직 **코딩/개발 작업**만 담당합니다.
  (코드 작성, 빌드, 테스트, 리팩토링 등)

---

## 응답 모드 규칙 (가장 중요)

Codex는 요청을 먼저 2가지로 분류합니다.

### 1) Casual Mode (기본값)

다음 요청은 Casual Mode입니다:
- 단순 질문
- 가벼운 대화
- 개념 설명
- 짧은 정보 요청

이 경우:

- 짧고 자연스럽게 답변하세요.
- 불필요한 단계 요약/보고서 말투를 쓰지 마세요.
- "요청 요약 / 작업 판단 / 다음 액션" 같은 형식을 절대 붙이지 마세요.

예시 톤:
"그건 'gpt-5.3-codex'가 기본이에요."
"응, 그거 이렇게 하면 돼요."

---

### 2) Execution Mode (실행 작업일 때만)

다음이 포함되면 Execution Mode입니다:
- 파일/폴더 조작
- 시스템 설정 변경
- 앱 실행
- 자동화 실행
- 개발/코딩 작업

이 경우에만 실행 프로세스를 따릅니다:

1) 실행 또는 위임
2) 완료 후 핵심만 짧게 보고
3) 필요할 때만 다음 액션 제안

---

## Claude 워커 위임 규칙 (Coding Only)

코딩/개발 작업일 때만 워커를 사용합니다.

첫 줄에 반드시 아래 형식:

\`[DELEGATE:claude-worker]\`

템플릿:

[DELEGATE:claude-worker]
목표: 무엇을 구현/수정할까
경로: 프로젝트 위치
단계:
1.
2.
출력: 결과 요약

---

## Codex가 직접 하는 작업 (코딩 제외 전부)

- 브라우저 열기 / 검색 / 정보 수집
- 로컬 앱 실행
- 문서/파일 정리
- 이메일/일정 확인
- 시스템 상태 점검
- OS 환경에 맞는 자동화 실행

---

## OS 적응 규칙

환경에 따라 자연스럽게 맞춥니다:

- macOS → zsh, brew
- Windows → PowerShell
- Linux → bash, apt

불확실하면 먼저 확인합니다.

---

## 워커가 없을 때

코딩 작업인데 워커가 없으면:

"코딩 작업을 실행하려면 워커가 필요합니다.
\`olympus start\`로 워커를 시작해주세요."

---

## 안전 규칙

- 삭제, 배포, 결제 등 위험 작업은 반드시 사용자 확인 후 실행
- 비밀번호/OTP 요청 금지
- 불확실하면 먼저 확인 후 진행

---

## Execution Mode 결과 보고 (필요할 때만)

실행 작업이 끝났을 때만 간단히:

✅ 완료: …
📌 참고: …
➡️ 다음: (정말 필요할 때만)

---

## 톤

- 한국어로 친근하고 간결하게
- 과한 보고서 말투 금지
- 필요한 경우에만 구조적으로 정리

## 현재 상태
- 워커 세션: ${workers.length > 0 ? workers.length + '개 활성' : '없음 (olympus start 필요)'}
${workers.length > 0 ? '- 워커 목록:\n' + workerListStr : ''}`;

        try {
          const { runCli } = await import('./cli-runner.js');
          const combinedPrompt = `### SYSTEM\n${systemPrompt}\n\n### USER\n${body.message}`;
          const result = await runCli({
            prompt: combinedPrompt,
            provider: 'codex',
            model: 'gpt-5.3-codex',
            dangerouslySkipPermissions: true,
            timeoutMs: 1_800_000,  // 30분 — 대량 문서 요약 등 장시간 작업 대응
          });

          if (!result.success) {
            console.error('[codex/chat] runCli failed:', JSON.stringify(result.error), 'text:', result.text?.slice(0, 200));
            sendJson(res, 200, { type: 'chat', response: '죄송합니다. 잠시 후 다시 시도해주세요.' });
            return;
          }

          // Parse [DELEGATE:name] pattern
          const delegateMatch = result.text.match(/^\[DELEGATE:([^\]]+)\]\s*([\s\S]*)/m);
          if (delegateMatch) {
            const [, workerName, taskPrompt] = delegateMatch;
            const worker = workerRegistry?.findByProject(workerName.trim());
            if (worker && worker.status === 'idle') {
              const userResponse = `"${worker.name}" 워커(${worker.projectPath})에 작업을 지시합니다.\n\n작업: ${taskPrompt.trim().split('\n')[0]}`;
              sendJson(res, 200, {
                type: 'delegate',
                response: userResponse,
                worker,
                taskPrompt: taskPrompt.trim(),
              });
            } else if (worker && worker.status === 'busy') {
              sendJson(res, 200, {
                type: 'chat',
                response: `"${worker.name}" 워커가 현재 다른 작업 중입니다. 완료 후 다시 시도해주세요.`,
              });
            } else {
              sendJson(res, 200, {
                type: 'no_workers',
                response: `"${workerName.trim()}" 워커를 찾을 수 없습니다.\n\n현재 등록된 워커:\n${workers.length > 0 ? workers.map(w => `- ${w.name} (${w.status})`).join('\n') : '없음'}\n\n터미널에서 \`olympus start --name ${workerName.trim()}\`로 워커를 시작하세요.`,
              });
            }
          } else {
            // Regular chat response
            sendJson(res, 200, { type: 'chat', response: result.text });
          }
        } catch (err) {
          sendJson(res, 500, { error: 'Chat failed', message: (err as Error).message });
        }
        return;
      }

      // ── CLI Runner endpoints ──

      // POST /api/cli/run — 동기 CLI 실행
      if (path === '/api/cli/run' && method === 'POST') {
        const body = await parseBody<{
          prompt?: string;
          provider?: string;
          model?: string;
          sessionKey?: string;
          sessionId?: string;
          resumeSession?: boolean;
          workspaceDir?: string;
          timeoutMs?: number;
          systemPrompt?: string;
          dangerouslySkipPermissions?: boolean;
          allowedTools?: string[];
        }>(req);

        if (!body.prompt) {
          sendJson(res, 400, { error: 'Bad Request', message: 'prompt is required' });
          return;
        }

        // Lazy import to avoid circular deps
        const { runCli } = await import('./cli-runner.js');
        type CliRunParams = import('@olympus-dev/protocol').CliRunParams;

        const sessionKey = body.sessionKey || `cli-${Date.now()}`;

        const params: CliRunParams = {
          prompt: body.prompt,
          provider: (body.provider as 'claude' | 'codex') ?? 'claude',
          model: body.model,
          workspaceDir: body.workspaceDir,
          timeoutMs: body.timeoutMs,
          systemPrompt: body.systemPrompt,
          dangerouslySkipPermissions: body.dangerouslySkipPermissions,
          allowedTools: body.allowedTools,
          onStream: onCliStream
            ? (chunk) => onCliStream({ sessionKey, chunk, timestamp: Date.now() })
            : undefined,
        };

        // 세션 복원: sessionKey → 저장소 조회 → resumeSession=true
        if (body.sessionKey && cliSessionStore) {
          const existing = cliSessionStore.get(body.sessionKey);
          if (existing) {
            params.sessionId = existing.cliSessionId;
            params.resumeSession = true;
          }
        } else if (body.sessionId) {
          params.sessionId = body.sessionId;
          params.resumeSession = body.resumeSession;
        }

        const result = await runCli(params);

        // 세션 영속화
        if (result.sessionId && body.sessionKey && cliSessionStore) {
          cliSessionStore.save({
            key: sessionKey,
            provider: params.provider ?? 'claude',
            cliSessionId: result.sessionId,
            model: result.model,
            lastPrompt: body.prompt.slice(0, 500),
            lastResponse: result.text.slice(0, 500),
            totalInputTokens: result.usage.inputTokens,
            totalOutputTokens: result.usage.outputTokens,
            totalCostUsd: result.cost,
            turnCount: result.numTurns || 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        // 메모리에 결과 저장 (비동기, 실패 무시)
        if (memoryStore && result.success) {
          try {
            const { randomUUID } = await import('node:crypto');
            memoryStore.saveTask({
              id: randomUUID(),
              command: body.prompt!,
              analysis: '',
              plan: '',
              result: result.text.slice(0, 2000),
              success: result.success,
              duration: result.durationMs ?? 0,
              timestamp: Date.now(),
              projectPath: body.workspaceDir ?? '',
              workerCount: 0,
            });
          } catch { /* 저장 실패해도 응답은 정상 반환 */ }
        }

        onCliComplete?.(result);
        sendJson(res, 200, { result });
        return;
      }

      // POST /api/cli/run/async — 비동기 CLI 실행 (즉시 taskId 반환)
      if (path === '/api/cli/run/async' && method === 'POST') {
        const body = await parseBody<Record<string, unknown>>(req);
        if (!body.prompt) {
          sendJson(res, 400, { error: 'Bad Request', message: 'prompt is required' });
          return;
        }

        const { randomUUID } = await import('node:crypto');
        const taskId = randomUUID();

        const { runCli } = await import('./cli-runner.js');
        type CliRunParams = import('@olympus-dev/protocol').CliRunParams;

        const asyncSessionKey = (body.sessionKey as string) || `cli-async-${taskId}`;

        const params: CliRunParams = {
          prompt: body.prompt as string,
          provider: (body.provider as 'claude' | 'codex') ?? 'claude',
          model: body.model as string | undefined,
          workspaceDir: body.workspaceDir as string | undefined,
          timeoutMs: (body.timeoutMs as number) ?? 1_800_000,
          systemPrompt: body.systemPrompt as string | undefined,
          dangerouslySkipPermissions: body.dangerouslySkipPermissions as boolean | undefined,
          allowedTools: body.allowedTools as string[] | undefined,
          onStream: onCliStream
            ? (chunk) => onCliStream({ sessionKey: asyncSessionKey, chunk, timestamp: Date.now() })
            : undefined,
        };

        // 세션 복원
        if (body.sessionKey && cliSessionStore) {
          const existing = cliSessionStore.get(body.sessionKey as string);
          if (existing) {
            params.sessionId = existing.cliSessionId;
            params.resumeSession = true;
          }
        }

        asyncTasks.set(taskId, { status: 'running', startedAt: Date.now() });

        // 백그라운드 실행
        runCli(params).then(result => {
          asyncTasks.set(taskId, { status: 'completed', result, startedAt: asyncTasks.get(taskId)!.startedAt });

          if (result.sessionId && body.sessionKey && cliSessionStore) {
            cliSessionStore.save({
              key: body.sessionKey as string,
              provider: params.provider ?? 'claude',
              cliSessionId: result.sessionId,
              model: result.model,
              lastPrompt: (body.prompt as string).slice(0, 500),
              lastResponse: result.text.slice(0, 500),
              totalInputTokens: result.usage.inputTokens,
              totalOutputTokens: result.usage.outputTokens,
              totalCostUsd: result.cost,
              turnCount: result.numTurns || 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }

          if (memoryStore && result.success) {
            try {
              memoryStore.saveTask({
                id: randomUUID(), command: body.prompt as string,
                analysis: '', plan: '',
                result: result.text.slice(0, 2000), success: result.success,
                duration: result.durationMs ?? 0, timestamp: Date.now(),
                projectPath: (body.workspaceDir as string) ?? '', workerCount: 0,
              });
            } catch { /* ignore */ }
          }

          onCliComplete?.(result);
        }).catch(err => {
          asyncTasks.set(taskId, { status: 'failed', error: (err as Error).message, startedAt: asyncTasks.get(taskId)!.startedAt });
        });

        // 1시간 후 자동 정리
        setTimeout(() => asyncTasks.delete(taskId), 3_600_000);

        sendJson(res, 202, { taskId, status: 'running' });
        return;
      }

      // GET /api/cli/run/:id/status — 비동기 작업 상태 조회
      if (path === '/api/cli/run/:id/status' && method === 'GET' && id) {
        const task = asyncTasks.get(id);
        if (!task) {
          sendJson(res, 404, { error: 'Not Found', message: 'Task not found' });
          return;
        }
        if (task.status === 'completed') {
          sendJson(res, 200, { status: 'completed', result: task.result });
        } else if (task.status === 'failed') {
          sendJson(res, 200, { status: 'failed', error: task.error });
        } else {
          sendJson(res, 200, { status: 'running', elapsedMs: Date.now() - task.startedAt });
        }
        return;
      }

      // GET /api/cli/sessions — 저장된 CLI 세션 목록
      if (path === '/api/cli/sessions' && method === 'GET') {
        if (!cliSessionStore) {
          sendJson(res, 200, { sessions: [] });
          return;
        }
        const provider = query?.provider as 'claude' | 'codex' | undefined;
        const limit = Number(query?.limit) || 50;
        const sessions = cliSessionStore.list(provider || undefined, limit);
        sendJson(res, 200, { sessions });
        return;
      }

      // DELETE /api/cli/sessions/:id — CLI 세션 삭제
      if (path === '/api/cli/sessions/:id' && method === 'DELETE' && id) {
        if (!cliSessionStore) {
          sendJson(res, 404, { error: 'Not Found' });
          return;
        }
        const deleted = cliSessionStore.delete(id);
        if (deleted) {
          sendJson(res, 200, { success: true });
        } else {
          sendJson(res, 404, { error: 'Not Found', message: 'Session not found' });
        }
        return;
      }

      // ── Codex Router endpoint ──

      // POST /api/codex/route — Codex Orchestrator 라우팅
      if (path === '/api/codex/route' && method === 'POST') {
        if (!codexAdapter) {
          sendJson(res, 503, { error: 'Service Unavailable', message: 'Codex adapter is not configured' });
          return;
        }

        const body = await parseBody<{ text: string; source: 'telegram' | 'dashboard' | 'cli'; chatId?: number }>(req);

        if (!body.text) {
          sendJson(res, 400, { error: 'Bad Request', message: 'text is required' });
          return;
        }

        try {
          const result = await codexAdapter.handleInput({
            text: body.text,
            source: body.source || 'dashboard',
            chatId: body.chatId,
          });
          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 500, { error: 'Codex Route Failed', message: (e as Error).message });
        }
        return;
      }

      // POST /api/runs - Create new run
      if (path === '/api/runs' && method === 'POST') {
        const body = await parseBody<RunOptions>(req);

        if (!body.prompt) {
          sendJson(res, 400, { error: 'Bad Request', message: 'prompt is required' });
          return;
        }

        try {
          const run = runManager.createRun(body);

          // Start execution asynchronously
          executeRun(run.id, runManager, body);

          sendJson(res, 201, { runId: run.id });

          // Broadcast runs:list to all connected clients
          onRunCreated?.();
        } catch (e) {
          if ((e as Error).message.includes('Maximum concurrent runs')) {
            sendJson(res, 429, { error: 'Too Many Requests', message: (e as Error).message });
          } else {
            throw e;
          }
        }
        return;
      }

      // GET /api/runs - List all runs
      if (path === '/api/runs' && method === 'GET') {
        const runs = runManager.getAllRunStatuses();
        sendJson(res, 200, { runs });
        return;
      }

      // GET /api/runs/:id - Get run status
      if (path === '/api/runs/:id' && method === 'GET' && id) {
        const status = runManager.getRunStatus(id);
        if (!status) {
          sendJson(res, 404, { error: 'Not Found', message: `Run ${id} not found` });
          return;
        }
        sendJson(res, 200, status);
        return;
      }

      // DELETE /api/runs/:id - Cancel run
      if (path === '/api/runs/:id' && method === 'DELETE' && id) {
        const cancelled = runManager.cancelRun(id);
        if (!cancelled) {
          sendJson(res, 404, { error: 'Not Found', message: `Run ${id} not found or not running` });
          return;
        }
        sendJson(res, 200, { cancelled: true, runId: id });
        return;
      }

      // ============ Session API ============

      // POST /api/sessions - Create new session
      if (path === '/api/sessions' && method === 'POST') {
        const body = await parseBody<{ chatId: number; projectPath?: string; name?: string }>(req);

        if (typeof body.chatId !== 'number') {
          sendJson(res, 400, { error: 'Bad Request', message: 'chatId (number) is required' });
          return;
        }

        try {
          const session = await sessionManager.create(body.chatId, body.projectPath, body.name);
          sendJson(res, 201, { session });
          onSessionsChanged?.();
        } catch (e) {
          sendJson(res, 500, { error: 'Session Creation Failed', message: (e as Error).message });
        }
        return;
      }

      // GET /api/sessions - List all active sessions
      if (path === '/api/sessions' && method === 'GET') {
        const changed = sessionManager.reconcileSessions();
        if (changed) {
          onSessionsChanged?.();
        }

        const sessions = sessionManager.getAll().filter(s => s.status === 'active');
        sendJson(res, 200, { sessions, availableSessions: [] });
        return;
      }

      // GET /api/sessions/:id - Get session
      if (path === '/api/sessions/:id' && method === 'GET' && id) {
        const session = sessionManager.get(id);
        if (!session) {
          sendJson(res, 404, { error: 'Not Found', message: `Session ${id} not found` });
          return;
        }
        sendJson(res, 200, { session });
        return;
      }

      // GET /api/sessions/:id/context - Get session with linked contexts
      if (path === '/api/sessions/:id/context' && method === 'GET' && id) {
        const session = sessionManager.get(id);
        if (!session) {
          sendJson(res, 404, { error: 'Not Found', message: `Session ${id} not found` });
          return;
        }
        sendJson(res, 200, { session, contextLink: sessionManager.getSessionContextLink(id) });
        return;
      }

      // DELETE /api/sessions/:id - Close session
      if (path === '/api/sessions/:id' && method === 'DELETE' && id) {
        const closed = sessionManager.closeSession(id);
        if (!closed) {
          sendJson(res, 404, { error: 'Not Found', message: `Session ${id} not found` });
          return;
        }
        sendJson(res, 200, { closed: true, sessionId: id });
        onSessionsChanged?.();
        return;
      }

      // POST /api/sessions/:id/input — deprecated (use POST /api/cli/run instead)
      if (path === '/api/sessions/:id/input' && method === 'POST' && id) {
        sendJson(res, 410, { error: 'Gone', message: 'Use POST /api/cli/run instead' });
        return;
      }

      // GET /api/sessions/:id/output — deprecated (use CLI streaming instead)
      if (path === '/api/sessions/:id/output' && method === 'GET' && id) {
        sendJson(res, 410, { error: 'Gone', message: 'Use CLI streaming instead' });
        return;
      }

      // ============ Task API ============

      // GET /api/tasks - List root tasks or tree
      if (path === '/api/tasks' && method === 'GET') {
        const taskStore = TaskStore.getInstance();
        const format = query?.format;

        if (format === 'tree') {
          const tree = taskStore.getTree();
          sendJson(res, 200, { tasks: tree });
        } else {
          const roots = taskStore.getRoots();
          sendJson(res, 200, { tasks: roots });
        }
        return;
      }

      // POST /api/tasks - Create task
      if (path === '/api/tasks' && method === 'POST') {
        const body = await parseBody<CreateTaskInput>(req);

        if (!body.name) {
          sendJson(res, 400, { error: 'Bad Request', message: 'name is required' });
          return;
        }

        const taskStore = TaskStore.getInstance();
        const changedBy = req.headers['x-changed-by'] as string || 'user';
        const task = taskStore.create(body, changedBy);
        sendJson(res, 201, { task });
        return;
      }

      // GET /api/tasks/:id - Get task
      if (path === '/api/tasks/:id' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const task = taskStore.get(id);

        if (!task) {
          sendJson(res, 404, { error: 'Not Found', message: `Task ${id} not found` });
          return;
        }
        sendJson(res, 200, { task });
        return;
      }

      // PATCH /api/tasks/:id - Update task
      if (path === '/api/tasks/:id' && method === 'PATCH' && id) {
        const body = await parseBody<UpdateTaskInput>(req);
        const taskStore = TaskStore.getInstance();
        const changedBy = req.headers['x-changed-by'] as string || 'user';

        try {
          const task = taskStore.update(id, body, changedBy);
          sendJson(res, 200, { task });
        } catch (e) {
          if ((e as Error).message.includes('not found')) {
            sendJson(res, 404, { error: 'Not Found', message: (e as Error).message });
          } else {
            throw e;
          }
        }
        return;
      }

      // DELETE /api/tasks/:id - Delete task (soft)
      if (path === '/api/tasks/:id' && method === 'DELETE' && id) {
        const taskStore = TaskStore.getInstance();
        const task = taskStore.get(id);
        if (!task) {
          sendJson(res, 404, { error: 'Not Found', message: `Task ${id} not found` });
          return;
        }
        taskStore.delete(id);
        sendJson(res, 200, { deleted: true, taskId: id });
        return;
      }

      // GET /api/tasks/:id/children - Get children
      if (path === '/api/tasks/:id/children' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const children = taskStore.getChildren(id);
        sendJson(res, 200, { tasks: children });
        return;
      }

      // GET /api/tasks/:id/context - Get task with resolved context
      if (path === '/api/tasks/:id/context' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const parsed = parseInt(query?.maxLevels || '', 10);
        const maxLevels = Number.isNaN(parsed) ? 3 : Math.min(Math.max(parsed, 1), 10);
        const task = taskStore.getWithContext(id, maxLevels);

        if (!task) {
          sendJson(res, 404, { error: 'Not Found', message: `Task ${id} not found` });
          return;
        }
        sendJson(res, 200, { task });
        return;
      }

      // GET /api/tasks/:id/history - Get context history
      if (path === '/api/tasks/:id/history' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const history = taskStore.getContextHistory(id);
        sendJson(res, 200, { history });
        return;
      }

      // GET /api/tasks/search - Search tasks
      if (path === '/api/tasks/search' && method === 'GET') {
        const q = query?.q || '';
        const taskStore = TaskStore.getInstance();
        const tasks = taskStore.search(q);
        sendJson(res, 200, { tasks });
        return;
      }

      // GET /api/tasks/stats - Get statistics
      if (path === '/api/tasks/stats' && method === 'GET') {
        const taskStore = TaskStore.getInstance();
        const stats = taskStore.getStats();
        sendJson(res, 200, { stats });
        return;
      }

      // ============ Context API ============

      // GET /api/contexts - List contexts (filter by scope, path)
      if (path === '/api/contexts' && method === 'GET') {
        const contextStore = ContextStore.getInstance();
        const format = query?.format;
        const scope = query?.scope as ContextScope | undefined;

        if (format === 'tree') {
          const tree = contextStore.getTree(scope);
          sendJson(res, 200, { contexts: tree });
        } else {
          const parentId = query?.parentId;
          const contexts = contextStore.getAll(scope, parentId === 'null' ? null : parentId);
          sendJson(res, 200, { contexts });
        }
        return;
      }

      // POST /api/contexts - Create context
      if (path === '/api/contexts' && method === 'POST') {
        const body = await parseBody<CreateContextInput>(req);

        if (!body.scope || !body.path) {
          sendJson(res, 400, { error: 'Bad Request', message: 'scope and path are required' });
          return;
        }

        const contextService = ContextService.getInstance();
        const actor = req.headers['x-changed-by'] as string || 'user';

        try {
          const context = contextService.create(body, actor);
          onContextEvent?.('context:created', { context });
          sendJson(res, 201, { context });
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes('already exists')) {
            sendJson(res, 409, { error: 'Conflict', message: msg });
          } else if (msg.includes('not found') || msg.includes('Invalid scope')) {
            sendJson(res, 400, { error: 'Bad Request', message: msg });
          } else {
            throw e;
          }
        }
        return;
      }

      // GET /api/contexts/:id - Get context
      if (path === '/api/contexts/:id' && method === 'GET' && id) {
        const contextStore = ContextStore.getInstance();
        const context = contextStore.getById(id);

        if (!context) {
          sendJson(res, 404, { error: 'Not Found', message: `Context ${id} not found` });
          return;
        }
        sendJson(res, 200, { context });
        return;
      }

      // PATCH /api/contexts/:id - Update context (optimistic locking)
      if (path === '/api/contexts/:id' && method === 'PATCH' && id) {
        const body = await parseBody<UpdateContextInput>(req);
        const contextService = ContextService.getInstance();
        const actor = req.headers['x-changed-by'] as string || 'user';

        if (body.expectedVersion === undefined) {
          sendJson(res, 400, { error: 'Bad Request', message: 'expectedVersion is required for optimistic locking' });
          return;
        }

        try {
          const context = contextService.update(id, body, actor);
          onContextEvent?.('context:updated', { context });
          sendJson(res, 200, { context });
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes('not found')) {
            sendJson(res, 404, { error: 'Not Found', message: msg });
          } else if (msg.includes('Version mismatch')) {
            sendJson(res, 409, { error: 'Conflict', message: msg });
          } else {
            throw e;
          }
        }
        return;
      }

      // DELETE /api/contexts/:id - Soft delete context
      if (path === '/api/contexts/:id' && method === 'DELETE' && id) {
        const contextStore = ContextStore.getInstance();
        const context = contextStore.getById(id);
        if (!context) {
          sendJson(res, 404, { error: 'Not Found', message: `Context ${id} not found` });
          return;
        }
        contextStore.delete(id);
        sendJson(res, 200, { deleted: true, contextId: id });
        return;
      }

      // GET /api/contexts/:id/versions - Get version history
      if (path === '/api/contexts/:id/versions' && method === 'GET' && id) {
        const contextStore = ContextStore.getInstance();
        const limit = parseInt(query?.limit || '100', 10);
        const versions = contextStore.getVersionHistory(id, limit);
        sendJson(res, 200, { versions });
        return;
      }

      // GET /api/contexts/:id/children - Get children
      if (path === '/api/contexts/:id/children' && method === 'GET' && id) {
        const contextStore = ContextStore.getInstance();
        const children = contextStore.getChildren(id);
        sendJson(res, 200, { contexts: children });
        return;
      }

      // POST /api/contexts/:id/merge - Create merge request (async 202)
      if (path === '/api/contexts/:id/merge' && method === 'POST' && id) {
        const body = await parseBody<CreateMergeInput & { idempotencyKey?: string }>(req);
        const contextStore = ContextStore.getInstance();

        if (!body.targetId) {
          sendJson(res, 400, { error: 'Bad Request', message: 'targetId is required' });
          return;
        }

        try {
          // Create operation for tracking
          const operation = contextStore.createOperation('merge', id);
          // Create merge record
          const merge = contextStore.createMerge(id, body.targetId, body.idempotencyKey);
          contextStore.updateMergeStatus(merge.id, 'pending', 'Waiting for approval');

          onContextEvent?.('context:merge_requested', { merge, operation });

          if (query?.autoApply === 'true') {
            // Optional immediate apply path.
            setTimeout(() => {
              try {
                contextStore.updateMergeStatus(merge.id, 'approved');
                const updated = contextStore.applyMerge(merge.id, 'system');
                const appliedMerge = contextStore.getMerge(merge.id);
                contextStore.updateOperationStatus(operation.id, 'succeeded', JSON.stringify({ mergeId: merge.id }));
                onContextEvent?.('context:merged', { merge: appliedMerge, targetContext: updated });
              } catch (e) {
                contextStore.updateMergeStatus(merge.id, 'conflict');
                contextStore.updateOperationStatus(operation.id, 'failed', undefined, (e as Error).message);
                const failedMerge = contextStore.getMerge(merge.id);
                onContextEvent?.('context:conflict_detected', {
                  merge: failedMerge,
                  conflicts: [(e as Error).message],
                });
              }
            }, 0);
          } else {
            contextStore.updateOperationStatus(
              operation.id,
              'succeeded',
              JSON.stringify({ mergeId: merge.id, status: 'pending' })
            );
          }

          sendJson(res, 202, { operationId: operation.id, mergeId: merge.id });
        } catch (e) {
          const msg = (e as Error).message;
          sendJson(res, 400, { error: 'Bad Request', message: msg });
        }
        return;
      }

      // POST /api/contexts/:id/report-upstream - Report to parent (async 202)
      if (path === '/api/contexts/:id/report-upstream' && method === 'POST' && id) {
        const contextService = ContextService.getInstance();
        const contextStore = ContextStore.getInstance();
        const context = contextService.getById(id);

        if (!context) {
          sendJson(res, 404, { error: 'Not Found', message: `Context ${id} not found` });
          return;
        }

        if (!context.parentId) {
          sendJson(res, 400, { error: 'Bad Request', message: 'Context has no parent to report to' });
          return;
        }

        try {
          // Create operation for tracking
          const operation = contextStore.createOperation('report_upstream', id);
          const actor = req.headers['x-changed-by'] as string || 'user';
          const cascade = query?.cascade === 'true';

          // Async: policy-based report with optional cascade
          setTimeout(() => {
            try {
              if (cascade) {
                const merges = contextService.cascadeReportUpstream(id, actor);
                contextStore.updateOperationStatus(
                  operation.id,
                  'succeeded',
                  JSON.stringify({ mergeIds: merges.map(m => m.id), cascade: true })
                );
                const latestSource = contextService.getById(id);
                const latestTarget = latestSource?.parentId ? contextService.getById(latestSource.parentId) : null;
                if (latestSource && latestTarget) {
                  onContextEvent?.('context:reported_upstream', {
                    sourceContext: latestSource,
                    targetContext: latestTarget,
                    operation: contextStore.getOperation(operation.id),
                  });
                }
                return;
              }

              const merge = contextService.reportUpstream(id, actor);
              const sourceContext = contextService.getById(id);
              const targetContext = context.parentId ? contextService.getById(context.parentId) : null;
              contextStore.updateOperationStatus(operation.id, 'succeeded', JSON.stringify({ mergeId: merge.id }));
              if (sourceContext && targetContext) {
                onContextEvent?.('context:reported_upstream', {
                  sourceContext,
                  targetContext,
                  operation: contextStore.getOperation(operation.id),
                });
              }
            } catch (e) {
              contextStore.updateOperationStatus(operation.id, 'failed', undefined, (e as Error).message);
            }
          }, 0);

          sendJson(res, 202, { operationId: operation.id });
        } catch (e) {
          throw e;
        }
        return;
      }

      // ============ Operation API ============

      // GET /api/operations/:id - Get operation status
      if (path === '/api/operations/:id' && method === 'GET' && id) {
        const contextStore = ContextStore.getInstance();
        const operation = contextStore.getOperation(id);

        if (!operation) {
          sendJson(res, 404, { error: 'Not Found', message: `Operation ${id} not found` });
          return;
        }
        sendJson(res, 200, { operation });
        return;
      }

      // Not found
      sendJson(res, 404, { error: 'Not Found', message: `${method} ${path} not found` });
    } catch (e) {
      console.error('API error:', e);
      sendJson(res, 500, { error: 'Internal Server Error', message: (e as Error).message });
    }
  };
}

/**
 * Execute a run asynchronously
 */
async function executeRun(runId: string, runManager: RunManager, options: RunOptions): Promise<void> {
  const run = runManager.getRun(runId);
  if (!run) return;

  const { bus, abortController } = run;

  try {
    // Run the orchestrator
    const result = await runParallel({
      prompt: options.prompt,
      context: options.context,
      agents: options.agents,
      usePro: options.usePro,
      timeout: options.timeout,
      bus,
      signal: abortController.signal,
    });

    // Check if aborted
    if (abortController.signal.aborted) {
      runManager.completeRun(runId, false);
      return;
    }

    // Determine success
    const codexResult = result.codex ?? result.gpt;
    const success = (result.gemini?.success ?? true) && (codexResult?.success ?? true);
    runManager.completeRun(runId, success);
  } catch (e) {
    bus.emitLog('error', `Run failed: ${(e as Error).message}`, 'run-manager');
    runManager.completeRun(runId, false);
  }
}
