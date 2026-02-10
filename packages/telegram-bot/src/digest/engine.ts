/**
 * Smart Digest Engine
 * Extracts key results from Claude CLI output for Telegram delivery.
 * Rule-based: no external AI calls, fast and deterministic.
 */

import type { ScoredLine, DigestBlock, DigestResult, LineCategory } from './types.js';
import { DEFAULT_DIGEST_CONFIG } from './types.js';
import {
  BUILD_PATTERNS,
  TEST_PATTERNS,
  COMMIT_PATTERNS,
  ERROR_PATTERNS,
  PHASE_PATTERNS,
  CHANGE_PATTERNS,
  QUALITY_PATTERNS,
  NOISE_PATTERNS,
  SECRET_PATTERNS,
} from './patterns.js';

/** Score thresholds per category */
const CATEGORY_SCORES: Record<LineCategory, number> = {
  error: 5,
  build: 4,
  test: 4,
  quality: 4,
  commit: 3,
  phase: 3,
  change: 2,
  other: 1,
  noise: 0,
};

/** Emoji prefixes per category */
const CATEGORY_EMOJI: Partial<Record<LineCategory, string>> = {
  error: '❌',
  build: '🔨',
  test: '🧪',
  quality: '✅',
  commit: '🔀',
  phase: '📍',
  change: '📝',
};

/**
 * Classify a single line into a category
 */
export function classifyLine(line: string): { category: LineCategory; score: number } {
  const trimmed = line.trim();

  // Check noise first (early exit)
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'noise', score: 0 };
    }
  }

  // Check build/test BEFORE error — "Tests: 64 passed, 0 failed" is a test result, not an error
  for (const pattern of BUILD_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'build', score: CATEGORY_SCORES.build };
    }
  }

  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'test', score: CATEGORY_SCORES.test };
    }
  }

  // Error patterns checked after build/test
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'error', score: CATEGORY_SCORES.error };
    }
  }

  for (const pattern of QUALITY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'quality', score: CATEGORY_SCORES.quality };
    }
  }

  for (const pattern of COMMIT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'commit', score: CATEGORY_SCORES.commit };
    }
  }

  for (const pattern of PHASE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'phase', score: CATEGORY_SCORES.phase };
    }
  }

  for (const pattern of CHANGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'change', score: CATEGORY_SCORES.change };
    }
  }

  // Non-empty, non-noise line
  if (trimmed.length > 0) {
    return { category: 'other', score: CATEGORY_SCORES.other };
  }

  return { category: 'noise', score: 0 };
}

/**
 * Group consecutive scored lines into semantic blocks.
 * Lines of the same category or adjacent lines form a block.
 * Error blocks include surrounding context (1 line before/after).
 */
export function groupIntoBlocks(lines: ScoredLine[]): DigestBlock[] {
  const blocks: DigestBlock[] = [];
  let currentBlock: ScoredLine[] = [];
  let currentCategory: LineCategory = 'noise';

  for (const line of lines) {
    if (line.category === 'noise') continue;

    // Start new block if category changes significantly
    if (currentBlock.length > 0 && line.category !== currentCategory) {
      // Keep error blocks with nearby context
      if (currentCategory === 'error' && line.score >= 1) {
        currentBlock.push(line);
        continue;
      }
      if (line.category === 'error' && currentBlock.length > 0) {
        // Include last line of previous block as error context
        blocks.push({
          lines: [...currentBlock],
          maxScore: Math.max(...currentBlock.map(l => l.score)),
          category: currentCategory,
        });
        currentBlock = [];
      } else {
        blocks.push({
          lines: [...currentBlock],
          maxScore: Math.max(...currentBlock.map(l => l.score)),
          category: currentCategory,
        });
        currentBlock = [];
      }
    }

    currentBlock.push(line);
    currentCategory = line.category;
  }

  // Flush remaining block
  if (currentBlock.length > 0) {
    blocks.push({
      lines: currentBlock,
      maxScore: Math.max(...currentBlock.map(l => l.score)),
      category: currentCategory,
    });
  }

  return blocks;
}

/**
 * Build a digest string from blocks within the character budget.
 * Prioritizes highest-scoring blocks first.
 */
export function buildDigest(blocks: DigestBlock[], maxLength: number = DEFAULT_DIGEST_CONFIG.maxLength): string {
  if (blocks.length === 0) return '';

  // If no high-signal blocks (score >= 3), give more budget to lower-signal content
  const hasHighSignal = blocks.some(b => b.maxScore >= 3);
  const effectiveMaxLength = hasHighSignal ? maxLength : Math.floor(maxLength * 1.5);

  // Sort blocks by maxScore descending, then by original order for ties
  const indexed = blocks.map((b, i) => ({ block: b, originalIndex: i }));
  indexed.sort((a, b) => {
    if (b.block.maxScore !== a.block.maxScore) return b.block.maxScore - a.block.maxScore;
    return a.originalIndex - b.originalIndex;
  });

  const selectedLines: { text: string; originalIndex: number }[] = [];
  let totalLength = 0;

  for (const { block, originalIndex } of indexed) {
    const emoji = CATEGORY_EMOJI[block.category] ?? '';

    for (const line of block.lines) {
      const prefix = emoji && line === block.lines[0] ? `${emoji} ` : '  ';
      const formatted = `${prefix}${line.text.trim()}`;

      if (totalLength + formatted.length + 1 > effectiveMaxLength) {
        // Budget exceeded — stop adding
        break;
      }

      selectedLines.push({ text: formatted, originalIndex });
      totalLength += formatted.length + 1; // +1 for newline
    }

    if (totalLength >= effectiveMaxLength) break;
  }

  // Re-sort by original order for coherent output
  selectedLines.sort((a, b) => a.originalIndex - b.originalIndex);

  return selectedLines.map(l => l.text).join('\n');
}

/**
 * Redact secrets from text before sending to Telegram.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset regex state for global patterns
    const regex = new RegExp(pattern.source, pattern.flags);
    result = result.replace(regex, (match) => {
      // Keep first 4 chars, mask the rest
      if (match.length > 8) {
        return match.slice(0, 4) + '***';
      }
      return '***';
    });
  }
  return result;
}

/**
 * Main digest function: transform raw output into a concise summary.
 */
export function digestOutput(content: string, maxLength: number = DEFAULT_DIGEST_CONFIG.maxLength): DigestResult {
  if (!content || !content.trim()) {
    return { summary: '', hasErrors: false, signalCount: 0, originalLength: 0 };
  }

  const lines = content.split('\n');

  // Step 1: Classify each line
  const scoredLines: ScoredLine[] = lines.map(line => {
    const { category, score } = classifyLine(line);
    return { text: line, score, category };
  });

  // Step 2: Count signals and check for errors
  const signalLines = scoredLines.filter(l => l.score > 0);
  const hasErrors = scoredLines.some(l => l.category === 'error');

  // Step 3: Group into blocks
  const blocks = groupIntoBlocks(scoredLines);

  // Step 4: Build digest within budget
  let summary = buildDigest(blocks, maxLength);

  // Step 5: Fallback — if digest is empty but there's meaningful content,
  // include it directly. This handles natural language responses (e.g., from orchestrator)
  // where no BUILD/TEST/COMMIT patterns match.
  if (!summary && content.trim().length > 0) {
    const meaningful = lines
      .filter(l => l.trim().length > 0)
      .filter(l => !NOISE_PATTERNS.some(p => p.test(l.trim())));

    if (meaningful.length > 0) {
      // Take up to 20 lines (not just 3) for natural language responses
      summary = meaningful.slice(0, 20).join('\n');
      if (summary.length > maxLength) {
        summary = summary.slice(0, maxLength - 3) + '...';
      }
    }
  }

  // Step 5b: If buildDigest produced only low-signal content that was too short,
  // but there are many "other" category lines, supplement with them
  if (summary && summary.length < 50 && signalLines.length > 3) {
    const otherLines = scoredLines
      .filter(l => l.category === 'other' && l.text.trim().length > 5)
      .map(l => l.text.trim());
    if (otherLines.length > 0) {
      const supplement = otherLines.slice(0, 10).join('\n');
      const combined = summary + '\n' + supplement;
      summary = combined.length > maxLength
        ? combined.slice(0, maxLength - 3) + '...'
        : combined;
    }
  }

  // Step 6: Redact secrets
  summary = redactSecrets(summary);

  return {
    summary,
    hasErrors,
    signalCount: signalLines.length,
    originalLength: content.length,
  };
}

/**
 * Format a digest result with session prefix for Telegram.
 */
export function formatDigest(result: DigestResult, sessionPrefix: string): string {
  if (!result.summary) {
    // No useful content — return empty to suppress sending
    return '';
  }

  const header = result.hasErrors ? `${sessionPrefix} ⚠️` : `${sessionPrefix}`;
  return `${header}\n\n${result.summary}`;
}
