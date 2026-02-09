import type { ChannelPlugin, ChannelMessage } from './types.js';

export interface SlackChannelConfig {
  /** Slack Bot OAuth Token (xoxb-...) */
  token: string;
  /** Default channel ID to post agent results */
  defaultChannel: string;
  /** Signing secret for request verification */
  signingSecret?: string;
}

/**
 * Slack Channel Plugin — bridges agent events to Slack via Web API.
 *
 * Uses Slack Web API (fetch-based, no SDK dependency) to:
 * - Post agent progress/results to a Slack channel
 * - Format messages using Block Kit for rich display
 *
 * To receive slash commands, set up a Slack App with:
 * - Slash command: /olympus → your Gateway URL /api/slack/commands
 * - Event subscription for interactive messages
 */
export class SlackChannel implements ChannelPlugin {
  readonly name = 'slack';
  private config: SlackChannelConfig;
  private apiBase = 'https://slack.com/api';

  constructor(config: SlackChannelConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.token) {
      throw new Error('Slack bot token not configured');
    }

    // Verify token with auth.test
    const res = await fetch(`${this.apiBase}/auth.test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json() as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack auth failed: ${data.error}`);
    }
  }

  async sendMessage(target: string, message: ChannelMessage): Promise<void> {
    const channel = target === 'broadcast' ? this.config.defaultChannel : target;
    if (!channel) return;

    const blocks = this.formatBlocks(message);
    const text = this.formatPlainText(message);

    try {
      await this.postMessage(channel, text, blocks);
    } catch {
      // Fallback to plain text
      await this.postMessage(channel, text);
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
        return `✅ Agent Result: ${message.content}`;
      case 'error':
        return `❌ Agent Error: ${message.content}`;
      case 'question':
        return `❓ Confirmation: ${message.content}`;
      default:
        return message.content;
    }
  }

  private formatBlocks(message: ChannelMessage): SlackBlock[] {
    const blocks: SlackBlock[] = [];

    switch (message.type) {
      case 'progress': {
        const meta = message.metadata ?? {};
        const progressPct = typeof meta.progress === 'number' ? meta.progress : null;
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔄 *Progress*\n${message.content}${progressPct !== null ? ` (${Math.round(progressPct)}%)` : ''}`,
          },
        });
        break;
      }
      case 'result':
        blocks.push(
          {
            type: 'header',
            text: { type: 'plain_text', text: '✅ Agent Result' },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: message.content.slice(0, 3000) },
          },
        );
        break;
      case 'error':
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ *Error*\n\`\`\`${message.content.slice(0, 2900)}\`\`\``,
          },
        });
        break;
      case 'question':
        blocks.push(
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `❓ *Confirmation Required*\n${message.content}` },
          },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'agent_approve' },
              { type: 'button', text: { type: 'plain_text', text: 'Reject' }, style: 'danger', action_id: 'agent_reject' },
            ],
          },
        );
        break;
      default:
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: message.content.slice(0, 3000) },
        });
    }

    return blocks;
  }

  private async postMessage(channel: string, text: string, blocks?: SlackBlock[]): Promise<void> {
    const body: Record<string, unknown> = { channel, text };
    if (blocks) body.blocks = blocks;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${this.apiBase}/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Slack API error: ${res.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Slack Block Kit types (minimal subset)
interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{
    type: string;
    text: { type: string; text: string };
    style?: string;
    action_id: string;
  }>;
}
