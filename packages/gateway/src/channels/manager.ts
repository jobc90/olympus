import type { ChannelPlugin, IncomingChannelMessage, ChannelMessage } from './types.js';

export type CommandHandler = (msg: IncomingChannelMessage) => Promise<void>;

/**
 * Channel Manager — plugin registry for communication channels.
 *
 * Routes incoming messages to the agent command handler,
 * and distributes agent responses to all channels.
 */
export class ChannelManager {
  private channels = new Map<string, ChannelPlugin>();
  private commandHandler: CommandHandler | null = null;

  /**
   * Register a command handler (called when any channel receives a user command)
   */
  onCommand(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  /**
   * Register a channel plugin
   */
  async register(channel: ChannelPlugin): Promise<void> {
    await channel.initialize();
    this.channels.set(channel.name, channel);
  }

  /**
   * Unregister and destroy a channel plugin
   */
  async unregister(name: string): Promise<void> {
    const channel = this.channels.get(name);
    if (channel) {
      await channel.destroy();
      this.channels.delete(name);
    }
  }

  /**
   * Get a registered channel by name
   */
  get(name: string): ChannelPlugin | undefined {
    return this.channels.get(name);
  }

  /**
   * List all registered channel names
   */
  listChannels(): string[] {
    return [...this.channels.keys()];
  }

  /**
   * Called by channels when a user message is received
   */
  async handleIncoming(msg: IncomingChannelMessage): Promise<void> {
    if (this.commandHandler) {
      await this.commandHandler(msg);
    }
  }

  /**
   * Broadcast a message to all channels (or a specific one)
   */
  async broadcast(message: ChannelMessage, targetChannel?: string): Promise<void> {
    if (targetChannel) {
      const channel = this.channels.get(targetChannel);
      if (channel) {
        await channel.sendMessage('broadcast', message);
      }
      return;
    }

    for (const [, channel] of this.channels) {
      try {
        await channel.sendMessage('broadcast', message);
      } catch {
        // Don't let one channel failure block others
      }
    }
  }

  /**
   * Send a message to a specific target on a specific channel
   */
  async sendTo(channelName: string, target: string, message: ChannelMessage): Promise<void> {
    const channel = this.channels.get(channelName);
    if (channel) {
      await channel.sendMessage(target, message);
    }
  }

  /**
   * Destroy all channels
   */
  async destroyAll(): Promise<void> {
    for (const [, channel] of this.channels) {
      try {
        await channel.destroy();
      } catch {
        // Best effort cleanup
      }
    }
    this.channels.clear();
  }
}
