/**
 * Codex Orchestrator Protocol Types
 *
 * Gateway ↔ Codex 통신을 위한 메시지 타입 정의.
 * 기존 WsMessage 엔벨로프를 재사용하되, Codex 전용 payload 타입 추가.
 */

// ──────────────────────────────────────────────
// Codex Message Types
// ──────────────────────────────────────────────

export type CodexMessageType =
  | 'codex:route'           // Gateway → Codex: 사용자 입력 라우팅 요청
  | 'codex:route-result'    // Codex → Gateway: 라우팅 결과
  | 'codex:session-output'  // Codex → Gateway: 세션 출력 (브로드캐스트용)
  | 'codex:answer'          // Codex → Gateway: 자체 답변 (SELF_ANSWER)
  | 'codex:status'          // 양방향: 상태 조회/응답
  | 'codex:session-cmd'     // Gateway → Codex: 세션 관리 명령
  | 'codex:session-event';  // Codex → Gateway: 세션 상태 변경

// ──────────────────────────────────────────────
// Input Types
// ──────────────────────────────────────────────

export type CodexInputSource = 'telegram' | 'dashboard' | 'cli';

export interface CodexUserInput {
  text: string;
  source: CodexInputSource;
  timestamp: number;
}

// ──────────────────────────────────────────────
// Routing Types
// ──────────────────────────────────────────────

export type CodexRoutingType =
  | 'SESSION_FORWARD'
  | 'SELF_ANSWER'
  | 'MULTI_SESSION'
  | 'CONTEXT_QUERY';

export interface CodexRoutingDecision {
  type: CodexRoutingType;
  targetSessions: string[];
  processedInput: string;
  confidence: number;
  reason: string;
  contextToInject?: unknown;
}

// ──────────────────────────────────────────────
// Response Types
// ──────────────────────────────────────────────

export type CodexResponseType =
  | 'build'
  | 'test'
  | 'error'
  | 'code'
  | 'text'
  | 'question'
  | 'progress';

export interface CodexProcessedResponse {
  type: CodexResponseType;
  content: string;
  metadata: {
    projectName: string;
    sessionId: string;
    duration: number;
    filesChanged?: string[];
  };
  rawOutput: string;
  agentInsight?: string;
}

// ──────────────────────────────────────────────
// Payload Types (for WS messages)
// ──────────────────────────────────────────────

export interface CodexRoutePayload {
  requestId: string;
  input: CodexUserInput;
  source: CodexInputSource;
  chatId?: number;
  clientId?: string;
}

export interface CodexRouteResultPayload {
  requestId: string;
  decision: CodexRoutingDecision;
  response?: CodexProcessedResponse;
}

export interface CodexSessionOutputPayload {
  sessionId: string;
  projectName: string;
  response: CodexProcessedResponse;
  raw?: string;
}

export type CodexSessionCommand = 'list' | 'create' | 'close' | 'switch';

export interface CodexSessionCmdPayload {
  command: CodexSessionCommand;
  sessionId?: string;
  projectPath?: string;
  name?: string;
}

export interface CodexSessionEventPayload {
  sessionId: string;
  status: string;
  projectName?: string;
  timestamp: number;
}

export interface CodexStatusPayload {
  initialized: boolean;
  sessionCount: number;
  projectCount: number;
}

// ──────────────────────────────────────────────
// RPC Method Types (for codex.* namespace)
// ──────────────────────────────────────────────

export interface CodexRouteParams {
  text: string;
  source: CodexInputSource;
}

export interface CodexSearchParams {
  query: string;
  limit?: number;
}

export interface CodexSessionInfo {
  id: string;
  name: string;
  projectPath: string;
  status: string;
  lastActivity: number;
}

export interface CodexProjectInfo {
  name: string;
  path: string;
  aliases: string[];
  techStack: string[];
}

export interface CodexSearchResult {
  projectName: string;
  projectPath: string;
  matchType: 'task' | 'pattern' | 'context' | 'instruction';
  content: string;
  score: number;
  timestamp: number;
}
