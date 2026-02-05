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
