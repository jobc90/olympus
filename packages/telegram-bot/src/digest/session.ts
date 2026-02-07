/**
 * DigestSession
 * Per-session buffer management with hybrid triggering:
 * - Immediate flush on error/completion patterns
 * - 5-second debounce for normal output
 * - 30-second TTL for inactive sessions
 */

import type { DigestConfig } from './types.js';
import { DEFAULT_DIGEST_CONFIG } from './types.js';
import { IMMEDIATE_FLUSH_PATTERNS } from './patterns.js';
import { digestOutput, formatDigest } from './engine.js';

export class DigestSession {
  private buffer = '';
  private debounceTimer: NodeJS.Timeout | null = null;
  private ttlTimer: NodeJS.Timeout | null = null;
  private config: DigestConfig;
  private onFlush: (text: string) => void;
  private sessionPrefix: string;

  constructor(
    sessionPrefix: string,
    onFlush: (text: string) => void,
    config?: Partial<DigestConfig>,
  ) {
    this.sessionPrefix = sessionPrefix;
    this.onFlush = onFlush;
    this.config = { ...DEFAULT_DIGEST_CONFIG, ...config };
    this.resetTtl();
  }

  /**
   * Push new content into the buffer.
   * Checks for immediate flush triggers, otherwise debounces.
   */
  push(content: string): void {
    if (!content || !content.trim()) return;

    this.buffer += (this.buffer ? '\n' : '') + content;
    this.resetTtl();

    // Check for buffer size overflow — flush first to preserve error context
    if (this.buffer.length > this.config.maxBufferSize) {
      this.flush();
      this.buffer = content;
      return;
    }

    // Check for immediate flush triggers
    if (this.shouldImmediateFlush(content)) {
      this.flush();
      return;
    }

    // Reset debounce timer
    this.resetDebounce();
  }

  /**
   * Flush the buffer: digest and send.
   */
  flush(): void {
    this.clearDebounce();

    if (!this.buffer.trim()) return;

    const content = this.buffer;
    this.buffer = '';

    const result = digestOutput(content, this.config.maxLength);
    const formatted = formatDigest(result, this.sessionPrefix);

    if (formatted.trim()) {
      this.onFlush(formatted);
    }
  }

  /**
   * Destroy the session: clear all timers and flush remaining buffer.
   */
  destroy(): void {
    this.flush();
    this.clearDebounce();
    this.clearTtl();
  }

  /**
   * Check if content has remaining buffer data.
   */
  get hasBuffer(): boolean {
    return this.buffer.trim().length > 0;
  }

  /**
   * Get current buffer size.
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  // === Private Methods ===

  private shouldImmediateFlush(content: string): boolean {
    for (const pattern of IMMEDIATE_FLUSH_PATTERNS) {
      if (pattern.test(content)) return true;
    }
    return false;
  }

  private resetDebounce(): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.config.bufferDebounceMs);
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private resetTtl(): void {
    this.clearTtl();
    this.ttlTimer = setTimeout(() => {
      // Flush and clean up on inactivity
      if (this.buffer.trim()) {
        this.flush();
      }
    }, this.config.bufferTtlMs);
  }

  private clearTtl(): void {
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
  }
}
