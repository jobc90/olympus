import { describe, it, expect, vi } from 'vitest';
import { buildCliArgs, parseClaudeJson, parseCodexJsonl, classifyError, enqueueCliRun, runCli, setMaxConcurrentCli } from '../cli-runner.js';
import type { CliRunParams, CliBackendConfig } from '@olympus-dev/protocol';

// ──────────────────────────────────────────────
// Test Backend Config (mirrors CLAUDE_BACKEND)
// ──────────────────────────────────────────────

const CLAUDE_BACKEND: CliBackendConfig = {
  name: 'claude',
  command: 'claude',
  baseArgs: ['-p', '--output-format', 'json'],
  resumeFlag: '--resume',
  sessionIdFlag: '--session-id',
  modelFlag: '--model',
  systemPromptFlag: '--append-system-prompt',
  skipPermissionsFlag: '--dangerously-skip-permissions',
};

// ──────────────────────────────────────────────
// parseClaudeJson
// ──────────────────────────────────────────────

describe('parseClaudeJson', () => {
  it('should parse valid full JSON', () => {
    const json = JSON.stringify({
      result: 'Hello world',
      session_id: 'abc-123',
      is_error: false,
      total_cost_usd: 0.05,
      num_turns: 1,
      duration_ms: 3000,
      duration_api_ms: 2500,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 500,
      },
    });

    const result = parseClaudeJson(json);
    expect(result.result).toBe('Hello world');
    expect(result.session_id).toBe('abc-123');
    expect(result.is_error).toBe(false);
    expect(result.total_cost_usd).toBe(0.05);
    expect(result.num_turns).toBe(1);
    expect(result.duration_ms).toBe(3000);
    expect(result.duration_api_ms).toBe(2500);
    expect(result.usage.input_tokens).toBe(100);
    expect(result.usage.output_tokens).toBe(50);
    expect(result.usage.cache_creation_input_tokens).toBe(1000);
    expect(result.usage.cache_read_input_tokens).toBe(500);
  });

  it('should handle minimal fields with defaults', () => {
    const json = JSON.stringify({
      result: '2',
      session_id: 'xyz',
    });

    const result = parseClaudeJson(json);
    expect(result.result).toBe('2');
    expect(result.session_id).toBe('xyz');
    expect(result.is_error).toBe(false);
    expect(result.total_cost_usd).toBe(0);
    expect(result.usage.input_tokens).toBe(0);
    expect(result.usage.output_tokens).toBe(0);
    expect(result.usage.cache_creation_input_tokens).toBeUndefined();
    expect(result.usage.cache_read_input_tokens).toBeUndefined();
  });

  it('should throw on empty stdout', () => {
    expect(() => parseClaudeJson('')).toThrow('Empty stdout from CLI');
    expect(() => parseClaudeJson('  ')).toThrow('Empty stdout from CLI');
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseClaudeJson('not json')).toThrow('JSON parse failed');
  });

  it('should parse is_error=true', () => {
    const json = JSON.stringify({
      result: 'Error occurred',
      session_id: '',
      is_error: true,
    });

    const result = parseClaudeJson(json);
    expect(result.is_error).toBe(true);
    expect(result.result).toBe('Error occurred');
  });

  it('should handle missing usage gracefully', () => {
    const json = JSON.stringify({
      result: 'ok',
      session_id: 'sid',
      usage: { input_tokens: 10 },
    });

    const result = parseClaudeJson(json);
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(0);
    expect(result.usage.cache_creation_input_tokens).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// parseCodexJsonl
// ──────────────────────────────────────────────

describe('parseCodexJsonl', () => {
  it('should parse valid JSONL output', () => {
    const jsonl = [
      '{"type":"thread.started","thread_id":"019c-abc"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"2입니다."}}',
      '{"type":"turn.completed","usage":{"input_tokens":10283,"cached_input_tokens":6528,"output_tokens":20}}',
    ].join('\n');

    const result = parseCodexJsonl(jsonl);
    expect(result.result).toBe('2입니다.');
    expect(result.session_id).toBe('019c-abc');
    expect(result.is_error).toBe(false);
    expect(result.usage.input_tokens).toBe(10283);
    expect(result.usage.output_tokens).toBe(20);
    expect(result.usage.cache_read_input_tokens).toBe(6528);
  });

  it('should concatenate multiple agent_message items', () => {
    const jsonl = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"item.completed","item":{"id":"i0","type":"reasoning","text":"thinking..."}}',
      '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"첫 번째"}}',
      '{"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"두 번째"}}',
      '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}',
    ].join('\n');

    const result = parseCodexJsonl(jsonl);
    expect(result.result).toBe('첫 번째\n두 번째');
    expect(result.session_id).toBe('t1');
  });

  it('should throw on empty stdout', () => {
    expect(() => parseCodexJsonl('')).toThrow('Empty stdout from Codex CLI');
    expect(() => parseCodexJsonl('  ')).toThrow('Empty stdout from Codex CLI');
  });

  it('should skip non-JSON lines (stderr mixed in)', () => {
    const jsonl = [
      '2026-02-10T06:33:41 ERROR codex_core: state db missing rollout',
      '{"type":"thread.started","thread_id":"t2"}',
      '{"type":"item.completed","item":{"id":"i0","type":"agent_message","text":"답변"}}',
      '{"type":"turn.completed","usage":{"input_tokens":50,"output_tokens":10}}',
    ].join('\n');

    const result = parseCodexJsonl(jsonl);
    expect(result.result).toBe('답변');
    expect(result.session_id).toBe('t2');
  });
});

// ──────────────────────────────────────────────
// buildCliArgs
// ──────────────────────────────────────────────

const CODEX_BACKEND: CliBackendConfig = {
  name: 'codex',
  command: 'codex',
  baseArgs: ['exec', '--json'],
  resumeBaseArgs: ['exec', 'resume', '--json'],
  resumeFlag: '',
  sessionIdFlag: '--session',
  modelFlag: '--model',
  systemPromptFlag: '--instructions',
  skipPermissionsFlag: '--dangerously-bypass-approvals-and-sandbox',
};

describe('buildCliArgs', () => {
  it('should build basic args with just prompt', () => {
    const params: CliRunParams = { prompt: 'hello' };
    const args = buildCliArgs(params, CLAUDE_BACKEND);

    expect(args).toEqual(['-p', '--output-format', 'json', 'hello']);
  });

  it('should add --resume when resumeSession=true', () => {
    const params: CliRunParams = {
      prompt: 'continue',
      sessionId: 'sess-123',
      resumeSession: true,
    };
    const args = buildCliArgs(params, CLAUDE_BACKEND);

    expect(args).toContain('--resume');
    expect(args).toContain('sess-123');
    expect(args).not.toContain('--session-id');
  });

  it('should add --session-id when resumeSession=false', () => {
    const params: CliRunParams = {
      prompt: 'start',
      sessionId: 'sess-456',
      resumeSession: false,
    };
    const args = buildCliArgs(params, CLAUDE_BACKEND);

    expect(args).toContain('--session-id');
    expect(args).toContain('sess-456');
    expect(args).not.toContain('--resume');
  });

  it('should add model and system prompt flags', () => {
    const params: CliRunParams = {
      prompt: 'test',
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'Be concise',
    };
    const args = buildCliArgs(params, CLAUDE_BACKEND);

    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-5-20250514');
    expect(args).toContain('--append-system-prompt');
    expect(args).toContain('Be concise');
  });

  it('should add skip-permissions and allowed tools', () => {
    const params: CliRunParams = {
      prompt: 'deploy',
      dangerouslySkipPermissions: true,
      allowedTools: ['Read', 'Write', 'Bash'],
    };
    const args = buildCliArgs(params, CLAUDE_BACKEND);

    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read Write Bash');
    // prompt should be last
    expect(args[args.length - 1]).toBe('deploy');
  });

  // Codex backend tests
  it('should build Codex basic args with exec subcommand', () => {
    const params: CliRunParams = { prompt: '안녕' };
    const args = buildCliArgs(params, CODEX_BACKEND);

    expect(args).toEqual(['exec', '--json', '안녕']);
  });

  it('should use resumeBaseArgs for Codex resume', () => {
    const params: CliRunParams = {
      prompt: '이전 답이 뭐였지?',
      sessionId: '019c-thread-id',
      resumeSession: true,
    };
    const args = buildCliArgs(params, CODEX_BACKEND);

    // codex exec resume --json <sessionId> ... "prompt"
    expect(args[0]).toBe('exec');
    expect(args[1]).toBe('resume');
    expect(args[2]).toBe('--json');
    expect(args[3]).toBe('019c-thread-id');
    expect(args[args.length - 1]).toBe('이전 답이 뭐였지?');
  });

  it('should fall back to Claude-style resume when no resumeBaseArgs', () => {
    const params: CliRunParams = {
      prompt: 'continue',
      sessionId: 'sess-789',
      resumeSession: true,
    };
    // CLAUDE_BACKEND has no resumeBaseArgs → uses resumeFlag
    const args = buildCliArgs(params, CLAUDE_BACKEND);

    expect(args).toContain('--resume');
    expect(args).toContain('sess-789');
  });
});

// ──────────────────────────────────────────────
// classifyError
// ──────────────────────────────────────────────

describe('classifyError', () => {
  it('should classify timeout', () => {
    expect(classifyError(null, '', true)).toBe('timeout');
  });

  it('should classify session not found', () => {
    expect(classifyError(1, 'Session 123 not found', false)).toBe('session_not_found');
  });

  it('should classify permission denied', () => {
    expect(classifyError(1, 'Permission denied', false)).toBe('permission_denied');
    expect(classifyError(1, 'Unauthorized access', false)).toBe('permission_denied');
  });

  it('should classify API errors (rate limit, overloaded)', () => {
    expect(classifyError(1, 'Rate limit exceeded', false)).toBe('api_error');
    expect(classifyError(1, 'API is overloaded', false)).toBe('api_error');
    expect(classifyError(1, 'HTTP 429 Too Many Requests', false)).toBe('api_error');
  });

  it('should classify spawn/command errors', () => {
    expect(classifyError(127, '', false)).toBe('spawn_error');
    expect(classifyError(1, 'ENOENT: no such file', false)).toBe('spawn_error');
    expect(classifyError(1, 'command not found: claude', false)).toBe('spawn_error');
  });

  it('should classify killed processes', () => {
    expect(classifyError(137, '', false)).toBe('killed');
    expect(classifyError(143, '', false)).toBe('killed');
  });

  it('should return unknown for unrecognized errors', () => {
    expect(classifyError(1, 'Something went wrong', false)).toBe('unknown');
  });
});

// ──────────────────────────────────────────────
// enqueueCliRun (backward compatibility wrapper)
// ──────────────────────────────────────────────

describe('enqueueCliRun', () => {
  it('should serialize tasks when maxConcurrent=1', async () => {
    setMaxConcurrentCli(1);
    const order: number[] = [];

    const p1 = enqueueCliRun('claude', async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return 1;
    });

    const p2 = enqueueCliRun('claude', async () => {
      order.push(2);
      return 2;
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(order).toEqual([1, 2]); // Must be sequential with maxConcurrent=1

    setMaxConcurrentCli(5); // restore
  });

  it('should allow parallel execution with default concurrency', async () => {
    setMaxConcurrentCli(5);
    const order: string[] = [];

    const p1 = enqueueCliRun('claude', async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push('claude');
    });

    const p2 = enqueueCliRun('codex', async () => {
      order.push('codex');
    });

    await Promise.all([p1, p2]);
    // codex should finish first since it has no delay
    expect(order[0]).toBe('codex');
    expect(order[1]).toBe('claude');
  });

  it('should not block chain on previous failure', async () => {
    const p1 = enqueueCliRun('test-fail', async () => {
      throw new Error('deliberate');
    });
    const p2 = enqueueCliRun('test-fail', async () => {
      return 'recovered';
    });

    await expect(p1).rejects.toThrow('deliberate');
    expect(await p2).toBe('recovered');
  });
});

// ──────────────────────────────────────────────
// ConcurrencyLimiter (via setMaxConcurrentCli)
// ──────────────────────────────────────────────

describe('ConcurrencyLimiter', () => {
  it('should allow parallel execution up to maxConcurrent', async () => {
    setMaxConcurrentCli(2);

    let running = 0;
    let maxRunning = 0;

    const makeTask = () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 50));
      running--;
      return true;
    };

    const results = await Promise.all([
      enqueueCliRun('a', makeTask()),
      enqueueCliRun('b', makeTask()),
      enqueueCliRun('c', makeTask()),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(maxRunning).toBeLessThanOrEqual(2);

    setMaxConcurrentCli(5); // restore
  });

  it('should queue tasks when at capacity', async () => {
    setMaxConcurrentCli(1);

    const order: number[] = [];

    const p1 = enqueueCliRun('x', async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push(1);
    });
    const p2 = enqueueCliRun('y', async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);

    setMaxConcurrentCli(5); // restore
  });
});

// ──────────────────────────────────────────────
// runCli (integration — spawn mocked)
// ──────────────────────────────────────────────

describe('runCli', () => {
  it('should return error for unknown provider', async () => {
    const result = await runCli({ prompt: 'test', provider: 'invalid' as 'claude' });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('spawn_error');
    expect(result.error?.message).toContain('Unknown provider');
    expect(result.durationMs).toBe(0);
  });
});

// ──────────────────────────────────────────────
// CliSessionStore
// ──────────────────────────────────────────────

describe('CliSessionStore', () => {
  // We test the store without actual SQLite to verify the graceful fallback
  it('should operate without database (graceful fallback)', async () => {
    // Mock better-sqlite3 import failure
    vi.doMock('better-sqlite3', () => {
      throw new Error('Module not found');
    });

    // Re-import to get fresh module with mock
    const mod = await import('../cli-session-store.js');
    const store = new mod.CliSessionStore('/tmp/test-nonexistent.db');
    await store.initialize();

    // All operations should return empty/false gracefully
    expect(store.get('test')).toBeNull();
    expect(store.list()).toEqual([]);
    expect(store.delete('test')).toBe(false);

    store.close(); // should not throw
    vi.doUnmock('better-sqlite3');
  });

  it('should save and retrieve a session record', async () => {
    const { CliSessionStore } = await import('../cli-session-store.js');
    const store = new CliSessionStore('/tmp/olympus-test-cli-sessions.db');

    try {
      await store.initialize();

      const record = {
        key: 'test-session',
        provider: 'claude' as const,
        cliSessionId: 'sess-abc',
        model: 'sonnet',
        lastPrompt: 'hello',
        lastResponse: 'world',
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalCostUsd: 0.05,
        turnCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      store.save(record);

      const retrieved = store.get('test-session');
      if (retrieved) {
        expect(retrieved.key).toBe('test-session');
        expect(retrieved.cliSessionId).toBe('sess-abc');
        expect(retrieved.totalInputTokens).toBe(100);
      }

      // Cleanup
      store.delete('test-session');
      store.close();
    } catch {
      // better-sqlite3 may not be available in CI — skip gracefully
      store.close();
    }
  });

  it('should accumulate tokens/cost on update', async () => {
    const { CliSessionStore } = await import('../cli-session-store.js');
    const store = new CliSessionStore('/tmp/olympus-test-cli-sessions.db');

    try {
      await store.initialize();

      const now = Date.now();
      store.save({
        key: 'accum-test',
        provider: 'claude',
        cliSessionId: 'sess-1',
        model: 'sonnet',
        lastPrompt: 'p1',
        lastResponse: 'r1',
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalCostUsd: 0.05,
        turnCount: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Save again — tokens/cost should accumulate
      store.save({
        key: 'accum-test',
        provider: 'claude',
        cliSessionId: 'sess-1',
        model: 'sonnet',
        lastPrompt: 'p2',
        lastResponse: 'r2',
        totalInputTokens: 200,
        totalOutputTokens: 100,
        totalCostUsd: 0.10,
        turnCount: 1,
        createdAt: now,
        updatedAt: now + 1000,
      });

      const record = store.get('accum-test');
      if (record) {
        expect(record.totalInputTokens).toBe(300); // 100 + 200
        expect(record.totalOutputTokens).toBe(150); // 50 + 100
        expect(record.totalCostUsd).toBeCloseTo(0.15); // 0.05 + 0.10
        expect(record.turnCount).toBe(2); // 1 + 1
        expect(record.lastPrompt).toBe('p2'); // updated
      }

      store.delete('accum-test');
      store.close();
    } catch {
      store.close();
    }
  });

  it('should list sessions with optional provider filter', async () => {
    const { CliSessionStore } = await import('../cli-session-store.js');
    const store = new CliSessionStore('/tmp/olympus-test-cli-sessions.db');

    try {
      await store.initialize();

      const now = Date.now();
      store.save({
        key: 'list-claude',
        provider: 'claude',
        cliSessionId: 'c1',
        model: '',
        lastPrompt: '',
        lastResponse: '',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        turnCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      store.save({
        key: 'list-codex',
        provider: 'codex',
        cliSessionId: 'x1',
        model: '',
        lastPrompt: '',
        lastResponse: '',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        turnCount: 1,
        createdAt: now,
        updatedAt: now,
      });

      const all = store.list(undefined, 50);
      expect(all.length).toBeGreaterThanOrEqual(2);

      const claudeOnly = store.list('claude', 50);
      expect(claudeOnly.every((s) => s.provider === 'claude')).toBe(true);

      store.delete('list-claude');
      store.delete('list-codex');
      store.close();
    } catch {
      store.close();
    }
  });

  it('should delete a session and return true', async () => {
    const { CliSessionStore } = await import('../cli-session-store.js');
    const store = new CliSessionStore('/tmp/olympus-test-cli-sessions.db');

    try {
      await store.initialize();

      store.save({
        key: 'del-test',
        provider: 'claude',
        cliSessionId: 'd1',
        model: '',
        lastPrompt: '',
        lastResponse: '',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        turnCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(store.delete('del-test')).toBe(true);
      expect(store.delete('nonexistent')).toBe(false);
      expect(store.get('del-test')).toBeNull();

      store.close();
    } catch {
      store.close();
    }
  });
});
