/**
 * Smart Digest Types
 * Telegram output summarization type definitions
 */

export type LineCategory = 'build' | 'test' | 'commit' | 'error' | 'phase' | 'change' | 'quality' | 'noise' | 'other';

export interface ScoredLine {
  text: string;
  score: number;
  category: LineCategory;
}

export interface DigestBlock {
  lines: ScoredLine[];
  maxScore: number;
  category: LineCategory;
}

export interface DigestResult {
  /** Formatted summary string ready to send */
  summary: string;
  /** Whether any errors were detected */
  hasErrors: boolean;
  /** Number of high-signal lines extracted */
  signalCount: number;
  /** Original content length */
  originalLength: number;
}

export interface DigestConfig {
  /** Max output length in chars (default: 800) */
  maxLength: number;
  /** Buffer flush debounce in ms (default: 5000) */
  bufferDebounceMs: number;
  /** Max buffer size in chars before forced flush (default: 8000) */
  maxBufferSize: number;
  /** Inactivity TTL in ms for buffer cleanup (default: 30000) */
  bufferTtlMs: number;
}

export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  maxLength: 1500,
  bufferDebounceMs: 5000,
  maxBufferSize: 8000,
  bufferTtlMs: 30000,
};
