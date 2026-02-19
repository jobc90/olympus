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
  /Flowing…?\s*$/,              // Flowing animation
  /^\([\dm\s]+s?\s*[·•]\s*↓/,  // Thinking duration
  /^[-─═]{3,}\s*$/,            // Horizontal dividers
  /^\s*\d+\s*[│|]\s*$/,       // Table borders (empty)
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

export function filterForApi(text: string): FilterResult {
  return filterResponse(text, DEFAULT_FILTER_CONFIG);
}

export function filterStreamChunk(text: string): FilterResult {
  return filterResponse(text, STREAMING_FILTER_CONFIG);
}
