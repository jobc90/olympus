/**
 * CLI Runner Types for Olympus
 *
 * Claude CLI 비대화형 모드(`claude -p --output-format json`)의
 * 구조화된 입출력 타입 정의.
 */

// ──────────────────────────────────────────────
// CLI Provider
// ──────────────────────────────────────────────

export type CliProvider = 'claude' | 'codex';

// ──────────────────────────────────────────────
// Claude CLI JSON Output (실제 stdout 구조)
// ──────────────────────────────────────────────

/** `claude -p --output-format json` stdout JSON */
export interface ClaudeCliOutput {
  result: string;
  session_id: string;
  is_error: boolean;
  total_cost_usd: number;
  num_turns: number;
  duration_ms: number;
  duration_api_ms: number;
  usage: ClaudeCliUsage;
}

export interface ClaudeCliUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// ──────────────────────────────────────────────
// CLI Run Parameters
// ──────────────────────────────────────────────

/** runCli() 호출 파라미터 */
export interface CliRunParams {
  prompt: string;
  provider?: CliProvider;
  model?: string;
  sessionId?: string;
  resumeSession?: boolean;
  workspaceDir?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  dangerouslySkipPermissions?: boolean;
  allowedTools?: string[];
  onStream?: (chunk: string) => void;
}

// ──────────────────────────────────────────────
// CLI Run Result
// ──────────────────────────────────────────────

/** runCli() 반환값 */
export interface CliRunResult {
  success: boolean;
  text: string;
  sessionId: string;
  model: string;
  usage: CliRunUsage;
  cost: number;
  durationMs: number;
  numTurns: number;
  error?: CliRunError;
}

export interface CliRunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface CliRunError {
  type: CliErrorType;
  message: string;
  exitCode?: number;
}

export type CliErrorType =
  | 'timeout'
  | 'parse_error'
  | 'session_not_found'
  | 'permission_denied'
  | 'api_error'
  | 'spawn_error'
  | 'killed'
  | 'unknown';

// ──────────────────────────────────────────────
// CLI Backend Config
// ──────────────────────────────────────────────

/** 백엔드별 CLI 명령 구성 */
export interface CliBackendConfig {
  name: CliProvider;
  command: string;
  baseArgs: string[];
  resumeBaseArgs?: string[];  // resume 시 baseArgs 대체 (Codex: ['exec', 'resume', '--json'])
  resumeFlag: string;         // Claude: '--resume', Codex: unused (positional)
  sessionIdFlag: string;
  modelFlag: string;
  systemPromptFlag: string;
  skipPermissionsFlag: string;
}

// ──────────────────────────────────────────────
// CLI Session Record (SQLite 영속화)
// ──────────────────────────────────────────────

/** CLI 세션 영속화 레코드 */
export interface CliSessionRecord {
  key: string;
  provider: CliProvider;
  cliSessionId: string;
  model: string;
  lastPrompt: string;
  lastResponse: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  turnCount: number;
  createdAt: number;
  updatedAt: number;
}

// ──────────────────────────────────────────────
// Agent Event (Dashboard WS 이벤트)
// ──────────────────────────────────────────────

export type AgentEvent =
  | { type: 'agent:start'; sessionKey: string; prompt: string }
  | { type: 'agent:complete'; sessionKey: string; result: CliRunResult }
  | { type: 'agent:error'; sessionKey: string; error: string };

// ──────────────────────────────────────────────
// CLI Stream Chunk (실시간 stdout 스트리밍)
// ──────────────────────────────────────────────

/** CLI 실시간 스트림 청크 */
export interface CliStreamChunk {
  sessionKey: string;
  chunk: string;
  timestamp: number;
}
