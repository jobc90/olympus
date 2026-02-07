import { describe, it, expect } from 'vitest';

// Since SessionManager has heavy tmux dependencies, we test the pure functions
// by extracting the filter logic and testing it directly.

/**
 * Replicated filterOutput logic for testing (same as SessionManager.filterOutput)
 * This avoids needing to instantiate SessionManager which requires tmux.
 */
function filterOutput(content: string): string {
  const lines = content.split('\n');
  const filtered: string[] = [];
  let lastLineWasEmpty = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip Claude Code banner patterns
    if (line.includes('▐▛███▜▌') || line.includes('▝▜█████▛▘') || line.includes('▘▘ ▝▝')) continue;
    if (line.includes('Claude Code v')) continue;
    if (/Opus \d|Sonnet \d|Haiku \d/.test(line) && line.includes('Claude')) continue;

    // Skip horizontal dividers
    if (/^[─━]{20,}$/.test(trimmed)) continue;

    // Skip "Try" suggestions
    if (line.includes('Try "write a test') || line.includes('Try "explain')) continue;

    // Skip user prompt lines
    if (/^[\s]*❯/.test(line)) continue;

    // Skip status bar lines
    if (line.includes('🤖') || line.includes('📁') || line.includes('🔷') || line.includes('💎')) continue;
    if (/\d+[kK]?\s*tokens?/i.test(line) && /\$[\d.]+/.test(line)) continue;

    // Skip spinner/progress indicators
    if (/^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) continue;

    // Skip transient status lines
    if (/^[\s]*(Thinking|Working|Reading|Writing|Searching|Running)\.\.\./i.test(trimmed)) continue;

    // Consecutive empty line dedup
    if (!trimmed) {
      if (lastLineWasEmpty) continue;
      lastLineWasEmpty = true;
    } else {
      lastLineWasEmpty = false;
    }

    filtered.push(line);
  }

  return filtered.join('\n').trim();
}

/**
 * Replicated validateTmuxTarget for testing
 */
function validateTmuxTarget(target: string): boolean {
  return /^[a-zA-Z0-9_:-]+$/.test(target);
}

describe('filterOutput', () => {
  it('should keep normal Claude AI output', () => {
    const input = 'Here is the answer to your question.\nThe code looks correct.';
    const result = filterOutput(input);
    expect(result).toBe(input);
  });

  it('should remove Claude Code banner', () => {
    const input = '▐▛███▜▌ Claude Code\nHello from Claude';
    const result = filterOutput(input);
    expect(result).toBe('Hello from Claude');
  });

  it('should remove version line', () => {
    const input = 'Claude Code v1.2.3\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove spinner lines', () => {
    const input = '⠋ Loading...\nResult is ready';
    const result = filterOutput(input);
    expect(result).toBe('Result is ready');
  });

  it('should remove status bar lines with emojis', () => {
    const input = '🤖 Opus 4 | 📁 src/ | 🔷 15k tokens\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove token/cost lines', () => {
    const input = '150k tokens | $0.45\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove prompt lines', () => {
    const input = '❯ some command\nOutput from command';
    const result = filterOutput(input);
    expect(result).toBe('Output from command');
  });

  it('should remove horizontal dividers', () => {
    const input = '──────────────────────\nContent after divider';
    const result = filterOutput(input);
    expect(result).toBe('Content after divider');
  });

  it('should remove Thinking/Working lines', () => {
    const input = 'Thinking...\nWorking...\nHere is the result';
    const result = filterOutput(input);
    expect(result).toBe('Here is the result');
  });

  it('should remove "Try" suggestions', () => {
    const input = 'Try "write a test for this"\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should preserve code blocks', () => {
    const input = '```typescript\nfunction foo() {\n  return 42;\n}\n```';
    const result = filterOutput(input);
    expect(result).toBe(input);
  });

  it('should preserve single empty lines between content', () => {
    const input = 'Line 1\n\nLine 2';
    const result = filterOutput(input);
    expect(result).toBe('Line 1\n\nLine 2');
  });

  it('should collapse consecutive empty lines', () => {
    const input = 'Line 1\n\n\n\nLine 2';
    const result = filterOutput(input);
    expect(result).toBe('Line 1\n\nLine 2');
  });

  it('should handle empty input', () => {
    expect(filterOutput('')).toBe('');
  });

  it('should handle input that is all noise', () => {
    const input = '⠋ Loading...\n❯ command\n🤖 status bar';
    expect(filterOutput(input)).toBe('');
  });

  it('should preserve lines with special characters in content', () => {
    const input = 'const a = `${hello}`;\nconst b = $HOME;';
    const result = filterOutput(input);
    expect(result).toBe(input);
  });
});

describe('validateTmuxTarget', () => {
  it('should accept valid session names', () => {
    expect(validateTmuxTarget('olympus-main')).toBe(true);
    expect(validateTmuxTarget('my_session')).toBe(true);
    expect(validateTmuxTarget('session123')).toBe(true);
  });

  it('should accept session:window format', () => {
    expect(validateTmuxTarget('olympus-main:editor')).toBe(true);
    expect(validateTmuxTarget('session:0')).toBe(true);
  });

  it('should reject shell injection attempts', () => {
    expect(validateTmuxTarget('session;rm -rf /')).toBe(false);
    expect(validateTmuxTarget('session$(whoami)')).toBe(false);
    expect(validateTmuxTarget('session`id`')).toBe(false);
    expect(validateTmuxTarget('session|cat /etc/passwd')).toBe(false);
  });

  it('should reject spaces', () => {
    expect(validateTmuxTarget('my session')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(validateTmuxTarget('')).toBe(false);
  });

  it('should reject special characters', () => {
    expect(validateTmuxTarget('session&')).toBe(false);
    expect(validateTmuxTarget('session/')).toBe(false);
    expect(validateTmuxTarget('../escape')).toBe(false);
  });
});
