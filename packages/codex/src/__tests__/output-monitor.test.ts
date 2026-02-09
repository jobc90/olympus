import { describe, it, expect } from 'vitest';
import { OutputMonitor } from '../output-monitor.js';

describe('OutputMonitor', () => {
  describe('PROMPT_PATTERNS', () => {
    it('should match basic prompt', () => {
      expect(OutputMonitor.PROMPT_PATTERNS.some(p => p.test('❯'))).toBe(true);
      expect(OutputMonitor.PROMPT_PATTERNS.some(p => p.test('❯ '))).toBe(true);
    });

    it('should match prompt with previous input', () => {
      expect(OutputMonitor.PROMPT_PATTERNS.some(p => p.test('  ❯ some command'))).toBe(true);
    });

    it('should match bash prompt', () => {
      expect(OutputMonitor.PROMPT_PATTERNS.some(p => p.test('$ '))).toBe(true);
    });
  });

  describe('BUSY_PATTERNS', () => {
    it('should match spinner characters', () => {
      expect(OutputMonitor.BUSY_PATTERNS.some(p => p.test('⠋ Loading...'))).toBe(true);
      expect(OutputMonitor.BUSY_PATTERNS.some(p => p.test('⠙ Processing'))).toBe(true);
    });

    it('should match thinking indicator', () => {
      expect(OutputMonitor.BUSY_PATTERNS.some(p => p.test('(thinking)'))).toBe(true);
    });

    it('should match working indicator', () => {
      expect(OutputMonitor.BUSY_PATTERNS.some(p => p.test('Working...'))).toBe(true);
    });
  });

  describe('COMPLETION_SIGNALS', () => {
    it('should match done signal', () => {
      expect(OutputMonitor.COMPLETION_SIGNALS.some(p => p.test('⏺ Done'))).toBe(true);
      expect(OutputMonitor.COMPLETION_SIGNALS.some(p => p.test('⏺ 완료'))).toBe(true);
    });

    it('should match test pass signal', () => {
      expect(OutputMonitor.COMPLETION_SIGNALS.some(p => p.test('test 42 passed'))).toBe(true);
    });

    it('should match build succeeded', () => {
      expect(OutputMonitor.COMPLETION_SIGNALS.some(p => p.test('Build succeeded'))).toBe(true);
    });
  });

  describe('filterOutput', () => {
    it('should strip ANSI codes', () => {
      const monitor = new OutputMonitor('test', 'test-session', '/tmp/test.log');
      const result = monitor.filterOutput('\x1b[32mGreen text\x1b[0m');
      expect(result).toBe('Green text');
    });

    it('should filter noise lines', () => {
      const monitor = new OutputMonitor('test', 'test-session', '/tmp/test.log');
      const input = '🤖 1 📁 /dev 🔷 opus 💎 Pro\nActual content here\n❯\n';
      const result = monitor.filterOutput(input);
      expect(result).toContain('Actual content here');
      expect(result).not.toContain('🤖');
      expect(result).not.toContain('❯');
    });

    it('should filter spinner lines', () => {
      const monitor = new OutputMonitor('test', 'test-session', '/tmp/test.log');
      const result = monitor.filterOutput('⠋ Loading files...\nDone loading');
      expect(result).not.toContain('⠋');
      expect(result).toContain('Done loading');
    });

    it('should handle empty input', () => {
      const monitor = new OutputMonitor('test', 'test-session', '/tmp/test.log');
      expect(monitor.filterOutput('')).toBe('');
    });
  });

  describe('constructor', () => {
    it('should create with correct sessionId', () => {
      const monitor = new OutputMonitor('abc123', 'session-name', '/tmp/log.txt');
      expect(monitor.sessionId).toBe('abc123');
    });

    it('should not be running initially', () => {
      const monitor = new OutputMonitor('test', 'test', '/tmp/test.log');
      expect(monitor.running).toBe(false);
    });
  });
});
