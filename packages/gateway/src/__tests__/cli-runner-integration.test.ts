/**
 * CLI Runner Integration Tests
 *
 * 단위 테스트(cli-runner.test.ts)와 중복되지 않는 통합 관점 테스트.
 * 실제 CLI 프로세스를 실행하지 않고, 모듈 간 상호작용을 검증한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCliArgs, parseClaudeJson, classifyError, enqueueCliRun, runCli, setMaxConcurrentCli } from '../cli-runner.js';
import { CliSessionStore } from '../cli-session-store.js';
import type { CliRunParams, CliBackendConfig, CliRunResult, AgentEvent, CliSessionRecord } from '@olympus-dev/protocol';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ──────────────────────────────────────────────
// 1. Sync CLI Run Flow (POST /api/cli/run 관점)
// ──────────────────────────────────────────────

describe('Sync CLI Run Flow', () => {
  it('should require prompt in CliRunParams', () => {
    // runCli는 prompt가 빈 문자열이라도 실행을 시도함 (validation은 API 레벨)
    // 하지만 빈 프롬프트로도 CliRunResult 구조는 유지되어야 함
    const params: CliRunParams = { prompt: '' };
    // buildCliArgs에서 빈 문자열이 마지막 인자로 들어감
    const backend: CliBackendConfig = {
      name: 'claude',
      command: 'claude',
      baseArgs: ['-p', '--output-format', 'json'],
      resumeFlag: '--resume',
      sessionIdFlag: '--session-id',
      modelFlag: '--model',
      systemPromptFlag: '--append-system-prompt',
      skipPermissionsFlag: '--dangerously-skip-permissions',
    };
    const args = buildCliArgs(params, backend);
    expect(args[args.length - 1]).toBe('');
    expect(args).toEqual(['-p', '--output-format', 'json', '']);
  });

  it('should default provider to claude in buildCliArgs', () => {
    // provider 생략 시 → 'claude' 기본값 확인 (runCli 내부 로직)
    // runCli를 직접 호출하면 spawn이 발생하므로 buildCliArgs로 간접 검증
    const backend: CliBackendConfig = {
      name: 'claude',
      command: 'claude',
      baseArgs: ['-p', '--output-format', 'json'],
      resumeFlag: '--resume',
      sessionIdFlag: '--session-id',
      modelFlag: '--model',
      systemPromptFlag: '--append-system-prompt',
      skipPermissionsFlag: '--dangerously-skip-permissions',
    };
    const args = buildCliArgs({ prompt: 'hello' }, backend);
    expect(args).toEqual(['-p', '--output-format', 'json', 'hello']);
  });

  it('should return well-formed CliRunResult on unknown provider', async () => {
    const result = await runCli({ prompt: 'test', provider: 'nonexistent' as 'claude' });
    expect(result).toMatchObject({
      success: false,
      text: '',
      sessionId: '',
      model: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      cost: 0,
      durationMs: 0,
      numTurns: 0,
    });
    expect(result.error).toBeDefined();
    expect(result.error!.type).toBe('spawn_error');
  });

  it('should parse CliRunResult from Claude JSON and map to camelCase fields', () => {
    const rawJson = JSON.stringify({
      result: '결과입니다',
      session_id: 'sess-integration-1',
      is_error: false,
      total_cost_usd: 0.12,
      num_turns: 3,
      duration_ms: 5000,
      duration_api_ms: 4200,
      usage: {
        input_tokens: 500,
        output_tokens: 200,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 800,
      },
    });

    const parsed = parseClaudeJson(rawJson);

    // CliRunResult 매핑 시뮬레이션 (api.ts의 runCli 성공 분기와 동일 로직)
    const mapped: CliRunResult = {
      success: !parsed.is_error,
      text: parsed.result,
      sessionId: parsed.session_id,
      model: '',
      usage: {
        inputTokens: parsed.usage.input_tokens,
        outputTokens: parsed.usage.output_tokens,
        cacheCreationTokens: parsed.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: parsed.usage.cache_read_input_tokens ?? 0,
      },
      cost: parsed.total_cost_usd,
      durationMs: parsed.duration_ms,
      numTurns: parsed.num_turns,
    };

    expect(mapped.success).toBe(true);
    expect(mapped.text).toBe('결과입니다');
    expect(mapped.sessionId).toBe('sess-integration-1');
    expect(mapped.usage.inputTokens).toBe(500);
    expect(mapped.usage.cacheCreationTokens).toBe(1000);
    expect(mapped.cost).toBe(0.12);
    expect(mapped.numTurns).toBe(3);
  });
});

// ──────────────────────────────────────────────
// 2. Session Persistence (CliSessionStore)
// ──────────────────────────────────────────────

describe('Session Persistence', () => {
  let store: CliSessionStore;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `olympus-integ-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new CliSessionStore(dbPath);
    await store.initialize();
  });

  afterEach(() => {
    try { store.close(); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('should save and retrieve with correct field mapping', () => {
    const now = Date.now();
    const record: CliSessionRecord = {
      key: 'integ-sess-1',
      provider: 'claude',
      cliSessionId: 'cli-sess-abc',
      model: 'sonnet-4',
      lastPrompt: '안녕하세요',
      lastResponse: '반갑습니다',
      totalInputTokens: 150,
      totalOutputTokens: 75,
      totalCostUsd: 0.08,
      turnCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    store.save(record);
    const retrieved = store.get('integ-sess-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.key).toBe('integ-sess-1');
    expect(retrieved!.provider).toBe('claude');
    expect(retrieved!.cliSessionId).toBe('cli-sess-abc');
    expect(retrieved!.model).toBe('sonnet-4');
    expect(retrieved!.lastPrompt).toBe('안녕하세요');
    expect(retrieved!.lastResponse).toBe('반갑습니다');
    expect(retrieved!.totalInputTokens).toBe(150);
    expect(retrieved!.totalOutputTokens).toBe(75);
    expect(retrieved!.totalCostUsd).toBeCloseTo(0.08);
    expect(retrieved!.turnCount).toBe(1);
  });

  it('should accumulate tokens and cost on ON CONFLICT UPDATE', () => {
    const now = Date.now();
    const base: CliSessionRecord = {
      key: 'accum-integ',
      provider: 'codex',
      cliSessionId: 'thread-xyz',
      model: 'o3',
      lastPrompt: '첫 번째',
      lastResponse: '첫 응답',
      totalInputTokens: 100,
      totalOutputTokens: 40,
      totalCostUsd: 0.05,
      turnCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    store.save(base);

    // 두 번째 save — 누적
    store.save({
      ...base,
      lastPrompt: '두 번째',
      lastResponse: '두 번째 응답',
      totalInputTokens: 200,
      totalOutputTokens: 80,
      totalCostUsd: 0.10,
      turnCount: 1,
      updatedAt: now + 5000,
    });

    const record = store.get('accum-integ');
    expect(record).not.toBeNull();
    expect(record!.totalInputTokens).toBe(300);   // 100 + 200
    expect(record!.totalOutputTokens).toBe(120);   // 40 + 80
    expect(record!.totalCostUsd).toBeCloseTo(0.15); // 0.05 + 0.10
    expect(record!.turnCount).toBe(2);              // 1 + 1
    expect(record!.lastPrompt).toBe('두 번째');     // 최신으로 갱신
    expect(record!.lastResponse).toBe('두 번째 응답');
  });

  it('should list with provider filter', () => {
    const now = Date.now();
    store.save({
      key: 'filter-claude', provider: 'claude', cliSessionId: 'c1',
      model: '', lastPrompt: '', lastResponse: '',
      totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0,
      turnCount: 1, createdAt: now, updatedAt: now,
    });
    store.save({
      key: 'filter-codex', provider: 'codex', cliSessionId: 'x1',
      model: '', lastPrompt: '', lastResponse: '',
      totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0,
      turnCount: 1, createdAt: now, updatedAt: now,
    });

    const all = store.list(undefined, 100);
    expect(all.length).toBe(2);

    const claudeOnly = store.list('claude', 100);
    expect(claudeOnly.length).toBe(1);
    expect(claudeOnly[0].provider).toBe('claude');

    const codexOnly = store.list('codex', 100);
    expect(codexOnly.length).toBe(1);
    expect(codexOnly[0].provider).toBe('codex');
  });

  it('should handle getByCliSessionId lookup', () => {
    const now = Date.now();
    store.save({
      key: 'lookup-test', provider: 'claude', cliSessionId: 'unique-cli-sid',
      model: 'opus', lastPrompt: 'p', lastResponse: 'r',
      totalInputTokens: 10, totalOutputTokens: 5, totalCostUsd: 0.01,
      turnCount: 1, createdAt: now, updatedAt: now,
    });

    const byKey = store.get('lookup-test');
    const byCliId = store.getByCliSessionId('unique-cli-sid');
    expect(byKey).not.toBeNull();
    expect(byCliId).not.toBeNull();
    expect(byKey!.key).toBe(byCliId!.key);
    expect(byCliId!.cliSessionId).toBe('unique-cli-sid');
  });
});

// ──────────────────────────────────────────────
// 3. Timeout Handling
// ──────────────────────────────────────────────

describe('Timeout Handling', () => {
  it('should classify timeout when timedOut=true regardless of other params', () => {
    expect(classifyError(null, '', true)).toBe('timeout');
    expect(classifyError(0, '', true)).toBe('timeout');
    expect(classifyError(1, 'some error', true)).toBe('timeout');
    expect(classifyError(137, 'SIGKILL', true)).toBe('timeout');
  });

  it('should prioritize timeout over other error indicators', () => {
    // timeout + rate limit message → timeout wins
    expect(classifyError(1, 'Rate limit exceeded', true)).toBe('timeout');
    // timeout + permission denied → timeout wins
    expect(classifyError(1, 'Permission denied', true)).toBe('timeout');
    // timeout + exit code 127 → timeout wins
    expect(classifyError(127, '', true)).toBe('timeout');
  });

  it('should integrate with CliRunResult error structure', () => {
    const errorType = classifyError(null, '', true);
    // API에서 timeout 에러 → CliRunResult.error 구조에 매핑
    const errorResult: CliRunResult = {
      success: false,
      text: '',
      sessionId: '',
      model: '',
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0,
      durationMs: 300000,
      numTurns: 0,
      error: { type: errorType, message: 'Process timed out after 300000ms' },
    };

    expect(errorResult.error!.type).toBe('timeout');
    expect(errorResult.success).toBe(false);
    expect(errorResult.durationMs).toBe(300000);
  });
});

// ──────────────────────────────────────────────
// 4. ConcurrencyLimiter Integration
// ──────────────────────────────────────────────

describe('ConcurrencyLimiter Integration', () => {
  afterEach(() => {
    setMaxConcurrentCli(5); // restore default
  });

  it('should respect maxConcurrent limit across all requests', async () => {
    setMaxConcurrentCli(2);

    let running = 0;
    let maxRunning = 0;
    const timeline: string[] = [];

    const task = (name: string, delayMs: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, delayMs));
      timeline.push(name);
      running--;
    };

    await Promise.all([
      enqueueCliRun('integ-alpha', task('alpha-1', 80)),
      enqueueCliRun('integ-alpha', task('alpha-2', 10)),
      enqueueCliRun('integ-beta', task('beta-1', 30)),
    ]);

    // 최대 동시 실행이 2 이하
    expect(maxRunning).toBeLessThanOrEqual(2);
    // 3개 모두 완료
    expect(timeline).toHaveLength(3);
  });

  it('should serialize all requests when maxConcurrent=1', async () => {
    setMaxConcurrentCli(1);

    const results: string[] = [];

    const providers = ['integ-q1', 'integ-q2', 'integ-q3'];
    const promises: Promise<void>[] = [];

    for (const p of providers) {
      promises.push(
        enqueueCliRun(p, async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push(`${p}-1`);
        }),
      );
      promises.push(
        enqueueCliRun(p, async () => {
          results.push(`${p}-2`);
        }),
      );
    }

    await Promise.all(promises);

    // maxConcurrent=1이므로 enqueue 순서대로 실행됨
    expect(results).toEqual([
      'integ-q1-1', 'integ-q1-2',
      'integ-q2-1', 'integ-q2-2',
      'integ-q3-1', 'integ-q3-2',
    ]);
  });

  it('should recover queue after failure in middle of chain', async () => {
    const results: number[] = [];

    const p1 = enqueueCliRun('integ-recover', async () => {
      results.push(1);
      return 1;
    });
    const p2 = enqueueCliRun('integ-recover', async () => {
      results.push(2);
      throw new Error('boom');
    });
    const p3 = enqueueCliRun('integ-recover', async () => {
      results.push(3);
      return 3;
    });

    expect(await p1).toBe(1);
    await expect(p2).rejects.toThrow('boom');
    expect(await p3).toBe(3);
    expect(results).toEqual([1, 2, 3]);
  });
});

// ──────────────────────────────────────────────
// 5. Async CLI API (URL 파싱 + asyncTasks 동작)
// ──────────────────────────────────────────────

describe('Async CLI API', () => {
  // parseRoute는 export되지 않으므로 URL 구조를 직접 분해하여 테스트

  function parseCliRoute(url: string): { path: string; id?: string } {
    const urlObj = new URL(url, 'http://localhost');
    const parts = urlObj.pathname.split('/').filter(Boolean);

    if (parts[0] === 'api' && parts[1] === 'cli') {
      if (parts[2] === 'run') {
        if (parts[3] === 'async') {
          return { path: '/api/cli/run/async' };
        }
        if (parts[3] && parts[4] === 'status') {
          return { path: '/api/cli/run/:id/status', id: parts[3] };
        }
        return { path: '/api/cli/run' };
      }
      if (parts[2] === 'sessions') {
        if (parts[3]) {
          return { path: '/api/cli/sessions/:id', id: parts[3] };
        }
        return { path: '/api/cli/sessions' };
      }
    }
    return { path: urlObj.pathname };
  }

  it('should parse /api/cli/run/async correctly', () => {
    const route = parseCliRoute('/api/cli/run/async');
    expect(route.path).toBe('/api/cli/run/async');
    expect(route.id).toBeUndefined();
  });

  it('should parse /api/cli/run/:id/status with task ID', () => {
    const taskId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const route = parseCliRoute(`/api/cli/run/${taskId}/status`);
    expect(route.path).toBe('/api/cli/run/:id/status');
    expect(route.id).toBe(taskId);
  });

  it('should parse /api/cli/run as sync endpoint', () => {
    const route = parseCliRoute('/api/cli/run');
    expect(route.path).toBe('/api/cli/run');
    expect(route.id).toBeUndefined();
  });

  it('should parse /api/cli/sessions/:id for delete', () => {
    const route = parseCliRoute('/api/cli/sessions/my-session-key');
    expect(route.path).toBe('/api/cli/sessions/:id');
    expect(route.id).toBe('my-session-key');
  });

  it('should simulate asyncTasks Map lifecycle (set → get → delete)', () => {
    // api.ts의 asyncTasks Map 동작 시뮬레이션
    type AsyncTask = {
      status: 'running' | 'completed' | 'failed';
      result?: CliRunResult;
      error?: string;
      startedAt: number;
    };

    const asyncTasks = new Map<string, AsyncTask>();
    const taskId = 'test-uuid-123';

    // 1. 생성: running 상태
    asyncTasks.set(taskId, { status: 'running', startedAt: Date.now() });
    expect(asyncTasks.get(taskId)!.status).toBe('running');

    // 2. 완료: completed + result
    const mockResult: CliRunResult = {
      success: true,
      text: '비동기 결과',
      sessionId: 'async-sess-1',
      model: '',
      usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0.05,
      durationMs: 2000,
      numTurns: 1,
    };
    asyncTasks.set(taskId, {
      status: 'completed',
      result: mockResult,
      startedAt: asyncTasks.get(taskId)!.startedAt,
    });
    expect(asyncTasks.get(taskId)!.status).toBe('completed');
    expect(asyncTasks.get(taskId)!.result!.text).toBe('비동기 결과');

    // 3. TTL 정리
    asyncTasks.delete(taskId);
    expect(asyncTasks.get(taskId)).toBeUndefined();
  });

  it('should handle failed async task state', () => {
    type AsyncTask = {
      status: 'running' | 'completed' | 'failed';
      result?: CliRunResult;
      error?: string;
      startedAt: number;
    };

    const asyncTasks = new Map<string, AsyncTask>();
    const taskId = 'fail-uuid-456';

    asyncTasks.set(taskId, { status: 'running', startedAt: Date.now() });
    asyncTasks.set(taskId, {
      status: 'failed',
      error: 'Process timed out',
      startedAt: asyncTasks.get(taskId)!.startedAt,
    });

    const task = asyncTasks.get(taskId)!;
    expect(task.status).toBe('failed');
    expect(task.error).toBe('Process timed out');
    expect(task.result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// 5.1. Codex Route URL Parsing
// ──────────────────────────────────────────────

describe('Codex Route URL Parsing', () => {
  // api.ts의 parseRoute에서 /api/codex/route 분기를 재현
  function parseCodexRoute(url: string): { path: string; query: Record<string, string> } {
    const urlObj = new URL(url, 'http://localhost');
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    if (parts[0] === 'api' && parts[1] === 'codex' && parts[2] === 'route') {
      return { path: '/api/codex/route', query };
    }
    return { path: urlObj.pathname, query };
  }

  it('should parse /api/codex/route correctly', () => {
    const route = parseCodexRoute('/api/codex/route');
    expect(route.path).toBe('/api/codex/route');
  });

  it('should parse /api/codex/route with query params', () => {
    const route = parseCodexRoute('/api/codex/route?source=telegram');
    expect(route.path).toBe('/api/codex/route');
    expect(route.query.source).toBe('telegram');
  });

  it('should not match /api/codex without route suffix', () => {
    const route = parseCodexRoute('/api/codex');
    expect(route.path).toBe('/api/codex');
  });

  it('should not match /api/codex/sessions', () => {
    const route = parseCodexRoute('/api/codex/sessions');
    expect(route.path).toBe('/api/codex/sessions');
  });
});

// ──────────────────────────────────────────────
// 6. WebSocket Event Structure
// ──────────────────────────────────────────────

describe('WebSocket Event Structure', () => {
  it('should validate AgentEvent agent:start structure', () => {
    const event: AgentEvent = {
      type: 'agent:start',
      sessionKey: 'ws-sess-1',
      prompt: '테스트 프롬프트',
    };
    expect(event.type).toBe('agent:start');
    expect(event.sessionKey).toBe('ws-sess-1');
    expect(event.prompt).toBe('테스트 프롬프트');
  });

  it('should validate AgentEvent agent:complete with CliRunResult', () => {
    const result: CliRunResult = {
      success: true,
      text: 'WS 응답',
      sessionId: 'sess-ws-complete',
      model: 'sonnet',
      usage: { inputTokens: 200, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0.03,
      durationMs: 1500,
      numTurns: 1,
    };

    const event: AgentEvent = {
      type: 'agent:complete',
      sessionKey: 'ws-sess-1',
      result,
    };

    expect(event.type).toBe('agent:complete');
    expect(event.result.success).toBe(true);
    expect(event.result.text).toBe('WS 응답');
    expect(event.result.usage.inputTokens).toBe(200);
  });

  it('should validate AgentEvent agent:error structure', () => {
    const event: AgentEvent = {
      type: 'agent:error',
      sessionKey: 'ws-sess-1',
      error: 'CLI spawn failed: command not found',
    };
    expect(event.type).toBe('agent:error');
    expect(event.error).toContain('spawn failed');
  });

  it('should map CliRunResult to agent:complete for broadcast', () => {
    // server.ts의 cli:complete → agent:complete 매핑 시뮬레이션
    const cliResult: CliRunResult = {
      success: false,
      text: '',
      sessionId: '',
      model: '',
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0,
      durationMs: 5000,
      numTurns: 0,
      error: { type: 'timeout', message: 'Process timed out' },
    };

    // 실패 결과도 agent:complete로 브로드캐스트됨 (success=false)
    const event: AgentEvent = {
      type: 'agent:complete',
      sessionKey: 'timeout-session',
      result: cliResult,
    };

    expect(event.result.success).toBe(false);
    expect(event.result.error!.type).toBe('timeout');
  });
});

// ──────────────────────────────────────────────
// 7. MemoryStore Integration
// ──────────────────────────────────────────────

describe('MemoryStore Integration', () => {
  it('should call saveTask when memoryStore is provided and result is success', () => {
    // api.ts의 memoryStore 연동 로직 시뮬레이션
    const mockSaveTask = vi.fn();
    const memoryStore = { saveTask: mockSaveTask } as unknown as { saveTask: (task: unknown) => void };

    const result: CliRunResult = {
      success: true,
      text: '메모리 저장 테스트',
      sessionId: 'mem-sess-1',
      model: '',
      usage: { inputTokens: 50, outputTokens: 25, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0.02,
      durationMs: 1000,
      numTurns: 1,
    };

    // api.ts 로직 재현
    if (memoryStore && result.success) {
      memoryStore.saveTask({
        id: 'test-uuid',
        command: 'test prompt',
        analysis: '',
        plan: '',
        result: result.text.slice(0, 2000),
        success: result.success,
        duration: result.durationMs ?? 0,
        timestamp: Date.now(),
        projectPath: '/test/workspace',
        workerCount: 0,
      });
    }

    expect(mockSaveTask).toHaveBeenCalledOnce();
    expect(mockSaveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'test prompt',
        result: '메모리 저장 테스트',
        success: true,
        projectPath: '/test/workspace',
      }),
    );
  });

  it('should not call saveTask when result is failure', () => {
    const mockSaveTask = vi.fn();
    const memoryStore = { saveTask: mockSaveTask } as unknown as { saveTask: (task: unknown) => void };

    const result: CliRunResult = {
      success: false,
      text: '',
      sessionId: '',
      model: '',
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0,
      durationMs: 500,
      numTurns: 0,
      error: { type: 'spawn_error', message: 'command not found' },
    };

    // api.ts: if (memoryStore && result.success) → 실패 시 저장 안 함
    if (memoryStore && result.success) {
      memoryStore.saveTask({ id: 'x' });
    }

    expect(mockSaveTask).not.toHaveBeenCalled();
  });

  it('should not throw when memoryStore is null', () => {
    const memoryStore = null;
    const result: CliRunResult = {
      success: true,
      text: '결과',
      sessionId: '',
      model: '',
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0,
      durationMs: 0,
      numTurns: 0,
    };

    // null 체크로 에러 없이 통과
    expect(() => {
      if (memoryStore && result.success) {
        (memoryStore as unknown as { saveTask: () => void }).saveTask();
      }
    }).not.toThrow();
  });

  it('should truncate long text before saving to memory', () => {
    const mockSaveTask = vi.fn();
    const memoryStore = { saveTask: mockSaveTask } as unknown as { saveTask: (task: unknown) => void };

    const longText = 'A'.repeat(5000);
    const result: CliRunResult = {
      success: true,
      text: longText,
      sessionId: 'long-text-sess',
      model: '',
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      cost: 0,
      durationMs: 0,
      numTurns: 1,
    };

    if (memoryStore && result.success) {
      memoryStore.saveTask({
        id: 'trunc-uuid',
        command: 'long prompt',
        analysis: '',
        plan: '',
        result: result.text.slice(0, 2000),
        success: result.success,
        duration: result.durationMs ?? 0,
        timestamp: Date.now(),
        projectPath: '',
        workerCount: 0,
      });
    }

    const savedResult = mockSaveTask.mock.calls[0][0].result;
    expect(savedResult.length).toBe(2000);
  });
});
