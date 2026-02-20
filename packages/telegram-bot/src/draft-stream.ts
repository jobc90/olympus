import type { Telegram } from 'telegraf';
import type { DraftStreamConfig, DraftStreamState } from '@olympus-dev/protocol';
import { DEFAULT_DRAFT_STREAM_CONFIG, STREAMING_FILTER_CONFIG } from '@olympus-dev/protocol';
import type { FilterResult, FilterStage } from '@olympus-dev/protocol';
import { structuredLog } from './error-utils.js';

// --- Lightweight stream chunk filter (mirrors gateway/response-filter.ts) ---
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\)?|\([A-Z0-9]|[NO].)/g;

const SYSTEM_MARKER_PATTERNS = [
  /^⏺\s*/,
  /HEARTBEAT(?:_OK)?/,
  /^\[(?:SYSTEM|DEBUG|INTERNAL)\]/i,
  /^(?:Compiling|Building|Bundling)\.\.\./i,
  /^\s*\[\d+\/\d+\]\s+/,
];

function filterStreamChunk(text: string): FilterResult {
  const originalLength = text.length;
  const stagesApplied: FilterStage[] = [];
  const removedMarkers: string[] = [];
  let result = text;

  for (const stage of STREAMING_FILTER_CONFIG.enabledStages) {
    const before = result;
    switch (stage) {
      case 'ansi_strip':
        result = result.replace(ANSI_RE, '');
        break;
      case 'marker_removal': {
        const lines = result.split('\n');
        const filtered = lines.filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return true;
          for (const pattern of SYSTEM_MARKER_PATTERNS) {
            if (pattern.test(trimmed)) {
              removedMarkers.push(trimmed.slice(0, 50));
              return false;
            }
          }
          return true;
        });
        result = filtered.join('\n');
        break;
      }
    }
    if (result !== before) stagesApplied.push(stage);
  }

  return { text: result, originalLength, truncated: false, stagesApplied, removedMarkers };
}

/**
 * DraftStream — Real-time Telegram message streaming via editMessageText.
 *
 * Flow:
 * 1. Accumulate text chunks in buffer
 * 2. When buffer reaches minCharsBeforeSend, send first message via sendMessage
 * 3. Subsequent updates via editMessageText at max 1Hz throttle
 * 4. On overflow (>4096 chars), finalize current message and start new one
 * 5. On flush(), send final update and mark complete
 */
export class DraftStream {
  private state: DraftStreamState;
  private config: DraftStreamConfig;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdate = false;
  private retryCount = 0;
  private usePlainText = false;

  constructor(
    private telegram: Telegram,
    chatId: number,
    config?: Partial<DraftStreamConfig>,
  ) {
    this.config = { ...DEFAULT_DRAFT_STREAM_CONFIG, ...config };
    this.state = {
      chatId,
      buffer: '',
      lastUpdateAt: 0,
      isComplete: false,
      overflow: [],
    };
  }

  /** Append a new chunk from CLI streaming. */
  async append(chunk: string): Promise<void> {
    if (this.state.isComplete) return;

    const filtered = filterStreamChunk(chunk);
    this.state.buffer += filtered.text;

    // First send: wait until minimum chars accumulated
    if (!this.state.messageId) {
      if (this.state.buffer.length >= this.config.minCharsBeforeSend) {
        await this.sendFirstMessage();
      }
      return;
    }

    // Check overflow: if buffer exceeds max, split into new message
    if (this.state.buffer.length > this.config.maxMessageLength) {
      await this.handleOverflow();
      return;
    }

    // Throttled update
    this.pendingUpdate = true;
    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(async () => {
        this.throttleTimer = null;
        if (this.pendingUpdate && !this.state.isComplete) {
          this.pendingUpdate = false;
          await this.updateMessage();
        }
      }, this.config.throttleMs);
    }
  }

  /** Flush remaining buffer and mark complete. Call when CLI execution finishes. */
  async flush(): Promise<void> {
    if (this.state.isComplete) return;

    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    this.state.isComplete = true;

    if (!this.state.messageId) {
      if (this.state.buffer.trim()) {
        await this.sendFirstMessage();
      }
      return;
    }

    await this.updateMessage();

    structuredLog('info', 'draft-stream', 'completed', {
      chatId: this.state.chatId,
      totalLength: this.state.buffer.length,
      overflowCount: this.state.overflow.length,
    });
  }

  /** Cancel streaming (error or abort). */
  async cancel(errorMessage?: string): Promise<void> {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    this.state.isComplete = true;

    if (errorMessage && this.state.messageId) {
      const text = this.state.buffer + `\n\n⚠️ ${errorMessage}`;
      await this.safeEditMessage(text);
    }
  }

  /** Get current state (read-only). */
  getState(): Readonly<DraftStreamState> {
    return { ...this.state };
  }

  // --- Private Methods ---

  private async sendFirstMessage(): Promise<void> {
    try {
      const text = this.getDisplayText();
      const extra = this.usePlainText ? {} : { parse_mode: 'Markdown' as const };
      const sent = await this.telegram.sendMessage(this.state.chatId, text, extra);
      this.state.messageId = sent.message_id;
      this.state.lastUpdateAt = Date.now();
      this.retryCount = 0;

      structuredLog('info', 'draft-stream', 'first_send', {
        chatId: this.state.chatId,
        messageId: sent.message_id,
        length: text.length,
      });
    } catch (err) {
      await this.handleSendError(err);
    }
  }

  private async updateMessage(): Promise<void> {
    if (!this.state.messageId) return;

    const text = this.getDisplayText();
    await this.safeEditMessage(text);
    this.state.lastUpdateAt = Date.now();
  }

  private async handleOverflow(): Promise<void> {
    if (!this.state.messageId) return;

    const maxLen = this.config.maxMessageLength;
    const buffer = this.state.buffer;

    // Find safe split point (line boundary)
    let splitAt = maxLen;
    const lastNewline = buffer.lastIndexOf('\n', maxLen);
    if (lastNewline > maxLen * 0.7) {
      splitAt = lastNewline;
    }

    // Finalize current message with first part
    const firstPart = buffer.slice(0, splitAt);
    this.state.buffer = firstPart;
    await this.updateMessage();

    // Store overflow reference
    this.state.overflow.push(String(this.state.messageId));

    // Start new message with remainder
    const remainder = buffer.slice(splitAt);
    this.state.buffer = remainder;
    this.state.messageId = undefined;

    structuredLog('info', 'draft-stream', 'overflow', {
      chatId: this.state.chatId,
      firstPartLength: firstPart.length,
      remainderLength: remainder.length,
    });

    if (remainder.length >= this.config.minCharsBeforeSend) {
      await this.sendFirstMessage();
    }
  }

  private getDisplayText(): string {
    let text = this.state.buffer;

    // Close unclosed code blocks for display during streaming
    if (this.config.markdownSafe && !this.state.isComplete) {
      const backtickCount = (text.match(/```/g) || []).length;
      if (backtickCount % 2 !== 0) {
        text += '\n```';
      }
    }

    if (!this.state.isComplete) {
      text += '\n\n⏳';
    }

    return text;
  }

  private async safeEditMessage(text: string): Promise<void> {
    if (!this.state.messageId) return;

    try {
      const extra = this.usePlainText ? {} : { parse_mode: 'Markdown' as const };
      await this.telegram.editMessageText(
        this.state.chatId,
        this.state.messageId,
        undefined,
        text,
        extra,
      );
      this.retryCount = 0;
    } catch (err) {
      await this.handleEditError(err);
    }
  }

  private async handleSendError(err: unknown): Promise<void> {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Telegram 400 — likely markdown parsing error, fallback to plain text
    if (errMsg.includes('400') || errMsg.includes('Bad Request')) {
      if (!this.usePlainText) {
        this.usePlainText = true;
        structuredLog('warn', 'draft-stream', 'markdown_fallback', { chatId: this.state.chatId });
        await this.sendFirstMessage();
        return;
      }
    }

    structuredLog('error', 'draft-stream', 'send_error', {
      chatId: this.state.chatId,
      error: errMsg,
    });
  }

  private async handleEditError(err: unknown): Promise<void> {
    const errMsg = err instanceof Error ? err.message : String(err);

    // 429 Too Many Requests — exponential backoff
    if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
      this.retryCount++;
      const backoffMs = Math.min(2000 * Math.pow(2, this.retryCount - 1), 8000);
      structuredLog('warn', 'draft-stream', 'rate_limited', {
        chatId: this.state.chatId,
        retryCount: this.retryCount,
        backoffMs,
      });

      if (this.retryCount <= 3) {
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        await this.safeEditMessage(this.getDisplayText());
      }
      return;
    }

    // 400 Bad Request — switch to plain text
    if (errMsg.includes('400') || errMsg.includes('Bad Request')) {
      if (!this.usePlainText) {
        this.usePlainText = true;
        structuredLog('warn', 'draft-stream', 'markdown_fallback', { chatId: this.state.chatId });
        await this.safeEditMessage(this.getDisplayText());
        return;
      }
    }

    // message not modified — not an error
    if (errMsg.includes('message is not modified')) {
      return;
    }

    structuredLog('error', 'draft-stream', 'edit_error', {
      chatId: this.state.chatId,
      messageId: this.state.messageId,
      error: errMsg,
    });
  }
}

/** Manages active draft streams per session key. */
export class DraftStreamManager {
  private activeDrafts = new Map<string, DraftStream>();

  create(
    telegram: Telegram,
    chatId: number,
    sessionKey: string,
    config?: Partial<DraftStreamConfig>,
  ): DraftStream {
    this.remove(sessionKey);

    const draft = new DraftStream(telegram, chatId, config);
    this.activeDrafts.set(sessionKey, draft);
    return draft;
  }

  get(sessionKey: string): DraftStream | undefined {
    return this.activeDrafts.get(sessionKey);
  }

  remove(sessionKey: string): void {
    const existing = this.activeDrafts.get(sessionKey);
    if (existing) {
      existing.cancel().catch(() => {});
      this.activeDrafts.delete(sessionKey);
    }
  }

  /** Route incoming cli:stream chunk to correct draft. */
  async handleStreamChunk(sessionKey: string, chunk: string): Promise<void> {
    const draft = this.activeDrafts.get(sessionKey);
    if (draft) {
      await draft.append(chunk);
    }
  }

  /** Handle cli:complete — flush draft and cleanup. */
  async handleComplete(sessionKey: string): Promise<void> {
    const draft = this.activeDrafts.get(sessionKey);
    if (draft) {
      await draft.flush();
      this.activeDrafts.delete(sessionKey);
    }
  }

  get size(): number {
    return this.activeDrafts.size;
  }
}
