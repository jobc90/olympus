/**
 * CLI Runner — Claude CLI 비대화형 모드 실행 모듈
 *
 * tmux 기반 SessionManager를 대체하는 구조화된 CLI 실행기.
 * `claude -p --output-format json` 으로 프롬프트를 전송하고
 * JSON 응답을 파싱하여 CliRunResult를 반환한다.
 *
 * 주요 기능:
 * 1. 백엔드별 CLI 명령 구성 (claude, codex placeholder)
 * 2. 직렬화 큐 (같은 백엔드의 요청은 직렬, 다른 백엔드는 병렬)
 * 3. 타임아웃 처리 (SIGTERM → SIGKILL 에스컬레이션)
 * 4. 에러 분류
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type {
  ClaudeCliOutput,
  CliRunParams,
  CliRunResult,
  CliBackendConfig,
  CliProvider,
  CliErrorType,
} from '@olympus-dev/protocol';

// ──────────────────────────────────────────────
// Backend Configs
// ──────────────────────────────────────────────

/** 내부용: 파서 포함 확장 백엔드 구성 */
interface InternalBackendConfig extends CliBackendConfig {
  parseOutput: (stdout: string) => ClaudeCliOutput;
}

const CLAUDE_BACKEND: InternalBackendConfig = {
  name: 'claude',
  command: 'claude',
  baseArgs: ['-p', '--output-format', 'json'],
  resumeFlag: '--resume',
  sessionIdFlag: '--session-id',
  modelFlag: '--model',
  systemPromptFlag: '--append-system-prompt',
  skipPermissionsFlag: '--dangerously-skip-permissions',
  parseOutput: parseClaudeJson,
};

const CODEX_BACKEND: InternalBackendConfig = {
  name: 'codex',
  command: 'codex',
  baseArgs: ['exec', '--json'],
  resumeBaseArgs: ['exec', 'resume', '--json'],  // codex exec resume --json <sessionId> "prompt"
  resumeFlag: '',  // unused — sessionId is positional in resumeBaseArgs
  sessionIdFlag: '--session',
  modelFlag: '--model',
  systemPromptFlag: '--instructions',
  skipPermissionsFlag: '--dangerously-bypass-approvals-and-sandbox',
  parseOutput: parseCodexJsonl,
};

const BACKENDS: Record<CliProvider, InternalBackendConfig> = {
  claude: CLAUDE_BACKEND,
  codex: CODEX_BACKEND,
};

// ──────────────────────────────────────────────
// buildCliArgs
// ──────────────────────────────────────────────

export function buildCliArgs(
  params: CliRunParams,
  backend: CliBackendConfig,
): string[] {
  // resume 시 resumeBaseArgs가 있으면 대체 (Codex: exec resume --json <sessionId>)
  const useResumeBase = params.resumeSession && params.sessionId && backend.resumeBaseArgs;
  const args = useResumeBase
    ? [...backend.resumeBaseArgs!, params.sessionId!]
    : [...backend.baseArgs];

  // 세션 관리 (resumeBaseArgs 미사용 시에만)
  if (params.sessionId && !useResumeBase) {
    if (params.resumeSession && backend.resumeFlag) {
      args.push(backend.resumeFlag, params.sessionId);
    } else {
      args.push(backend.sessionIdFlag, params.sessionId);
    }
  }

  // 모델
  if (params.model && backend.modelFlag) {
    args.push(backend.modelFlag, params.model);
  }

  // 시스템 프롬프트
  if (params.systemPrompt && backend.systemPromptFlag) {
    args.push(backend.systemPromptFlag, params.systemPrompt);
  }

  // 권한 건너뛰기
  if (params.dangerouslySkipPermissions && backend.skipPermissionsFlag) {
    args.push(backend.skipPermissionsFlag);
  }

  // 허용 도구
  if (params.allowedTools?.length) {
    args.push('--allowedTools', params.allowedTools.join(' '));
  }

  // 프롬프트 (마지막 인자)
  args.push(params.prompt);

  return args;
}

// ──────────────────────────────────────────────
// parseClaudeJson
// ──────────────────────────────────────────────

export function parseClaudeJson(stdout: string): ClaudeCliOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Empty stdout from CLI');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `JSON parse failed: ${(err as Error).message}. First 200 chars: ${trimmed.slice(0, 200)}`,
    );
  }

  const usage = parsed.usage as Record<string, unknown> | undefined;

  return {
    result: String(parsed.result ?? ''),
    session_id: String(parsed.session_id ?? ''),
    is_error: Boolean(parsed.is_error),
    total_cost_usd: Number(parsed.total_cost_usd ?? 0),
    num_turns: Number(parsed.num_turns ?? 0),
    duration_ms: Number(parsed.duration_ms ?? 0),
    duration_api_ms: Number(parsed.duration_api_ms ?? 0),
    usage: {
      input_tokens: Number(usage?.input_tokens ?? 0),
      output_tokens: Number(usage?.output_tokens ?? 0),
      cache_creation_input_tokens: usage?.cache_creation_input_tokens != null
        ? Number(usage.cache_creation_input_tokens)
        : undefined,
      cache_read_input_tokens: usage?.cache_read_input_tokens != null
        ? Number(usage.cache_read_input_tokens)
        : undefined,
    },
  };
}

// ──────────────────────────────────────────────
// parseCodexJsonl
// ──────────────────────────────────────────────

/**
 * Codex CLI `exec --json` 은 JSONL (줄별 JSON) 출력:
 *   {"type":"thread.started","thread_id":"..."}
 *   {"type":"turn.started"}
 *   {"type":"item.completed","item":{"id":"...","type":"agent_message","text":"..."}}
 *   {"type":"turn.completed","usage":{"input_tokens":...,"output_tokens":...}}
 *
 * ClaudeCliOutput 형태로 정규화하여 반환.
 */
export function parseCodexJsonl(stdout: string): ClaudeCliOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Empty stdout from Codex CLI');
  }

  const lines = trimmed.split('\n').filter(Boolean);
  let threadId = '';
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;

  for (const line of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // stderr 혼입 등 무시
    }

    switch (obj.type) {
      case 'thread.started':
        threadId = String(obj.thread_id ?? '');
        break;
      case 'item.completed': {
        const item = obj.item as Record<string, unknown> | undefined;
        if (item?.type === 'agent_message' && item.text) {
          text += (text ? '\n' : '') + String(item.text);
        }
        break;
      }
      case 'turn.completed': {
        const usage = obj.usage as Record<string, unknown> | undefined;
        inputTokens += Number(usage?.input_tokens ?? 0);
        outputTokens += Number(usage?.output_tokens ?? 0);
        cachedInputTokens += Number(usage?.cached_input_tokens ?? 0);
        break;
      }
    }
  }

  return {
    result: text,
    session_id: threadId,
    is_error: false,
    total_cost_usd: 0, // Codex JSONL에 비용 필드 없음
    num_turns: 1,
    duration_ms: 0,
    duration_api_ms: 0,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: undefined,
      cache_read_input_tokens: cachedInputTokens || undefined,
    },
  };
}

// ──────────────────────────────────────────────
// classifyError
// ──────────────────────────────────────────────

export function classifyError(
  exitCode: number | null,
  stderr: string,
  timedOut: boolean,
): CliErrorType {
  if (timedOut) return 'timeout';

  const lower = stderr.toLowerCase();

  if (lower.includes('session') && lower.includes('not found')) return 'session_not_found';
  if (lower.includes('permission') || lower.includes('unauthorized')) return 'permission_denied';
  if (lower.includes('rate limit') || lower.includes('overloaded') || lower.includes('429')) return 'api_error';
  if (exitCode === 127 || lower.includes('enoent') || lower.includes('command not found')) return 'spawn_error';
  if (exitCode === 137 || exitCode === 143) return 'killed';

  return 'unknown';
}

// ──────────────────────────────────────────────
// Serialization Queue (OpenClaw 패턴)
// ──────────────────────────────────────────────

const CLI_RUN_QUEUE = new Map<string, Promise<unknown>>();

export function enqueueCliRun<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const prior = CLI_RUN_QUEUE.get(key) ?? Promise.resolve();
  const chained = prior.catch(() => undefined).then(task);
  const tracked = chained.finally(() => {
    if (CLI_RUN_QUEUE.get(key) === tracked) {
      CLI_RUN_QUEUE.delete(key);
    }
  });
  CLI_RUN_QUEUE.set(key, tracked);
  return chained;
}

// ──────────────────────────────────────────────
// spawnCli (내부)
// ──────────────────────────────────────────────

interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function buildSafeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  delete env.OLYMPUS_AGENT_API_KEY;
  env.CLAUDE_NO_TELEMETRY = '1';
  return env;
}

function spawnCli(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number; onStdout?: (chunk: string) => void },
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const settle = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      clearTimeout(killHandle);
      resolve(result);
    };

    let proc: ChildProcess;
    try {
      proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: options.cwd || process.cwd(),
        env: buildSafeEnv(),
      });
    } catch (err) {
      settle({
        exitCode: null,
        stdout: '',
        stderr: `spawn failed: ${(err as Error).message}`,
        timedOut: false,
      });
      return;
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      settle({ exitCode: code, stdout, stderr, timedOut });
    });
    proc.on('error', (err) => {
      settle({ exitCode: null, stdout, stderr: stderr + err.message, timedOut: false });
    });

    // 타임아웃: SIGTERM → 10초 후 SIGKILL
    let killHandle: ReturnType<typeof setTimeout>;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      killHandle = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }, 10_000);
    }, options.timeoutMs);
  });
}

// ──────────────────────────────────────────────
// runCli — 메인 진입점
// ──────────────────────────────────────────────

function makeErrorResult(error: { type: CliErrorType; message: string; exitCode?: number }, durationMs: number): CliRunResult {
  return {
    success: false,
    text: '',
    sessionId: '',
    model: '',
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
    cost: 0,
    durationMs,
    numTurns: 0,
    error,
  };
}

export async function runCli(params: CliRunParams): Promise<CliRunResult> {
  const provider = params.provider ?? 'claude';
  const backend = BACKENDS[provider];
  if (!backend) {
    return makeErrorResult(
      { type: 'spawn_error', message: `Unknown provider: ${provider}` },
      0,
    );
  }

  const timeoutMs = params.timeoutMs ?? 300_000;
  const args = buildCliArgs(params, backend);

  return enqueueCliRun(provider, async () => {
    const startTime = Date.now();
    const { exitCode, stdout, stderr, timedOut } = await spawnCli(
      backend.command,
      args,
      { cwd: params.workspaceDir, timeoutMs, onStdout: params.onStream },
    );
    const wallDuration = Date.now() - startTime;

    // 에러 케이스
    if (timedOut || exitCode !== 0) {
      const errorType = classifyError(exitCode, stderr, timedOut);

      // stdout에 부분 JSON이 있을 수 있음
      let partialText = '';
      let partialSessionId = '';
      try {
        const parsed = backend.parseOutput(stdout);
        partialText = parsed.result;
        partialSessionId = parsed.session_id;
      } catch {
        // 파싱 실패 무시
      }

      const result = makeErrorResult(
        {
          type: errorType,
          message: stderr.slice(0, 500) || `Exit code: ${exitCode}`,
          exitCode: exitCode ?? undefined,
        },
        wallDuration,
      );
      result.text = partialText;
      result.sessionId = partialSessionId;
      return result;
    }

    // 정상 케이스: JSON 파싱
    try {
      const output = backend.parseOutput(stdout);
      return {
        success: !output.is_error,
        text: output.result,
        sessionId: output.session_id,
        model: '',
        usage: {
          inputTokens: output.usage.input_tokens,
          outputTokens: output.usage.output_tokens,
          cacheCreationTokens: output.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: output.usage.cache_read_input_tokens ?? 0,
        },
        cost: output.total_cost_usd,
        durationMs: output.duration_ms || wallDuration,
        numTurns: output.num_turns,
      };
    } catch (err) {
      return makeErrorResult(
        { type: 'parse_error', message: (err as Error).message },
        wallDuration,
      );
    }
  });
}
