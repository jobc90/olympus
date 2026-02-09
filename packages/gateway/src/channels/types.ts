/**
 * Channel Plugin Interface — abstracts communication channels
 * (Telegram, Dashboard WS, future Slack/Discord, etc.)
 */
export interface ChannelPlugin {
  /** Unique channel name */
  readonly name: string;

  /** Initialize the channel (connect, register handlers, etc.) */
  initialize(): Promise<void>;

  /** Send a message to a specific user/chat */
  sendMessage(target: string, message: ChannelMessage): Promise<void>;

  /** Destroy the channel (disconnect, cleanup) */
  destroy(): Promise<void>;
}

/**
 * Message from a channel to the agent
 */
export interface IncomingChannelMessage {
  channelType: string;
  senderId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Message from the agent to a channel
 */
export interface ChannelMessage {
  type: 'text' | 'progress' | 'result' | 'error' | 'question';
  content: string;
  metadata?: Record<string, unknown>;
}
