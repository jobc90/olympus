// Protocol version
export const PROTOCOL_VERSION = '0.2.0';

// Message envelope
export interface WsMessage<T = unknown> {
  type: string;
  id: string;        // unique message id
  timestamp: number;
  payload: T;
}

// Client → Gateway
export type ClientMessage =
  | WsMessage<ConnectPayload> & { type: 'connect' }
  | WsMessage<SubscribePayload> & { type: 'subscribe' }
  | WsMessage<UnsubscribePayload> & { type: 'unsubscribe' }
  | WsMessage<CancelPayload> & { type: 'cancel' }
  | WsMessage<PingPayload> & { type: 'ping' };

export interface ConnectPayload {
  clientType: 'tui' | 'web' | 'cli';
  protocolVersion: string;
  apiKey?: string;  // Optional API key for authentication
}

export interface CancelPayload {
  runId?: string;   // cancel specific run, or all if omitted
  taskId?: string;  // cancel specific task within a run
}

export interface SubscribePayload {
  runId: string;  // Subscribe to events for a specific run
}

export interface UnsubscribePayload {
  runId: string;  // Unsubscribe from a specific run
}

export interface PingPayload {}

// Gateway → Client
export type ServerMessage =
  | WsMessage<ConnectedPayload> & { type: 'connected' }
  | WsMessage<PhasePayload> & { type: 'phase:change' }
  | WsMessage<AgentPayload> & { type: 'agent:start' }
  | WsMessage<AgentPayload> & { type: 'agent:chunk' }
  | WsMessage<AgentPayload> & { type: 'agent:complete' }
  | WsMessage<AgentPayload> & { type: 'agent:error' }
  | WsMessage<TaskPayload> & { type: 'task:update' }
  | WsMessage<LogPayload> & { type: 'log' }
  | WsMessage<SnapshotPayload> & { type: 'snapshot' }
  | WsMessage<RunsListPayload> & { type: 'runs:list' }
  | WsMessage<PongPayload> & { type: 'pong' }
  | WsMessage<import('./context.js').ContextCreatedPayload> & { type: 'context:created' }
  | WsMessage<import('./context.js').ContextUpdatedPayload> & { type: 'context:updated' }
  | WsMessage<import('./context.js').ContextMergeRequestedPayload> & { type: 'context:merge_requested' }
  | WsMessage<import('./context.js').ContextMergedPayload> & { type: 'context:merged' }
  | WsMessage<import('./context.js').ContextConflictDetectedPayload> & { type: 'context:conflict_detected' }
  | WsMessage<import('./context.js').ContextReportedUpstreamPayload> & { type: 'context:reported_upstream' };

export interface ConnectedPayload {
  protocolVersion: string;
  sessionId: string;
}

export interface PhasePayload {
  runId?: string;       // Optional runId for run-scoped events
  phase: number;        // -1 to 8
  phaseName: string;
  status: 'started' | 'completed' | 'failed';
  progress?: number;    // 0-100
}

export interface AgentPayload {
  runId?: string;       // Run this agent belongs to
  agentId: string;      // 'gemini' | 'codex' | legacy 'gpt' | agent name
  taskId: string;
  content?: string;     // for chunk/complete
  error?: string;       // for error
}

export interface TaskPayload {
  runId?: string;       // Run this task belongs to
  taskId: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  featureSet?: string;
}

export interface LogPayload {
  runId?: string;       // Run this log belongs to
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export interface RunStatus {
  runId: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  prompt: string;
  createdAt: number;
  phase: number;
  phaseName: string;
  tasks: TaskPayload[];
}

export interface SnapshotPayload {
  phase: number;
  phaseName: string;
  tasks: TaskPayload[];
  agents: { agentId: string; status: string }[];
  runs?: RunStatus[];   // Active runs for multi-run support
}

export interface PongPayload {}

export interface RunsListPayload {
  runs: RunStatus[];
}

/** Info about a tmux Claude CLI session */
export interface SessionInfo {
  id: string;
  name: string;           // Session name (e.g., "main", "backend")
  chatId: number;         // Telegram chat ID (0 for system/dashboard)
  tmuxSession: string;    // Tmux session name
  status: 'active' | 'closed';
  projectPath: string;
  workspaceContextId?: string;
  projectContextId?: string;
  taskContextId?: string;
  createdAt: number;
  lastActivityAt: number;
}

/** Discovered tmux session (not yet connected to Gateway) */
export interface AvailableSession {
  tmuxSession: string;
  projectPath: string;
}

export interface SessionsListPayload {
  sessions: SessionInfo[];
  availableSessions?: AvailableSession[];
}
