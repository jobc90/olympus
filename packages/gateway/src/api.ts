import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { authMiddleware, loadConfig, validateApiKey } from './auth.js';
import { handleCorsPrefllight, setCorsHeaders } from './cors.js';
import type { RunManager, RunOptions } from './run-manager.js';
import { SessionManager, type SessionEvent } from './session-manager.js';
import { runParallel, GeminiExecutor, TaskStore, ContextStore, ContextService, extractContext, type LocalContextStoreManager } from '@olympus-dev/core';
import type { CreateTaskInput, UpdateTaskInput, CreateContextInput, UpdateContextInput, ContextScope, CreateMergeInput, ReportUpstreamInput } from '@olympus-dev/protocol';
import type { CodexAdapter } from './codex-adapter.js';
import type { GeminiAdvisor } from './gemini-advisor.js';

export interface ApiHandlerOptions {
  runManager: RunManager;
  sessionManager: SessionManager;
  cliSessionStore?: import('./cli-session-store.js').CliSessionStore;
  memoryStore?: import('./memory/store.js').MemoryStore;
  codexAdapter?: CodexAdapter;
  geminiAdvisor?: GeminiAdvisor;
  workerRegistry?: import('./worker-registry.js').WorkerRegistry;
  onRunCreated?: () => void;  // Callback to broadcast runs:list
  onSessionEvent?: (sessionId: string, event: SessionEvent) => void;
  onContextEvent?: (eventType: string, payload: unknown) => void;
  onSessionsChanged?: () => void;  // Callback to broadcast sessions:list
  onCliComplete?: (result: import('@olympus-dev/protocol').CliRunResult) => void;
  onCliStream?: (chunk: import('@olympus-dev/protocol').CliStreamChunk) => void;
  onWorkerEvent?: (eventType: string, payload: unknown) => void;
  localContextManager?: LocalContextStoreManager;
}

/**
 * Parse JSON body from request (10MB limit)
 */
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    // Check Content-Length header upfront
    const contentLength = parseInt(req.headers['content-length'] ?? '', 10);
    if (contentLength > MAX_BODY_SIZE) {
      reject(new Error('Request body too large'));
      return;
    }

    let body = '';
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
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
    if (parts[2] === 'summarize') {
      return { path: '/api/codex/summarize', query };
    }
  }

  // /api/workers routes
  if (parts[0] === 'api' && parts[1] === 'workers') {
    if (parts[2] === 'register') {
      return { path: '/api/workers/register', query };
    }
    // /api/workers/tasks/:taskId — worker task status query
    if (parts[2] === 'tasks' && parts[3]) {
      return { path: '/api/workers/tasks/:id', id: parts[3], query };
    }
    if (parts[2] && parts[3] === 'heartbeat') {
      return { path: '/api/workers/:id/heartbeat', id: parts[2], query };
    }
    // /api/workers/:id/task — assign task to worker
    if (parts[2] && parts[3] === 'task') {
      return { path: '/api/workers/:id/task', id: parts[2], query };
    }
    if (parts[2]) {
      return { path: '/api/workers/:id', id: parts[2], query };
    }
    return { path: '/api/workers', query };
  }

  // /api/local-context routes
  if (parts[0] === 'api' && parts[1] === 'local-context') {
    if (parts[2] === 'projects') {
      return { path: '/api/local-context/projects', query };
    }
    if (parts[2] && parts[3] === 'summary') {
      return { path: '/api/local-context/:id/summary', id: parts[2], query };
    }
    if (parts[2] && parts[3] === 'workers') {
      return { path: '/api/local-context/:id/workers', id: parts[2], query };
    }
    if (parts[2] && parts[3] === 'injection') {
      return { path: '/api/local-context/:id/injection', id: parts[2], query };
    }
  }

  // /api/gemini-advisor routes
  if (parts[0] === 'api' && parts[1] === 'gemini-advisor') {
    if (parts[2] === 'status') {
      return { path: '/api/gemini-advisor/status', query };
    }
    if (parts[2] === 'refresh') {
      return { path: '/api/gemini-advisor/refresh', query };
    }
    if (parts[2] === 'projects') {
      if (parts[3]) {
        return { path: '/api/gemini-advisor/projects/:id', id: parts[3], query };
      }
      return { path: '/api/gemini-advisor/projects', query };
    }
    if (parts[2] === 'analyze' && parts[3]) {
      return { path: '/api/gemini-advisor/analyze/:id', id: parts[3], query };
    }
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
  const { runManager, sessionManager, cliSessionStore, memoryStore, codexAdapter, geminiAdvisor, workerRegistry, onRunCreated, onSessionEvent, onContextEvent, onSessionsChanged, onCliComplete, onCliStream, onWorkerEvent, localContextManager } = options;

  // Async CLI task store (in-memory, 1-hour TTL)
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

      // POST /api/chat — Hera (GeminiAdvisor) chat with project context
      if (path === '/api/chat' && method === 'POST') {
        const body = await parseBody<{ message: string }>(req);

        if (!body.message) {
          sendJson(res, 400, { error: 'Bad Request', message: 'message is required' });
          return;
        }

        // Build project context from GeminiAdvisor + LocalContextStore
        let projectContext = '';
        if (geminiAdvisor) {
          try {
            projectContext = geminiAdvisor.buildCodexContext({ maxLength: 3000 });
          } catch { /* context not available */ }
        }
        if (!projectContext && localContextManager) {
          try {
            const rootStore = await localContextManager.getRootStore(process.cwd());
            const projects = rootStore.getAllProjects();
            if (projects.length > 0) {
              projectContext = '\n\n## Project Status\n' + projects.map(p =>
                `- **${p.projectName}** (${p.projectPath}): ${p.summary.slice(0, 100)}`
              ).join('\n');
            }
          } catch { /* context not available */ }
        }

        const systemPrompt = `### SYSTEM
You are Hera (Athena) — Olympus Project Context Analysis AI.

## Role
- Analyze and understand sub-project structures, tech stacks, and current states
- Assist Codex Agent (Zeus) with context comprehension
- Identify inter-project relationships, dependencies, and issues to provide advice
- Respond based on project data stored in LocalContextStore

## Response Rules
- Respond in Korean, friendly and concise
- Provide specific answers leveraging project analysis data
- Avoid unnecessary formatting or report-style language
- Be honest when you don't know something
${projectContext}

### USER
${body.message}`;

        try {
          const gemini = new GeminiExecutor();
          const result = await gemini.execute(systemPrompt, { timeout: 30000 });

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

      // ── Worker Registry Endpoints ──

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

      // POST /api/workers/:id/task — Assign task to worker (worker executes CLI directly)
      if (path === '/api/workers/:id/task' && method === 'POST' && id) {
        if (!workerRegistry) {
          sendJson(res, 503, { error: 'Worker registry not available' });
          return;
        }
        const body = await parseBody<{ prompt: string; provider?: string; dangerouslySkipPermissions?: boolean }>(req);
        if (!body.prompt) {
          sendJson(res, 400, { error: 'prompt is required' });
          return;
        }

        const workers = workerRegistry.getAll();
        const worker = workers.find(w => w.id === id);
        if (!worker) {
          sendJson(res, 404, { error: 'Worker not found' });
          return;
        }
        if (worker.status === 'busy') {
          sendJson(res, 409, { error: 'Worker is busy', currentTask: worker.currentTaskPrompt });
          return;
        }

        // Inject project context
        let enrichedPrompt = body.prompt;
        if (localContextManager && worker.projectPath) {
          try {
            const store = await localContextManager.getProjectStore(worker.projectPath);
            const injection = store.buildContextInjection({ maxTokens: 2000 });
            if (injection.projectSummary) {
              enrichedPrompt = `## Project Context\n${injection.projectSummary}\n\n## Recent Activity\n${injection.recentActivity}\n\n---\n\n${body.prompt}`;
            }
          } catch { /* injection failed — use original prompt */ }
        }

        // Inject Gemini Advisor project analysis
        if (geminiAdvisor && worker.projectPath) {
          try {
            const geminiContext = geminiAdvisor.buildProjectContext(worker.projectPath, { maxLength: 2000 });
            if (geminiContext) {
              enrichedPrompt = `## Project Analysis (Gemini)\n${geminiContext}\n\n${enrichedPrompt}`;
            }
          } catch { /* Gemini not available */ }
        }

        // 1. Create task in WorkerRegistry (worker → busy)
        const task = workerRegistry.createTask(worker.id, enrichedPrompt);

        // 2. Broadcast worker:task:assigned → Worker receives and executes CLI directly
        onWorkerEvent?.('worker:task:assigned', {
          taskId: task.taskId,
          workerId: worker.id,
          workerName: worker.name,
          prompt: body.prompt,
          provider: body.provider ?? 'claude',
          dangerouslySkipPermissions: body.dangerouslySkipPermissions ?? true,
          projectPath: worker.projectPath,
        });

        sendJson(res, 202, { taskId: task.taskId, status: 'running', workerName: worker.name });
        return;
      }

      // POST /api/workers/tasks/:taskId/result — Worker reports CLI execution result
      if (path === '/api/workers/tasks/:id' && method === 'POST' && id) {
        if (!workerRegistry) {
          sendJson(res, 503, { error: 'Worker registry not available' });
          return;
        }
        const body = await parseBody<{ success: boolean; text?: string; error?: string; durationMs?: number; usage?: Record<string, number>; cost?: number; timeout?: boolean; isFinalAfterTimeout?: boolean }>(req);
        const task = workerRegistry.getTask(id);
        if (!task) {
          sendJson(res, 404, { error: 'Task not found' });
          return;
        }

        const result = {
          success: body.success,
          text: body.text ?? '',
          sessionId: '',
          model: '',
          usage: {
            inputTokens: body.usage?.inputTokens ?? 0,
            outputTokens: body.usage?.outputTokens ?? 0,
            cacheCreationTokens: body.usage?.cacheCreationTokens ?? 0,
            cacheReadTokens: body.usage?.cacheReadTokens ?? 0,
          },
          cost: body.cost ?? 0,
          durationMs: body.durationMs ?? 0,
          numTurns: 0,
          error: body.error ? { type: 'unknown' as const, message: body.error } : undefined,
        };

        // ── Timeout branch handling ──
        if (body.timeout && !body.isFinalAfterTimeout) {
          // 30-min timeout: record partial result, keep worker busy
          workerRegistry.timeoutTask(id, result);

          // Codex summary (brief — partial result)
          let summary = result.text ?? '';
          if (summary.length > 2000) {
            summary = summary.slice(0, 2000);
          }

          onWorkerEvent?.('worker:task:timeout', {
            taskId: id,
            workerId: task.workerId,
            workerName: task.workerName,
            success: body.success,
            durationMs: body.durationMs,
            chatId: task.chatId,
            summary,
          });

          sendJson(res, 200, { ok: true, status: 'timeout_monitoring' });
          return;
        }

        if (body.isFinalAfterTimeout) {
          // Final completion after timeout
          workerRegistry.completeTask(id, result);

          // Save worker context to LocalContextStore
          if (localContextManager && task) {
            try {
              const worker = workerRegistry?.getAll().find(w => w.id === task.workerId);
              const extracted = extractContext(result, task.prompt);
              const projectPath = worker?.projectPath ?? process.cwd();
              const store = await localContextManager.getProjectStore(projectPath);
              store.saveWorkerContext({
                id: randomUUID(),
                workerId: task.workerId,
                workerName: task.workerName,
                taskId: id,
                prompt: task.prompt.slice(0, 500),
                success: result.success,
                summary: extracted.summary,
                filesChanged: extracted.filesChanged,
                decisions: extracted.decisions,
                errors: extracted.errors,
                dependencies: extracted.dependencies,
                model: result.model,
                inputTokens: result.usage?.inputTokens ?? 0,
                outputTokens: result.usage?.outputTokens ?? 0,
                costUsd: result.cost ?? 0,
                durationMs: result.durationMs ?? 0,
                numTurns: result.numTurns ?? 0,
                rawText: result.text?.slice(0, 8000),
                createdAt: new Date().toISOString(),
              });
              store.updateProjectContext();
              await localContextManager.propagateToRoot(projectPath, process.cwd());
            } catch { /* save failure — response still OK */ }
          }

          // Trigger Gemini incremental refresh
          if (geminiAdvisor) {
            const taskWorker = workerRegistry?.getAll().find(w => w.id === task.workerId);
            if (taskWorker?.projectPath) {
              geminiAdvisor.onProjectUpdate(taskWorker.projectPath);
            }
          }

          // Summarize
          let summary = result.text ?? '';
          if (result.success && summary) {
            try {
              const { runCli } = await import('./cli-runner.js');
              const summarizeResult = await runCli({
                prompt: `Summarize the following work result from worker "${task.workerName}" concisely in Korean. Only key outcomes — no greetings or extra explanations.\n\n---\n${summary.slice(0, 8000)}`,
                provider: 'codex',
                model: 'gpt-5.3-codex',
                dangerouslySkipPermissions: true,
                timeoutMs: 60_000,
              });
              if (summarizeResult.success && summarizeResult.text) {
                summary = summarizeResult.text;
              }
            } catch {
              summary = summary.slice(0, 2000);
            }
          }

          onWorkerEvent?.('worker:task:final_after_timeout', {
            taskId: id,
            workerId: task.workerId,
            workerName: task.workerName,
            success: body.success,
            durationMs: body.durationMs,
            chatId: task.chatId,
            summary,
          });
          onCliComplete?.(result);

          sendJson(res, 200, { ok: true });
          return;
        }

        // ── Normal completion (existing logic) ──
        workerRegistry.completeTask(id, result);

        // Save worker context to LocalContextStore
        if (localContextManager && task) {
          try {
            const worker = workerRegistry?.getAll().find(w => w.id === task.workerId);
            const extracted = extractContext(result, task.prompt);
            const projectPath = worker?.projectPath ?? process.cwd();
            const store = await localContextManager.getProjectStore(projectPath);
            store.saveWorkerContext({
              id: randomUUID(),
              workerId: task.workerId,
              workerName: task.workerName,
              taskId: id,
              prompt: task.prompt.slice(0, 500),
              success: result.success,
              summary: extracted.summary,
              filesChanged: extracted.filesChanged,
              decisions: extracted.decisions,
              errors: extracted.errors,
              dependencies: extracted.dependencies,
              model: result.model,
              inputTokens: result.usage?.inputTokens ?? 0,
              outputTokens: result.usage?.outputTokens ?? 0,
              costUsd: result.cost ?? 0,
              durationMs: result.durationMs ?? 0,
              numTurns: result.numTurns ?? 0,
              rawText: result.text?.slice(0, 8000),
              createdAt: new Date().toISOString(),
            });
            store.updateProjectContext();
            await localContextManager.propagateToRoot(projectPath, process.cwd());
          } catch { /* save failure — response still OK */ }
        }

        // Trigger Gemini incremental refresh
        if (geminiAdvisor) {
          const taskWorker = workerRegistry?.getAll().find(w => w.id === task.workerId);
          if (taskWorker?.projectPath) {
            geminiAdvisor.onProjectUpdate(taskWorker.projectPath);
          }
        }

        // Summarize result via Codex
        let summary = result.text ?? '';
        if (result.success && summary) {
          try {
            const { runCli } = await import('./cli-runner.js');
            const summarizeResult = await runCli({
              prompt: `Summarize the following work result from worker "${task.workerName}" concisely in Korean. Only key outcomes — no greetings or extra explanations.\n\n---\n${summary.slice(0, 8000)}`,
              provider: 'codex',
              model: 'gpt-5.3-codex',
              dangerouslySkipPermissions: true,
              timeoutMs: 60_000,
            });
            if (summarizeResult.success && summarizeResult.text) {
              summary = summarizeResult.text;
            }
          } catch {
            // Summary failed — use truncated original
            summary = summary.slice(0, 2000);
          }
        }

        onWorkerEvent?.('worker:task:completed', {
          taskId: id,
          workerId: task.workerId,
          workerName: task.workerName,
          success: body.success,
          durationMs: body.durationMs,
          chatId: task.chatId,
          summary,
        });
        onCliComplete?.(result);

        sendJson(res, 200, { ok: true });
        return;
      }

      // GET /api/workers/tasks/:taskId — Worker task status query
      if (path === '/api/workers/tasks/:id' && method === 'GET' && id) {
        if (!workerRegistry) {
          sendJson(res, 503, { error: 'Worker registry not available' });
          return;
        }
        const task = workerRegistry.getTask(id);
        if (!task) {
          sendJson(res, 404, { error: 'Task not found' });
          return;
        }
        sendJson(res, 200, {
          taskId: task.taskId,
          workerId: task.workerId,
          workerName: task.workerName,
          status: task.status,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          result: task.result,
        });
        return;
      }

      // ── Codex Chat Endpoint ──

      // POST /api/codex/chat — Codex chat + worker delegation
      if (path === '/api/codex/chat' && method === 'POST') {
        const body = await parseBody<{ message: string; chatId?: number }>(req);
        if (!body.message) {
          sendJson(res, 400, { error: 'message is required' });
          return;
        }

        const workers = workerRegistry?.getAll() ?? [];
        const workerListStr = workers.length > 0
          ? workers.map(w => `- "${w.name}" (${w.status}) @ ${w.projectPath}`).join('\n')
          : 'none';

        // Inject project context
        let projectContextStr = '';
        if (localContextManager) {
          try {
            const rootStore = await localContextManager.getRootStore(process.cwd());
            const projects = rootStore.getAllProjects();
            if (projects.length > 0) {
              const lines = projects.map(p => {
                const status = p.successfulTasks > 0
                  ? `${p.successfulTasks}/${p.totalTasks} succeeded`
                  : `${p.totalTasks} tasks`;
                const issues = p.knownIssues.length > 0
                  ? ` | issues: ${p.knownIssues.slice(0, 2).join(', ')}`
                  : '';
                return `- **${p.projectName}** (${p.projectPath}): ${p.summary.slice(0, 100)}${status ? ` [${status}]` : ''}${issues}`;
              });
              projectContextStr = `\n\n## Project Status\n${lines.join('\n')}`;
            }
          } catch { /* context not available */ }
        }

        // Append Gemini Advisor context
        let geminiContextStr = '';
        if (geminiAdvisor) {
          try {
            geminiContextStr = geminiAdvisor.buildCodexContext({ maxLength: 3000 });
          } catch { /* Gemini not available */ }
        }

        const systemPrompt = `You are Olympus Codex — the user's personal AI assistant.
You execute tasks in the user's local computer environment,
helping with work and daily productivity.

The user's environment may be macOS / Windows / Linux.
Always act naturally according to the context.

---

## Language Policy (CRITICAL)

- ALL internal operations MUST be in English: thinking, reasoning, inter-agent communication, context storage, system messages, logs.
- ONLY user-facing responses MUST be in Korean: direct replies to user in chat (Telegram, CLI terminal).
- When responding to the user, use friendly and concise Korean.

---

## Role Separation

- Codex handles most tasks directly.
- Claude workers handle ONLY **coding/development tasks**
  (code writing, builds, tests, refactoring, etc.)

---

## Response Mode Rules (Most Important)

Codex first classifies requests into 2 modes:

### 1) Casual Mode (default)

These are Casual Mode requests:
- Simple questions
- Light conversation
- Concept explanations
- Short information requests

In this case:
- Answer briefly and naturally.
- Do NOT use unnecessary step summaries or report-style language.
- NEVER prepend formats like "Request Summary / Task Decision / Next Action".

Example tone (in Korean):
"그건 'gpt-5.3-codex'가 기본이에요."
"응, 그거 이렇게 하면 돼요."

---

### 2) Execution Mode (only for execution tasks)

These trigger Execution Mode:
- File/folder operations
- System configuration changes
- App execution
- Automation execution
- Development/coding tasks

Only in this case, follow the execution process:

1) Execute or delegate
2) Report key results briefly after completion
3) Suggest next actions only when necessary

---

## Worker Guide

When the user mentions \`@workerName command\`, delegate the task to that worker.
When worker task completes, summarize the result and deliver to the user.

For coding/development requests:
- If workers are available: automatically delegate to the appropriate worker
- If no workers: advise user to start one with \`olympus start\`

${workers.length > 0 ? 'Current workers: ' + workers.map(w => `@${w.name}`).join(', ') : ''}

---

## Tasks Codex Handles Directly

- Conversation, Q&A, brainstorming
- Information search, summarization, translation
- Simple calculations, concept explanations

---

## Safety Rules

- Never request passwords/OTP
- When uncertain, confirm before proceeding

---

## Execution Mode Result Reporting (only when needed)

Only after execution tasks, report briefly:

✅ 완료: …
📌 참고: …
➡️ 다음: (only when truly needed)

---

## Tone

- Respond to users in Korean, friendly and concise
- No excessive report-style language
- Structure only when necessary

## Current State
- Worker sessions: ${workers.length > 0 ? workers.length + ' active' : 'none (need olympus start)'}
${workers.length > 0 ? '- Worker list:\n' + workerListStr : ''}${projectContextStr}${geminiContextStr}`;

        // @mention detection → worker delegation
        const mentionMatch = body.message.match(/^@(\S+)\s+([\s\S]+)/);
        if (mentionMatch && workerRegistry) {
          const [, workerName, taskPrompt] = mentionMatch;
          const worker = workers.find(w => w.name === workerName);

          if (worker && worker.status !== 'busy') {
            // Assign task to worker
            const task = workerRegistry.createTask(worker.id, taskPrompt.trim(), body.chatId);
            onWorkerEvent?.('worker:task:assigned', {
              taskId: task.taskId,
              workerId: worker.id,
              workerName: worker.name,
              prompt: taskPrompt.trim(),
              provider: 'claude',
              dangerouslySkipPermissions: true,
              projectPath: worker.projectPath,
              chatId: body.chatId,
            });

            // Inform Codex of delegation to generate response
            try {
              const { runCli } = await import('./cli-runner.js');
              const delegationPrompt = `### SYSTEM\n${systemPrompt}\n\n### USER\nThe user requested the following task for @${worker.name} worker, and the task has been assigned: "${taskPrompt.trim()}"\nWorker project: ${worker.projectPath}\nBriefly inform the user that the task has started.`;
              const result = await runCli({
                prompt: delegationPrompt,
                provider: 'codex',
                model: 'gpt-5.3-codex',
                dangerouslySkipPermissions: true,
                timeoutMs: 30_000,
              });
              sendJson(res, 200, { type: 'delegation', taskId: task.taskId, response: result.success ? result.text : `@${worker.name}에 작업을 할당했습니다.` });
            } catch {
              sendJson(res, 200, { type: 'delegation', taskId: task.taskId, response: `@${worker.name}에 작업을 할당했습니다.` });
            }
            return;
          } else if (worker && worker.status === 'busy') {
            // Worker busy — inform Codex of the situation
            try {
              const { runCli } = await import('./cli-runner.js');
              const busyPrompt = `### SYSTEM\n${systemPrompt}\n\n### USER\nThe user requested a task for @${worker.name} worker, but the worker is currently busy with another task.\nCurrent task: ${worker.currentTaskPrompt ?? 'unknown'}\nPlease inform the user of the situation.`;
              const result = await runCli({
                prompt: busyPrompt,
                provider: 'codex',
                model: 'gpt-5.3-codex',
                dangerouslySkipPermissions: true,
                timeoutMs: 30_000,
              });
              sendJson(res, 200, { type: 'chat', response: result.success ? result.text : `@${worker.name} 워커가 현재 작업 중입니다.` });
            } catch {
              sendJson(res, 200, { type: 'chat', response: `@${worker.name} 워커가 현재 작업 중입니다.` });
            }
            return;
          }
          // worker not found — fall through to normal Codex chat
        }

        try {
          const { runCli } = await import('./cli-runner.js');
          const combinedPrompt = `### SYSTEM\n${systemPrompt}\n\n### USER\n${body.message}`;
          const result = await runCli({
            prompt: combinedPrompt,
            provider: 'codex',
            model: 'gpt-5.3-codex',
            dangerouslySkipPermissions: true,
            timeoutMs: 1_800_000,  // 30 min — large doc summarization and long-running tasks
          });

          if (!result.success) {
            console.error('[codex/chat] runCli failed:', JSON.stringify(result.error), 'text:', result.text?.slice(0, 200));
            sendJson(res, 200, { type: 'chat', response: '죄송합니다. 잠시 후 다시 시도해주세요.' });
            return;
          }

          sendJson(res, 200, { type: 'chat', response: result.text });
        } catch (err) {
          sendJson(res, 500, { error: 'Chat failed', message: (err as Error).message });
        }
        return;
      }

      // POST /api/codex/summarize — lightweight summarization (Claude Haiku, fast response)
      if (path === '/api/codex/summarize' && method === 'POST') {
        const body = await parseBody<{ text: string; workerName?: string }>(req);
        if (!body.text) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }

        try {
          const { runCli } = await import('./cli-runner.js');
          const prompt = `Summarize the following work result from "${body.workerName ?? 'Worker'}" concisely. Key outcomes only, no greetings or extra explanations. Respond in Korean.\n\n---\n${body.text.slice(0, 4000)}`;
          const result = await runCli({
            prompt,
            provider: 'codex',
            model: 'gpt-5.3-codex',
            dangerouslySkipPermissions: true,
            timeoutMs: 30_000,
          });

          sendJson(res, 200, { summary: result.success ? result.text : body.text });
        } catch (err) {
          // On failure, return original text
          sendJson(res, 200, { summary: body.text });
        }
        return;
      }

      // ── CLI Runner endpoints ──

      // POST /api/cli/run — synchronous CLI execution
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

        // Session restore: sessionKey → store lookup → resumeSession=true
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

        // Persist session
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

        // Save result to memory (async, ignore failures)
        if (memoryStore && result.success) {
          try {
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
          } catch { /* save failure — response still OK */ }
        }

        // Save worker context to LocalContextStore
        if (localContextManager && body.workspaceDir) {
          try {
            const extracted = extractContext(result, body.prompt!);
            const store = await localContextManager.getProjectStore(body.workspaceDir);
            store.saveWorkerContext({
              id: randomUUID(),
              workerId: 'cli-direct',
              workerName: 'cli',
              prompt: body.prompt!.slice(0, 500),
              success: result.success,
              summary: extracted.summary,
              filesChanged: extracted.filesChanged,
              decisions: extracted.decisions,
              errors: extracted.errors,
              dependencies: extracted.dependencies,
              model: result.model,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              costUsd: result.cost,
              durationMs: result.durationMs,
              numTurns: result.numTurns,
              rawText: result.text.slice(0, 8000),
              createdAt: new Date().toISOString(),
            });
            store.updateProjectContext();
            await localContextManager.propagateToRoot(body.workspaceDir, process.cwd());
          } catch { /* save failure — response still OK */ }
        }

        onCliComplete?.(result);
        sendJson(res, 200, { result });
        return;
      }

      // POST /api/cli/run/async — async CLI execution (returns taskId immediately)
      if (path === '/api/cli/run/async' && method === 'POST') {
        const body = await parseBody<Record<string, unknown>>(req);
        if (!body.prompt) {
          sendJson(res, 400, { error: 'Bad Request', message: 'prompt is required' });
          return;
        }

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

        // Restore session
        if (body.sessionKey && cliSessionStore) {
          const existing = cliSessionStore.get(body.sessionKey as string);
          if (existing) {
            params.sessionId = existing.cliSessionId;
            params.resumeSession = true;
          }
        }

        asyncTasks.set(taskId, { status: 'running', startedAt: Date.now() });

        // Background execution
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

        // Auto-cleanup after 1 hour
        setTimeout(() => asyncTasks.delete(taskId), 3_600_000);

        sendJson(res, 202, { taskId, status: 'running' });
        return;
      }

      // GET /api/cli/run/:id/status — async task status query
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

      // GET /api/cli/sessions — list saved CLI sessions
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

      // DELETE /api/cli/sessions/:id — delete CLI session
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

      // ── Codex Router Endpoint ──

      // POST /api/codex/route — Codex Orchestrator routing
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

      // ============ Local Context API ============

      // GET /api/local-context/projects — root-level project contexts
      if (path === '/api/local-context/projects' && method === 'GET') {
        if (!localContextManager) {
          sendJson(res, 503, { error: 'Local context not available' });
          return;
        }
        try {
          const rootStore = await localContextManager.getRootStore(process.cwd());
          const projects = rootStore.getAllProjects();
          sendJson(res, 200, { projects });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }

      // GET /api/local-context/:id/summary — aggregated project context
      if (path === '/api/local-context/:id/summary' && method === 'GET' && id) {
        if (!localContextManager) {
          sendJson(res, 503, { error: 'Local context not available' });
          return;
        }
        try {
          const projectPath = decodeURIComponent(id);
          if (projectPath.includes('..')) {
            sendJson(res, 400, { error: 'Invalid path' });
            return;
          }
          const store = await localContextManager.getProjectStore(projectPath);
          const ctx = store.getProjectContext();
          sendJson(res, 200, { context: ctx });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }

      // GET /api/local-context/:id/workers — worker context list
      if (path === '/api/local-context/:id/workers' && method === 'GET' && id) {
        if (!localContextManager) {
          sendJson(res, 503, { error: 'Local context not available' });
          return;
        }
        try {
          const projectPath = decodeURIComponent(id);
          if (projectPath.includes('..')) {
            sendJson(res, 400, { error: 'Invalid path' });
            return;
          }
          const limit = Number(query?.limit) || 20;
          const store = await localContextManager.getProjectStore(projectPath);
          const workers = store.getRecentWorkerContexts(limit);
          sendJson(res, 200, { workers });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }

      // GET /api/local-context/:id/injection — context for injection
      if (path === '/api/local-context/:id/injection' && method === 'GET' && id) {
        if (!localContextManager) {
          sendJson(res, 503, { error: 'Local context not available' });
          return;
        }
        try {
          const projectPath = decodeURIComponent(id);
          if (projectPath.includes('..')) {
            sendJson(res, 400, { error: 'Invalid path' });
            return;
          }
          const maxTokens = Number(query?.maxTokens) || 2000;
          const store = await localContextManager.getProjectStore(projectPath);
          const injection = store.buildContextInjection({ maxTokens });
          sendJson(res, 200, { injection });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }

      // ============ Gemini Advisor API ============

      // GET /api/gemini-advisor/status
      if (path === '/api/gemini-advisor/status' && method === 'GET') {
        if (!geminiAdvisor) {
          sendJson(res, 200, { running: false, behavior: 'offline', cacheSize: 0 });
          return;
        }
        sendJson(res, 200, geminiAdvisor.getStatus());
        return;
      }

      // GET /api/gemini-advisor/projects — cached project analysis list
      if (path === '/api/gemini-advisor/projects' && method === 'GET') {
        if (!geminiAdvisor) {
          sendJson(res, 200, { projects: [] });
          return;
        }
        sendJson(res, 200, { projects: geminiAdvisor.getAllCachedAnalyses() });
        return;
      }

      // GET /api/gemini-advisor/projects/:encodedPath — specific project analysis
      if (path === '/api/gemini-advisor/projects/:id' && method === 'GET' && id) {
        if (!geminiAdvisor) {
          sendJson(res, 503, { error: 'Gemini Advisor not available' });
          return;
        }
        const projectPath = decodeURIComponent(id);
        const analysis = geminiAdvisor.getCachedAnalysis(projectPath);
        if (!analysis) {
          sendJson(res, 404, { error: 'Analysis not found for this project' });
          return;
        }
        sendJson(res, 200, { analysis });
        return;
      }

      // POST /api/gemini-advisor/refresh — manual full refresh
      if (path === '/api/gemini-advisor/refresh' && method === 'POST') {
        if (!geminiAdvisor) {
          sendJson(res, 503, { error: 'Gemini Advisor not available' });
          return;
        }
        geminiAdvisor.analyzeAllProjects().catch(() => {});
        sendJson(res, 202, { status: 'refresh_started' });
        return;
      }

      // POST /api/gemini-advisor/analyze/:encodedPath — immediate project analysis
      if (path === '/api/gemini-advisor/analyze/:id' && method === 'POST' && id) {
        if (!geminiAdvisor) {
          sendJson(res, 503, { error: 'Gemini Advisor not available' });
          return;
        }
        const projectPath = decodeURIComponent(id);
        try {
          const body = await parseBody<{ name?: string }>(req);
          const projectName = body.name ?? projectPath.split('/').pop() ?? 'unknown';
          const analysis = await geminiAdvisor.analyzeProject(projectPath, projectName);
          sendJson(res, 200, { analysis });
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
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
