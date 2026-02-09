import type { ChannelPlugin, ChannelMessage } from './types.js';

export interface TelegramChannelConfig {
  token: string;
  allowedUsers: number[];
}

/**
 * Telegram Channel Plugin — bridges agent events to Telegram users.
 *
 * This plugin uses the Telegram Bot API (via node-fetch) to send
 * agent results/progress to configured users.
 *
 * Unlike the full OlympusBot (telegram-bot package), this is a
 * lightweight event bridge: the Agent sends results → this plugin
 * delivers to Telegram. The full bot handles interactive commands.
 */
export class TelegramChannel implements ChannelPlugin {
  readonly name = 'telegram';
  private config: TelegramChannelConfig;
  private apiBase: string;

  constructor(config: TelegramChannelConfig) {
    this.config = config;
    this.apiBase = `https://api.telegram.org/bot${config.token}`;
  }

  async initialize(): Promise<void> {
    // Verify bot token is valid
    if (!this.config.token) {
      throw new Error('Telegram bot token not configured');
    }
  }

  async sendMessage(target: string, message: ChannelMessage): Promise<void> {
    const chatIds = target === 'broadcast'
      ? this.config.allowedUsers.map(String)
      : [target];

    const text = this.formatMessage(message);
    if (!text) return;

    for (const chatId of chatIds) {
      try {
        await this.sendTelegramMessage(chatId, text);
      } catch {
        // Best-effort delivery — don't let one chat failure block others
      }
    }
  }

  async destroy(): Promise<void> {
    // No persistent connection to clean up (stateless HTTP)
  }

  private formatMessage(message: ChannelMessage): string {
    switch (message.type) {
      case 'progress': {
        const meta = message.metadata ?? {};
        const progress = typeof meta.progress === 'number' ? ` (${Math.round(meta.progress)}%)` : '';
        return `🔄 ${message.content}${progress}`;
      }
      case 'result':
        return `✅ *Agent Result*\n${this.escapeMarkdown(message.content)}`;
      case 'error':
        return `❌ *Agent Error*\n${this.escapeMarkdown(message.content)}`;
      case 'question':
        return `❓ *Confirmation Required*\n${this.escapeMarkdown(message.content)}`;
      default:
        return message.content;
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    const url = `${this.apiBase}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'MarkdownV2',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Retry once with plain text (MarkdownV2 can fail on malformed text)
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
