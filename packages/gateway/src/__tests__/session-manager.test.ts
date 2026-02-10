import { describe, it, expect } from 'vitest';

// Since SessionManager has heavy tmux dependencies, we test the pure functions
// by extracting the filter logic and testing it directly.

/**
 * Replicated stripAnsi for testing
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ' ')  // CSI sequences → space
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[()][AB012]/g, '')       // Character set selection
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[\?]?[0-9;]*[hlm]/g, '') // Mode set/reset
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[=>]/g, '')              // Keypad mode sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[\??\d*[;]?\d*[A-Za-z]/g, '') // Catch remaining CSI
    .replace(/[^\S\n]{2,}/g, ' ');         // Collapse multiple spaces/tabs (preserve newlines)
}

/**
 * Replicated filterOutput logic for testing (same as SessionManager.filterOutput)
 * This avoids needing to instantiate SessionManager which requires tmux.
 * Updated for new Claude CLI output format (⏺ responses, ⎿ tool results, star spinners)
 */
function filterOutput(content: string): string {
  // Strip ANSI escape codes and control characters first
  let cleaned = stripAnsi(content);
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x08\x0e-\x1f]/g, '');
  cleaned = cleaned.replace(/\r/g, '');

  const lines = cleaned.split('\n');
  const filtered: string[] = [];
  let lastLineWasEmpty = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // === ALLOWLIST (pass immediately) ===

    // Claude response lines (⏺ prefix = AI output or tool call)
    if (/^\s*⏺/.test(line)) {
      const responseText = trimmed.replace(/^⏺\s*/, '');
      if (responseText.length > 0) {
        filtered.push(responseText);
        lastLineWasEmpty = false;
        continue;
      }
    }

    // Tool result lines (⎿ prefix)
    if (/^\s*⎿/.test(line)) {
      const resultText = trimmed.replace(/^⎿\s*/, '');
      if (resultText.length > 0) {
        filtered.push('  ' + resultText);
        lastLineWasEmpty = false;
        continue;
      }
    }

    // Codex response lines (• prefix, but NOT progress indicators)
    if (/^\s*•/.test(line) && !/Working\s*\(\d+s/.test(line)) {
      const responseText = trimmed.replace(/^•\s*/, '');
      if (responseText.length > 0) {
        filtered.push(responseText);
        lastLineWasEmpty = false;
        continue;
      }
    }

    // === BLOCKLIST (noise removal) ===

    // Claude Code banner patterns
    if (line.includes('▐▛███▜▌') || line.includes('▝▜█████▛▘') || line.includes('▘▘ ▝▝')) continue;
    if (line.includes('Claude Code v')) continue;
    if (/Opus \d|Sonnet \d|Haiku \d/.test(line) && line.includes('Claude')) continue;

    // Codex CLI banner box
    if (/^[╭╰]─/.test(trimmed) || /─[╮╯]$/.test(trimmed)) continue;
    if (/^│.*OpenAI Codex/.test(trimmed)) continue;
    if (/^│.*model:/.test(trimmed)) continue;
    if (/^│.*directory:/.test(trimmed)) continue;
    if (/^│\s*$/.test(trimmed)) continue;
    // Codex CLI prompt
    if (/^[\s]*›/.test(line)) continue;
    // Codex status lines
    if (/\?\s*for shortcuts/.test(line)) continue;
    if (/\d+%\s*context left/.test(line)) continue;
    if (/Tip:.*Try|Tip:.*New/.test(line)) continue;
    if (/•\s*Working\s*\(\d+s/.test(line)) continue;
    if (/model:\s+loading/.test(line)) continue;
    if (/codex\s+app/i.test(line) || /chatgpt\.com\/codex/.test(line)) continue;
    if (/Improve documentation in @/.test(line)) continue;

    // Horizontal dividers
    if (/^[─━]{20,}$/.test(trimmed)) continue;

    // "Try" suggestions
    if (line.includes('Try "write a test') || line.includes('Try "explain')) continue;

    // User prompt lines (❯ for Claude, › for Codex — both blocked above)
    if (/^[\s]*❯/.test(line)) continue;

    // New-format status bar (pipe-delimited with emojis)
    if (/🤖.*│/.test(line) || /📁.*│/.test(line)) continue;
    if (/🔷.*│/.test(line) || /💎.*│/.test(line)) continue;
    // Legacy status bar
    if (/\d+[kK]?\s*tokens?/i.test(line) && /\$[\d.]+/.test(line)) continue;

    // New-format spinner/progress (star/dot chars)
    if (/^[\s]*[✶✳✢✻✽·]/.test(line)) continue;
    // Legacy braille spinner
    if (/^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) continue;

    // Progress status lines
    if (/^[\s]*(Thinking|Working|Reading|Writing|Searching|Running|Harmonizing|Schlepping)\.{2,}$/i.test(trimmed)) continue;

    // Permission bypass prompt
    if (/^[\s]*⏵/.test(line)) continue;

    // Context/compact notification
    if (/Context left until auto-compact/i.test(line)) continue;

    // Lines that are only box-drawing or block chars
    if (/^[\s░▒▓█▄▀│├└┘┐┌─━]+$/.test(trimmed)) continue;

    // Consecutive empty lines (keep max 1)
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
  // === ALLOWLIST tests (⏺ and ⎿) ===

  it('should extract ⏺ response lines (strip prefix)', () => {
    const input = '⏺ 안녕하세요! 코드를 분석하겠습니다.';
    const result = filterOutput(input);
    expect(result).toBe('안녕하세요! 코드를 분석하겠습니다.');
  });

  it('should extract ⏺ tool call lines', () => {
    const input = '⏺ Bash(command: "ls -la")';
    const result = filterOutput(input);
    expect(result).toBe('Bash(command: "ls -la")');
  });

  it('should extract ⎿ tool result lines with indent', () => {
    const input = '  ⎿ total 42\n  ⎿ drwxr-xr-x  5 user staff';
    const result = filterOutput(input);
    // trimmed removes leading spaces, then ⎿ is stripped, then '  ' is prepended
    // But final .trim() removes leading whitespace from the entire result
    // stripAnsi collapses multiple spaces/tabs, so 'drwxr-xr-x  5' becomes 'drwxr-xr-x 5'
    expect(result).toBe('total 42\n  drwxr-xr-x 5 user staff');
  });

  it('should handle mixed ⏺ response and ⎿ result', () => {
    const input = '⏺ Read(file_path: "/src/index.ts")\n  ⎿ import express from "express";\n  ⎿ const app = express();';
    const result = filterOutput(input);
    expect(result).toBe('Read(file_path: "/src/index.ts")\n  import express from "express";\n  const app = express();');
  });

  it('should pass through empty ⏺ as plain text (not matched by allowlist)', () => {
    const input = '⏺\n⏺ Actual content';
    const result = filterOutput(input);
    // Bare ⏺ without content doesn't match allowlist (empty responseText)
    // and doesn't match any blocklist pattern, so it passes through
    expect(result).toBe('⏺\nActual content');
  });

  // === BLOCKLIST tests ===

  it('should keep normal plain text output', () => {
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

  it('should remove legacy braille spinner lines', () => {
    const input = '⠋ Loading...\nResult is ready';
    const result = filterOutput(input);
    expect(result).toBe('Result is ready');
  });

  it('should remove new star spinners', () => {
    const input = '✶ Processing...\n✳ Still working\n✢ Almost done\nResult is ready';
    const result = filterOutput(input);
    expect(result).toBe('Result is ready');
  });

  it('should remove dot spinner', () => {
    const input = '· Thinking\nResult';
    const result = filterOutput(input);
    expect(result).toBe('Result');
  });

  it('should remove new pipe-delimited status bar', () => {
    const input = '🤖Opus│████│78%│155K/200K│$14.62\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove status bar with 📁 and │', () => {
    const input = '📁/Users/jobc/dev/olympus│main\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove legacy status bar with emojis (no pipe)', () => {
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

  it('should remove Thinking/Working/Harmonizing lines', () => {
    const input = 'Thinking...\nWorking...\nHarmonizing...\nHere is the result';
    const result = filterOutput(input);
    expect(result).toBe('Here is the result');
  });

  it('should remove "Try" suggestions', () => {
    const input = 'Try "write a test for this"\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove permission bypass prompts (⏵)', () => {
    const input = '⏵⏵ bypass permissions on\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove context compact notification', () => {
    const input = 'Context left until auto-compact: 15%\nActual output';
    const result = filterOutput(input);
    expect(result).toBe('Actual output');
  });

  it('should remove box-drawing only lines', () => {
    const input = '│├└┘┐┌─━\nContent';
    const result = filterOutput(input);
    expect(result).toBe('Content');
  });

  // === Format/cleanup tests ===

  it('should preserve code blocks', () => {
    const input = '```typescript\nfunction foo() {\n  return 42;\n}\n```';
    const result = filterOutput(input);
    // stripAnsi collapses leading spaces: '  return' → ' return'
    expect(result).toBe('```typescript\nfunction foo() {\n return 42;\n}\n```');
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
    const input = '⠋ Loading...\n❯ command\n🤖Opus│status│bar';
    expect(filterOutput(input)).toBe('');
  });

  it('should strip control characters', () => {
    const input = 'Hello\x01\x02World';
    const result = filterOutput(input);
    expect(result).toBe('HelloWorld');
  });

  it('should strip \\r carriage returns', () => {
    const input = 'Line 1\r\nLine 2';
    const result = filterOutput(input);
    expect(result).toBe('Line 1\nLine 2');
  });

  it('should preserve lines with special characters in content', () => {
    const input = 'const a = `${hello}`;\nconst b = $HOME;';
    const result = filterOutput(input);
    expect(result).toBe(input);
  });

  it('should strip ANSI escape sequences', () => {
    const input = '\x1b[2mDimmed text\x1b[0m\nNormal text';
    const result = filterOutput(input);
    // CSI sequences are replaced with space, then trailing spaces collapse
    expect(result).toBe('Dimmed text \nNormal text');
  });

  it('should strip ANSI color codes', () => {
    const input = '\x1b[38;2;136;136;136mColored\x1b[0m output';
    const result = filterOutput(input);
    expect(result).toBe('Colored output');
  });

  // === Real-world integration test ===

  it('should correctly process a real Claude CLI session', () => {
    const input = [
      '  ✶ Thinking...',
      '🤖Opus│████│78%│155K/200K│$14.62',
      '⏺ 분석 결과를 알려드리겠습니다.',
      '',
      '⏺ Read(file_path: "/src/index.ts")',
      '  ⎿ import express from "express";',
      '  ⎿ const app = express();',
      '',
      '⏺ 코드가 정상적으로 작동합니다.',
      '❯ ',
    ].join('\n');
    const result = filterOutput(input);
    expect(result).toBe([
      '분석 결과를 알려드리겠습니다.',
      '',
      'Read(file_path: "/src/index.ts")',
      '  import express from "express";',
      '  const app = express();',
      '',
      '코드가 정상적으로 작동합니다.',
    ].join('\n'));
  });

  // === Codex CLI tests ===

  it('should extract • response lines from Codex (strip prefix)', () => {
    const input = '• 안녕하세요. 무엇을 도와드릴까요?';
    const result = filterOutput(input);
    expect(result).toBe('안녕하세요. 무엇을 도와드릴까요?');
  });

  it('should remove Codex banner box', () => {
    const input = [
      '╭────────────────────────────────────────────────────╮',
      '│ >_ OpenAI Codex (v0.98.0)                          │',
      '│                                                    │',
      '│ model:     gpt-5.3-codex medium   /model to change │',
      '│ directory: ~/dev/olympus                           │',
      '╰────────────────────────────────────────────────────╯',
      '',
      '• Here is the actual response',
    ].join('\n');
    const result = filterOutput(input);
    expect(result).toBe('Here is the actual response');
  });

  it('should remove Codex prompt lines (›)', () => {
    const input = '› hello\n• Response here';
    const result = filterOutput(input);
    expect(result).toBe('Response here');
  });

  it('should remove Codex progress indicator', () => {
    const input = '• Working (5s • esc to interrupt)\n• Done! Files updated.';
    const result = filterOutput(input);
    expect(result).toBe('Done! Files updated.');
  });

  it('should remove Codex status lines', () => {
    const input = [
      '? for shortcuts                                            100% context left',
      'Tip: New Try the Codex App with 2x rate limits until April 2nd.',
      '• Actual content here',
    ].join('\n');
    const result = filterOutput(input);
    expect(result).toBe('Actual content here');
  });

  it('should remove Codex placeholder prompt', () => {
    const input = 'Improve documentation in @filename\n• response';
    const result = filterOutput(input);
    expect(result).toBe('response');
  });

  it('should correctly process a real Codex CLI session', () => {
    const input = [
      '╭───────────────────────────────────────╮',
      '│ >_ OpenAI Codex (v0.98.0)             │',
      '│                                       │',
      '│ model:     gpt-5.3-codex medium       │',
      '│ directory: ~/dev/olympus              │',
      '╰───────────────────────────────────────╯',
      '',
      '  Tip: New Try the Codex App',
      '',
      '› 테스트 돌려줘',
      '',
      '• Working (3s • esc to interrupt)',
      '',
      '• 테스트를 실행하겠습니다.',
      '• pnpm test 명령을 실행합니다.',
      '',
      '• 전체 테스트 통과했습니다.',
      '',
      '› Improve documentation in @filename',
      '',
      '  ? for shortcuts                                            100% context left',
    ].join('\n');
    const result = filterOutput(input);
    expect(result).toBe([
      '테스트를 실행하겠습니다.',
      'pnpm test 명령을 실행합니다.',
      '',
      '전체 테스트 통과했습니다.',
    ].join('\n'));
  });
});

describe('stripAnsi', () => {
  it('should strip CSI sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe(' red ');
  });

  it('should strip OSC sequences', () => {
    expect(stripAnsi('\x1b]0;title\x07text')).toBe('text');
  });

  it('should handle text without ANSI codes', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
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
