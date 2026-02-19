/**
 * Response filtering pipeline types.
 * 5-stage pipeline: ANSI → Markers → TUI Artifacts → Truncation → Markdown.
 */

/** Individual filter stage identifiers */
export type FilterStage =
  | 'ansi_strip'
  | 'marker_removal'
  | 'tui_artifact'
  | 'truncation'
  | 'markdown_format';

/** Client type determines which filter stages apply */
export type FilterClientType = 'telegram' | 'web' | 'tui' | 'api';

/** Configuration for the response filtering pipeline */
export interface ResponseFilterConfig {
  /** Which filter stages to apply (in order) */
  enabledStages: FilterStage[];
  /** Max output length. Default: 8000 */
  maxLength: number;
  /** Telegram-specific max length. Default: 4096 */
  telegramMaxLength: number;
  /** Don't truncate inside code blocks. Default: true */
  preserveCodeBlocks: boolean;
  /** Client type determines which stages apply */
  clientType?: FilterClientType;
}

/** Result of applying the filter pipeline */
export interface FilterResult {
  /** Filtered output text */
  text: string;
  /** Original text length before filtering */
  originalLength: number;
  /** Whether text was truncated */
  truncated: boolean;
  /** Stages that were actually applied */
  stagesApplied: FilterStage[];
  /** Markers/artifacts that were removed (for debugging) */
  removedMarkers: string[];
}

export const DEFAULT_FILTER_CONFIG: ResponseFilterConfig = {
  enabledStages: ['ansi_strip', 'marker_removal', 'tui_artifact', 'truncation'],
  maxLength: 8000,
  telegramMaxLength: 4096,
  preserveCodeBlocks: true,
  clientType: 'api',
};

export const TELEGRAM_FILTER_CONFIG: ResponseFilterConfig = {
  enabledStages: ['ansi_strip', 'marker_removal', 'tui_artifact', 'truncation', 'markdown_format'],
  maxLength: 4096,
  telegramMaxLength: 4096,
  preserveCodeBlocks: true,
  clientType: 'telegram',
};

export const STREAMING_FILTER_CONFIG: ResponseFilterConfig = {
  enabledStages: ['ansi_strip', 'marker_removal'],
  maxLength: 0,
  telegramMaxLength: 0,
  preserveCodeBlocks: false,
  clientType: 'api',
};
