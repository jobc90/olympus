// Protocol version
export { PROTOCOL_VERSION } from './messages.js';

// Task types (Hierarchical Memory)
export type {
  Task,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  TaskWithResolvedContext,
  ContextVersion,
  TaskTreeNode,
  TaskCreatedPayload,
  TaskUpdatedPayload,
  TaskDeletedPayload,
  TaskMovedPayload,
} from './task.js';

// Context OS types
export type {
  ContextScope,
  ContextStatus,
  ContextEdgeType,
  ContextMergeStatus,
  OperationStatus,
  Context,
  CreateContextInput,
  UpdateContextInput,
  ContextEdge,
  ContextVersionEntry,
  ContextMerge,
  Operation,
  CreateMergeInput,
  ReportUpstreamInput,
  ContextTreeNode,
  ContextCreatedPayload,
  ContextUpdatedPayload,
  ContextMergeRequestedPayload,
  ContextMergedPayload,
  ContextConflictDetectedPayload,
  ContextReportedUpstreamPayload,
} from './context.js';

// Message types
export type {
  WsMessage,
  ClientMessage,
  ServerMessage,
  ConnectPayload,
  CancelPayload,
  SubscribePayload,
  UnsubscribePayload,
  PingPayload,
  ConnectedPayload,
  PhasePayload,
  AgentPayload,
  TaskPayload,
  LogPayload,
  SnapshotPayload,
  RunsListPayload,
  PongPayload,
  RunStatus,
  SessionInfo,
  AvailableSession,
  SessionsListPayload,
} from './messages.js';

// Constants
export {
  DEFAULT_GATEWAY_PORT,
  DEFAULT_GATEWAY_HOST,
  GATEWAY_PATH,
  HEARTBEAT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
} from './constants.js';

// Helpers
export { createMessage, parseMessage } from './helpers.js';

// RPC types (v2.0)
export type {
  RpcRequestPayload,
  RpcAckPayload,
  RpcResultPayload,
  RpcErrorPayload,
  RpcErrorCode,
  RpcMethods,
  HealthResult,
  StatusResult,
  AgentCommandParams,
  AgentCommandResult,
  AgentCancelParams,
  AgentCancelResult,
  AgentStatusResult,
  AgentTaskSummary,
  AgentHistoryParams,
  AgentHistoryResult,
  CompletedAgentTask,
  WorkersListResult,
  WorkerInfo,
  WorkerTerminateParams,
  WorkerTerminateResult,
  WorkerOutputParams,
  WorkerOutputResult,
  AgentApproveParams,
  AgentApproveResult,
  AgentRejectParams,
  AgentRejectResult,
  SessionsListRpcResult,
  SessionsDiscoverResult,
} from './rpc.js';

// Agent & Worker types (v2.0)
export type {
  AgentState,
  AgentTask,
  Analysis,
  ExecutionPlan,
  WorkerTask,
  WorkerResult,
  ReviewReport,
  AgentProgressPayload,
  AgentResultPayload,
  ApprovalRequest,
  AgentApprovalPayload,
  WorkerStartedPayload,
  WorkerOutputPayload,
  WorkerDonePayload,
  CompletedTask,
  LearningPattern,
  AgentConfig,
  WorkerConfig,
  MemoryConfig,
  SecurityConfig,
  ProjectConfig,
} from './agent.js';

export {
  AGENT_STATE_TRANSITIONS,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_WORKER_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_SECURITY_CONFIG,
} from './agent.js';

// Codex Orchestrator types (v3.0)
export type {
  CodexMessageType,
  CodexInputSource,
  CodexUserInput,
  CodexRoutingType,
  CodexRoutingDecision,
  CodexResponseType,
  CodexProcessedResponse,
  CodexRoutePayload,
  CodexRouteResultPayload,
  CodexSessionOutputPayload,
  CodexSessionCommand,
  CodexSessionCmdPayload,
  CodexSessionEventPayload,
  CodexStatusPayload,
  CodexRouteParams,
  CodexSearchParams,
  CodexSessionInfo,
  CodexProjectInfo,
  CodexSearchResult,
} from './codex.js';

// CLI Runner types (Phase 1)
export type {
  CliProvider,
  ClaudeCliOutput,
  ClaudeCliUsage,
  CliRunParams,
  CliRunResult,
  CliRunUsage,
  CliRunError,
  CliErrorType,
  CliBackendConfig,
  CliSessionRecord,
  AgentEvent,
  CliStreamChunk,
} from './cli-runner.js';

// Worker Registry types
export type {
  RegisteredWorker,
  WorkerRegistration,
  WorkerTaskRecord,
} from './worker.js';

// Local Context types
export type {
  ExtractedContext,
  WorkerContextRecord,
  ProjectContextSnapshot,
  RootProjectEntry,
  LocalContextStoreConfig,
  ContextInjection,
} from './local-context.js';

export { DEFAULT_LOCAL_CONTEXT_CONFIG } from './local-context.js';
