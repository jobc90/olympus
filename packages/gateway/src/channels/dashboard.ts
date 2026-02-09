import type { ChannelPlugin, ChannelMessage } from './types.js';

/**
 * Dashboard Channel Plugin — bridges WS clients to the agent system.
 *
 * Unlike Telegram which has its own transport (Telegraf),
 * the Dashboard uses the existing Gateway WS connection.
 * This plugin mostly just formats messages for WS broadcast.
 */
export class DashboardChannel implements ChannelPlugin {
  readonly name = 'dashboard';
  private broadcastFn: ((event: string, payload: unknown) => void) | null = null;

  /**
   * Set the broadcast function (provided by Gateway)
   */
  setBroadcast(fn: (event: string, payload: unknown) => void): void {
    this.broadcastFn = fn;
  }

  async initialize(): Promise<void> {
    // Dashboard channel is passive — it receives via RPC and sends via WS
  }

  async sendMessage(_target: string, message: ChannelMessage): Promise<void> {
    if (!this.broadcastFn) return;

    switch (message.type) {
      case 'progress':
        this.broadcastFn('agent:progress', {
          ...message.metadata,
          message: message.content,
        });
        break;
      case 'result':
        this.broadcastFn('agent:result', {
          ...message.metadata,
          report: message.content,
        });
        break;
      case 'error':
        this.broadcastFn('agent:error', {
          ...message.metadata,
          error: message.content,
        });
        break;
      case 'question':
        this.broadcastFn('agent:question', {
          ...message.metadata,
          question: message.content,
        });
        break;
      default:
        this.broadcastFn('agent:message', {
          content: message.content,
          ...message.metadata,
        });
    }
  }

  async destroy(): Promise<void> {
    this.broadcastFn = null;
  }
}
