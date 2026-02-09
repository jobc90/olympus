/**
 * RPC Protocol Types for Olympus v2.0
 *
 * WS-based request-response pattern:
 *   Client → Gateway: type: 'rpc'
 *   Gateway → Client: type: 'rpc:ack' (즉시) → 'rpc:result' (최종) / 'rpc:error' (실패)
 */

// ──────────────────────────────────────────────
// RPC Message Payloads
// ──────────────────────────────────────────────

export interface RpcRequestPayload {
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcAckPayload {
  requestId: string;
  message?: string;
}

export interface RpcResultPayload {
  requestId: string;
  result: unknown;
}

export interface RpcErrorPayload {
  requestId: string;
  code: RpcErrorCode;
  message: string;
  details?: unknown;
}

// ──────────────────────────────────────────────
// RPC Error Codes
// ──────────────────────────────────────────────

export type RpcErrorCode =
  | 'PARSE_ERROR'
  | 'METHOD_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'AGENT_BUSY'
  | 'WORKER_LIMIT_REACHED';

// ──────────────────────────────────────────────
// RPC Method Definitions (type-safe)
// ──────────────────────────────────────────────

/** All available RPC methods and their param/result types */
export interface RpcMethods {
  // System
  'health': { params: void; result: HealthResult };
  'status': { params: void; result: StatusResult };

  // Agent
  'agent.command': { params: AgentCommandParams; result: AgentCommandResult };
  'agent.status': { params: void; result: AgentStatusResult };
  'agent.cancel': { params: AgentCancelParams; result: AgentCancelResult };
  'agent.history': { params: AgentHistoryParams; result: AgentHistoryResult };
  'agent.approve': { params: AgentApproveParams; result: AgentApproveResult };
  'agent.reject': { params: AgentRejectParams; result: AgentRejectResult };

  // Workers
  'workers.list': { params: void; result: WorkersListResult };
  'workers.terminate': { params: WorkerTerminateParams; result: WorkerTerminateResult };
  'workers.output': { params: WorkerOutputParams; result: WorkerOutputResult };

  // Sessions (existing, now also via RPC)
  'sessions.list': { params: void; result: SessionsListRpcResult };
  'sessions.discover': { params: void; result: SessionsDiscoverResult };
}

// ──────────────────────────────────────────────
// System method types
// ──────────────────────────────────────────────

export interface HealthResult {
  status: 'ok';
  uptime: number;
  version: string;
}

export interface StatusResult {
  agentState: string;
  activeWorkers: number;
  connectedClients: number;
  activeSessions: number;
}

// ──────────────────────────────────────────────
// Agent method types
// ──────────────────────────────────────────────

export interface AgentCommandParams {
  command: string;
  projectPath?: string;
  autoApprove?: boolean;
}

export interface AgentCommandResult {
  taskId: string;
  status: 'accepted' | 'rejected';
  message: string;
}

export interface AgentCancelParams {
  taskId?: string;
}

export interface AgentCancelResult {
  cancelled: boolean;
  message: string;
}

export interface AgentStatusResult {
  state: string;
  currentTask: AgentTaskSummary | null;
  activeWorkers: number;
  queuedCommands: number;
}

export interface AgentTaskSummary {
  id: string;
  command: string;
  state: string;
  startedAt: number;
  progress?: number;
}

export interface AgentHistoryParams {
  limit?: number;
  offset?: number;
}

export interface AgentHistoryResult {
  tasks: CompletedAgentTask[];
  total: number;
}

export interface AgentApproveParams {
  taskId: string;
}

export interface AgentApproveResult {
  approved: boolean;
  message: string;
}

export interface AgentRejectParams {
  taskId: string;
  reason?: string;
}

export interface AgentRejectResult {
  rejected: boolean;
  message: string;
}

export interface CompletedAgentTask {
  id: string;
  command: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  duration: number;
  timestamp: number;
  workerCount: number;
}

// ──────────────────────────────────────────────
// Worker method types
// ──────────────────────────────────────────────

export interface WorkersListResult {
  workers: WorkerInfo[];
}

export interface WorkerInfo {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  projectPath: string;
  startedAt: number;
  duration?: number;
  exitCode?: number | null;
  outputPreview?: string;
}

export interface WorkerTerminateParams {
  workerId: string;
}

export interface WorkerTerminateResult {
  terminated: boolean;
  message: string;
}

export interface WorkerOutputParams {
  workerId: string;
  offset?: number;
  limit?: number;
}

export interface WorkerOutputResult {
  workerId: string;
  output: string;
  totalLength: number;
}

// ──────────────────────────────────────────────
// Session RPC types (mirrors existing REST)
// ──────────────────────────────────────────────

export interface SessionsListRpcResult {
  sessions: unknown[];  // SessionInfo from messages.ts
  availableSessions?: unknown[];
}

export interface SessionsDiscoverResult {
  sessions: unknown[];
}
