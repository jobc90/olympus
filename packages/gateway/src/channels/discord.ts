import type { ChannelPlugin, ChannelMessage } from './types.js';

export interface DiscordChannelConfig {
  /** Discord Bot Token */
  token: string;
  /** Default channel ID to post agent results */
  defaultChannelId: string;
}

/**
 * Discord Channel Plugin — bridges agent events to Discord via REST API.
 *
 * Uses Discord REST API (fetch-based, no SDK dependency) to:
 * - Post agent progress/results as rich embeds
 * - Format messages with Discord embed structure
 *
 * To receive commands, register a Discord Bot with:
 * - Message content intent enabled
 * - Prefix command: !olympus <command>
 */
export class DiscordChannel implements ChannelPlugin {
  readonly name = 'discord';
  private config: DiscordChannelConfig;
  private apiBase = 'https://discord.com/api/v10';

  constructor(config: DiscordChannelConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.token) {
      throw new Error('Discord bot token not configured');
    }

    // Verify token with GET /users/@me
    const res = await fetch(`${this.apiBase}/users/@me`, {
      headers: { Authorization: `Bot ${this.config.token}` },
    });

    if (!res.ok) {
      throw new Error(`Discord auth failed: ${res.status}`);
    }
  }

  async sendMessage(target: string, message: ChannelMessage): Promise<void> {
    const channelId = target === 'broadcast' ? this.config.defaultChannelId : target;
    if (!channelId) return;

    const embed = this.formatEmbed(message);
    const content = this.formatPlainText(message);

    try {
      await this.sendChannelMessage(channelId, content, embed);
    } catch {
      // Fallback to plain text
      await this.sendChannelMessage(channelId, content);
    }
  }

  async destroy(): Promise<void> {
    // Stateless HTTP — nothing to clean up
  }

  private formatPlainText(message: ChannelMessage): string {
    switch (message.type) {
      case 'progress':
        return `🔄 ${message.content}`;
      case 'result':
        return `✅ **Agent Result**: ${message.content.slice(0, 2000)}`;
      case 'error':
        return `❌ **Agent Error**: ${message.content.slice(0, 2000)}`;
      case 'question':
        return `❓ **Confirmation**: ${message.content}`;
      default:
        return message.content.slice(0, 2000);
    }
  }

  private formatEmbed(message: ChannelMessage): DiscordEmbed {
    switch (message.type) {
      case 'progress': {
        const meta = message.metadata ?? {};
        const progressPct = typeof meta.progress === 'number' ? ` (${Math.round(meta.progress)}%)` : '';
        return {
          title: '🔄 Progress',
          description: `${message.content}${progressPct}`,
          color: 0x3498db, // blue
        };
      }
      case 'result':
        return {
          title: '✅ Agent Result',
          description: message.content.slice(0, 4000),
          color: 0x2ecc71, // green
        };
      case 'error':
        return {
          title: '❌ Agent Error',
          description: `\`\`\`\n${message.content.slice(0, 3900)}\n\`\`\``,
          color: 0xe74c3c, // red
        };
      case 'question':
        return {
          title: '❓ Confirmation Required',
          description: message.content,
          color: 0xf39c12, // orange
        };
      default:
        return {
          description: message.content.slice(0, 4000),
          color: 0x95a5a6, // gray
        };
    }
  }

  private async sendChannelMessage(channelId: string, content: string, embed?: DiscordEmbed): Promise<void> {
    const body: Record<string, unknown> = { content: content.slice(0, 2000) };
    if (embed) body.embeds = [embed];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${this.apiBase}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Discord API error: ${res.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface DiscordEmbed {
  title?: string;
  description: string;
  color: number;
}
