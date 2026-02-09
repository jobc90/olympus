// Re-export protocol types for convenience
export type {
  AgentState,
  AgentTask,
  Analysis,
  ExecutionPlan,
  WorkerTask,
  WorkerResult,
  ReviewReport,
  AgentConfig,
} from '@olympus-dev/protocol';

export { AGENT_STATE_TRANSITIONS, DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';

/**
 * User command as received from channels
 */
export interface UserCommand {
  command: string;
  senderId: string;
  channelType: string;
  projectPath?: string;
  autoApprove?: boolean;
}
