/**
 * Draft Streaming types for Telegram real-time message updates.
 * Implements editMessageText-based streaming (1Hz throttle).
 */

/** Configuration for draft streaming behavior */
export interface DraftStreamConfig {
  /** Minimum characters before sending first message (push notification UX). Default: 30 */
  minCharsBeforeSend: number;
  /** Minimum ms between edits (Telegram rate limit). Default: 1000 */
  throttleMs: number;
  /** Max message length (Telegram limit). Default: 4096 */
  maxMessageLength: number;
  /** Don't break markdown code blocks during streaming. Default: true */
  markdownSafe: boolean;
}

/** Runtime state for an active draft stream */
export interface DraftStreamState {
  chatId: number;
  /** Telegram message ID, set after first send */
  messageId?: number;
  /** Accumulated text buffer */
  buffer: string;
  /** Timestamp of last successful edit */
  lastUpdateAt: number;
  /** Whether streaming is complete */
  isComplete: boolean;
  /** Messages that exceeded maxMessageLength */
  overflow: string[];
}

/** Events emitted during draft streaming lifecycle */
export type DraftStreamEvent =
  | { type: 'created'; chatId: number }
  | { type: 'first_send'; chatId: number; messageId: number }
  | { type: 'updated'; chatId: number; messageId: number; length: number }
  | { type: 'overflow'; chatId: number; newMessageId: number }
  | { type: 'completed'; chatId: number; totalLength: number }
  | { type: 'error'; chatId: number; error: string };

export const DEFAULT_DRAFT_STREAM_CONFIG: DraftStreamConfig = {
  minCharsBeforeSend: 30,
  throttleMs: 1000,
  maxMessageLength: 4096,
  markdownSafe: true,
};
