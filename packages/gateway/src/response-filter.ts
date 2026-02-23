import type { ResponseFilterConfig, FilterResult, FilterStage } from '@olympus-dev/protocol';
import { DEFAULT_FILTER_CONFIG, TELEGRAM_FILTER_CONFIG, STREAMING_FILTER_CONFIG } from '@olympus-dev/protocol';

/** Enhanced ANSI stripping — handles CSI, OSC, charset switching, 2-char escape */
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\)?|\([A-Z0-9]|[NO].)/g;

function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_RE, '');
}

const SYSTEM_MARKER_PATTERNS = [
  /^⏺\s*/,                              // Claude output marker
  /HEARTBEAT(?:_OK)?/,                   // Heartbeat tokens
  /^\[(?:SYSTEM|DEBUG|INTERNAL)\]/i,     // System prefixed lines
  /^(?:Compiling|Building|Bundling)\.\.\./i, // Progress indicators
  /^\s*\[\d+\/\d+\]\s+/,               // Build progress [1/5]
];

function removeSystemMarkers(text: string, removedMarkers: string[]): string {
  const lines = text.split('\n');
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
  return collapseBlankLines(filtered.join('\n'), 2);
}

const TUI_ARTIFACT_PATTERNS = [
  /^[✢✳✶✻✽·\s]+$/,           // Spinner-only lines
  /^\(thinking\)\s*$/i,         // Thinking state
  /\(thinking\)/i,              // Inline thinking indicator
  /Flowing…?\s*$/,              // Flowing animation
  /Forming…?\s*$/i,             // Forming animation
  /Deliberating…?\s*$/i,        // Deliberating animation
  /Topsy-turvying…?\s*$/i,      // Topsy-turvying animation
  /^\([\dm\s]+s?\s*[·•]\s*↓/,  // Thinking duration
  /^\(\d+s?\s*[·•]\s*timeout\s+\d+m\)\s*$/i, // "(2s · timeout 2m)"
  /ctrl\+o\s*to\s*expand/i,     // Expand hint
  /shift\+tab\s*to\s*cycle/i,   // Mode cycle hint
  /bypass\s*permissions?\s*on/i, // Permission mode status
  /↓\s*[\d.]+k?\s*tokens?/i,    // token speed/usage line
  /\d+K?\/\d+K?\s*tokens?/i,    // token ratio line
  /[│|].*gemini.*preview/i,     // Gemini model status bar
  /[│|].*gpt-[\w.-]+/i,         // model status bar
  /🤖\s*(?:Opus|Sonnet|Haiku)/i, // model badge
  /[█▓▒░]{2,}\s*\d+%/,          // progress bar + percentage
  /^\s*[A-Za-z]\s*$/,           // fragmented single-letter lines
  /^\s*\d{1,5}\s*$/,            // fragmented numeric lines
  /^[✢✳✶✻✽·]?\s*[A-Za-z][A-Za-z-]{2,24}…(?:\s*\(thinking\))?$/i, // one-word ellipsis animation
  /^[✢✳✶✻✽·]?\s*(?:Processing|Forming|Flowing|Deliberating|Effecting|Thinking)…?(?:\s*thinking)?\s*$/i,
  /^[✢✳✶✻✽·]?\s*[A-Za-z][A-Za-z-]{2,24}…?thinking\s*$/i,
  /^[✢✳✶✻✽·]?\s*[A-Za-z][A-Za-z-]{2,24}…?\(thought[^)]*\)\s*$/i,
  /tip:\s*run\s*claude\s*--(?:continue|resume)/i,
  /^[-─═]{3,}\s*$/,            // Horizontal dividers
  /^\s*\d+\s*[│|]\s*$/,       // Table borders (empty)
  /^[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬─│═║]+\s*$/,  // Pure box-drawing lines
  /^[┌├└╔╠╚][─═┬┴╦╩┼╬]+[┐┤┘╗╣╝]\s*$/, // Full table border rows
  /^[│║]\s*[─═]+\s*[│║]\s*$/,           // Table separator rows
];

function removeTuiArtifacts(text: string, removedMarkers: string[]): string {
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    for (const pattern of TUI_ARTIFACT_PATTERNS) {
      if (pattern.test(line)) {
        removedMarkers.push(`[TUI] ${line.trim().slice(0, 30)}`);
        return false;
      }
    }
    return true;
  });
  return filtered.join('\n');
}

function smartTruncate(text: string, maxLen: number, preserveCodeBlocks: boolean): string {
  if (text.length <= maxLen) return text;

  let cutPoint = maxLen;

  if (preserveCodeBlocks) {
    const codeBlockPositions = findCodeBlockRanges(text);
    for (const [start, end] of codeBlockPositions) {
      if (cutPoint > start && cutPoint < end) {
        cutPoint = start;
        break;
      }
    }
  }

  // Try to cut at sentence boundary
  const sentenceEnd = text.lastIndexOf('. ', cutPoint);
  if (sentenceEnd > cutPoint * 0.8) {
    cutPoint = sentenceEnd + 1;
  } else {
    // Try line boundary
    const lineEnd = text.lastIndexOf('\n', cutPoint);
    if (lineEnd > cutPoint * 0.8) {
      cutPoint = lineEnd;
    }
  }

  return text.slice(0, cutPoint).trimEnd() + '\n\n... (truncated)';
}

function formatTelegramMarkdown(text: string): string {
  // Ensure all code blocks are properly closed
  const backtickCount = (text.match(/```/g) || []).length;
  if (backtickCount % 2 !== 0) {
    text += '\n```';
  }
  return text;
}

function collapseBlankLines(text: string, maxConsecutive: number): string {
  const pattern = new RegExp(`(\\n\\s*){${maxConsecutive + 1},}`, 'g');
  return text.replace(pattern, '\n'.repeat(maxConsecutive));
}

function findCodeBlockRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf('```', pos);
    if (start === -1) break;
    const end = text.indexOf('```', start + 3);
    if (end === -1) {
      ranges.push([start, text.length]);
      break;
    }
    ranges.push([start, end + 3]);
    pos = end + 3;
  }
  return ranges;
}

/**
 * Apply the response filter pipeline to text.
 */
export function filterResponse(text: string, config: ResponseFilterConfig): FilterResult {
  const removedMarkers: string[] = [];
  const stagesApplied: FilterStage[] = [];
  let result = text;
  const originalLength = text.length;

  for (const stage of config.enabledStages) {
    const before = result;
    switch (stage) {
      case 'ansi_strip':
        result = stripAnsiCodes(result);
        break;
      case 'marker_removal':
        result = removeSystemMarkers(result, removedMarkers);
        break;
      case 'tui_artifact':
        result = removeTuiArtifacts(result, removedMarkers);
        break;
      case 'truncation': {
        const maxLen = config.clientType === 'telegram' ? config.telegramMaxLength : config.maxLength;
        if (maxLen > 0) {
          result = smartTruncate(result, maxLen, config.preserveCodeBlocks);
        }
        break;
      }
      case 'markdown_format':
        result = formatTelegramMarkdown(result);
        break;
    }
    if (result !== before) {
      stagesApplied.push(stage);
    }
  }

  return {
    text: result,
    originalLength,
    truncated: result.length < originalLength && config.enabledStages.includes('truncation'),
    stagesApplied,
    removedMarkers,
  };
}

export function filterForTelegram(text: string): FilterResult {
  return filterResponse(text, TELEGRAM_FILTER_CONFIG);
}

/**
 * Sanitize briefing text — aggressive cleanup for Codex startup greeting.
 * Strips box-drawing tables, collapsed whitespace, and enforces length limit.
 */
export function sanitizeBriefing(text: string, maxLength = 1500): string {
  let result = stripAnsiCodes(text);

  // Remove lines that are box-drawing table structures
  const lines = result.split('\n');
  const cleaned = lines.filter(line => {
    const trimmed = line.trim();
    // Pure box-drawing border lines
    if (/^[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬─│═║\s]+$/.test(trimmed) && trimmed.length > 2) return false;
    // Table cell lines: │ content │ content │
    if (/^[│║].*[│║]$/.test(trimmed) && (trimmed.match(/[│║]/g)?.length ?? 0) >= 3) return false;
    // Horizontal dividers
    if (/^[-─═]{3,}$/.test(trimmed)) return false;
    // TUI artifacts
    for (const pattern of TUI_ARTIFACT_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }
    return true;
  });

  result = cleaned.join('\n');

  // Fix collapsed whitespace (Korean/CJK chars jammed together without spaces)
  // e.g. "ClaudeCLI를중심으로" → keep as-is (Korean doesn't use spaces between words heavily)
  // But fix "파일:cli/src" → "파일: cli/src"
  result = result.replace(/([가-힣]):/g, '$1: ');

  // Collapse excessive blank lines
  result = collapseBlankLines(result, 1);

  // Enforce max length
  if (result.length > maxLength) {
    const cutPoint = result.lastIndexOf('\n', maxLength);
    result = result.slice(0, cutPoint > maxLength * 0.7 ? cutPoint : maxLength).trimEnd();
    result += '\n\n... (요약 생략)';
  }

  return result.trim();
}

export function filterForApi(text: string): FilterResult {
  return filterResponse(text, DEFAULT_FILTER_CONFIG);
}

export function filterStreamChunk(text: string): FilterResult {
  return filterResponse(text, STREAMING_FILTER_CONFIG);
}
