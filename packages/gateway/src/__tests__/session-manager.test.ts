import { describe, it, expect } from 'vitest';

// Since SessionManager has heavy tmux dependencies, we test the pure functions
// by extracting the logic and testing it directly.

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
 * Replicated validateTmuxTarget for testing
 */
function validateTmuxTarget(target: string): boolean {
  return /^[a-zA-Z0-9_:-]+$/.test(target);
}

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
