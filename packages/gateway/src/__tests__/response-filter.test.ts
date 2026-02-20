import { describe, it, expect } from 'vitest';
import { filterResponse, filterForTelegram, filterForApi, filterStreamChunk } from '../response-filter.js';
import { DEFAULT_FILTER_CONFIG, TELEGRAM_FILTER_CONFIG, STREAMING_FILTER_CONFIG } from '@olympus-dev/protocol';

describe('filterResponse', () => {
  describe('ansi_strip stage', () => {
    it('should remove ANSI escape sequences', () => {
      const input = '\x1B[31mError\x1B[0m: something failed';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toBe('Error: something failed');
      expect(result.stagesApplied).toContain('ansi_strip');
    });

    it('should remove CSI color sequences', () => {
      const input = '\x1B[1;32mSuccess\x1B[0m and \x1B[4munderlined\x1B[0m';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toBe('Success and underlined');
    });

    it('should handle text without ANSI codes', () => {
      const input = 'plain text without codes';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toBe('plain text without codes');
      expect(result.stagesApplied).not.toContain('ansi_strip');
    });
  });

  describe('marker_removal stage', () => {
    it('should remove ⏺ markers', () => {
      const input = '⏺ Building project\nActual content here';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).not.toContain('⏺');
      expect(result.text).toContain('Actual content here');
    });

    it('should remove HEARTBEAT tokens', () => {
      const input = 'HEARTBEAT_OK\nReal output\nHEARTBEAT';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).not.toContain('HEARTBEAT');
      expect(result.text).toContain('Real output');
    });

    it('should remove system-prefixed lines', () => {
      const input = '[SYSTEM] internal message\n[DEBUG] trace info\nUser-facing output';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).not.toContain('[SYSTEM]');
      expect(result.text).not.toContain('[DEBUG]');
      expect(result.text).toContain('User-facing output');
    });

    it('should remove build progress indicators', () => {
      const input = 'Compiling...\n[1/5] Building module\nResult: success';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).not.toContain('Compiling...');
      expect(result.text).not.toContain('[1/5]');
      expect(result.text).toContain('Result: success');
    });
  });

  describe('tui_artifact stage', () => {
    it('should remove spinner-only lines', () => {
      const input = '✢✳✶✻✽\nActual content\n···';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toContain('Actual content');
      expect(result.text).not.toMatch(/^[✢✳✶✻✽·\s]+$/m);
    });

    it('should remove thinking state lines', () => {
      const input = '(thinking)\nSome result';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).not.toContain('(thinking)');
      expect(result.text).toContain('Some result');
    });

    it('should remove horizontal dividers', () => {
      const input = 'Header\n───────────\nContent\n═══════════\nFooter';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toContain('Header');
      expect(result.text).toContain('Content');
      expect(result.text).toContain('Footer');
    });

    it('should remove inline thinking fragments and spinner animations', () => {
      const input = [
        '✳ Deliberating… (thinking)',
        'D(thinking)',
        'e(thinking)',
        '✶(thinking)',
        'Real completion line',
      ].join('\n');
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toContain('Real completion line');
      expect(result.text).not.toContain('(thinking)');
      expect(result.text).not.toContain('Deliberating');
    });

    it('should remove status bar artifacts from PTY output', () => {
      const input = [
        '🤖 Opus │ ███░░░░░░░ 29%',
        '📁olympus (main*) │ 🔷 gpt-5.3-codex',
        '⏵⏵bypasspermissionson (shift+tabtocycle)',
        '47K/200K tokens',
        'Final answer: 작업이 완료되었습니다.',
      ].join('\n');
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toContain('Final answer: 작업이 완료되었습니다.');
      expect(result.text).not.toContain('gpt-5.3-codex');
      expect(result.text).not.toContain('bypasspermissionson');
      expect(result.text).not.toContain('47K/200K tokens');
    });

    it('should remove timeout banner style artifacts', () => {
      const input = '(2s · timeout 2m)\nForming…\nResult line';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toContain('Result line');
      expect(result.text).not.toContain('timeout 2m');
      expect(result.text).not.toContain('Forming');
    });
  });

  describe('truncation stage', () => {
    it('should truncate long text', () => {
      const input = 'a'.repeat(10000);
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text.length).toBeLessThan(input.length);
      expect(result.truncated).toBe(true);
      expect(result.text).toContain('(truncated)');
    });

    it('should not truncate short text', () => {
      const input = 'Short text';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.text).toBe('Short text');
      expect(result.truncated).toBe(false);
    });

    it('should use telegram max length for telegram client', () => {
      const input = 'a'.repeat(5000);
      const result = filterResponse(input, TELEGRAM_FILTER_CONFIG);
      expect(result.text.length).toBeLessThanOrEqual(4096 + 20); // + truncation suffix
      expect(result.truncated).toBe(true);
    });

    it('should try to cut at sentence boundary', () => {
      const text = 'First sentence. Second sentence. Third sentence. ' + 'a'.repeat(8000);
      const result = filterResponse(text, DEFAULT_FILTER_CONFIG);
      // Should cut at a sentence boundary if possible
      expect(result.truncated).toBe(true);
    });
  });

  describe('markdown_format stage', () => {
    it('should close unclosed code blocks for telegram', () => {
      const input = '```js\nconst x = 1;';
      const result = filterResponse(input, TELEGRAM_FILTER_CONFIG);
      const backtickCount = (result.text.match(/```/g) || []).length;
      expect(backtickCount % 2).toBe(0);
    });

    it('should not add closing backticks when already balanced', () => {
      const input = '```js\nconst x = 1;\n```';
      const result = filterResponse(input, TELEGRAM_FILTER_CONFIG);
      const backtickCount = (result.text.match(/```/g) || []).length;
      expect(backtickCount % 2).toBe(0);
    });
  });

  describe('pipeline metadata', () => {
    it('should report original length', () => {
      const input = 'a'.repeat(100);
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.originalLength).toBe(100);
    });

    it('should track removed markers', () => {
      const input = '⏺ marker\nContent\nHEARTBEAT';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.removedMarkers.length).toBeGreaterThan(0);
    });

    it('should list applied stages', () => {
      const input = '\x1B[31m⏺ test\x1B[0m';
      const result = filterResponse(input, DEFAULT_FILTER_CONFIG);
      expect(result.stagesApplied).toContain('ansi_strip');
      expect(result.stagesApplied).toContain('marker_removal');
    });
  });
});

describe('convenience functions', () => {
  it('filterForTelegram should include markdown_format', () => {
    const input = '```js\ncode';
    const result = filterForTelegram(input);
    const backtickCount = (result.text.match(/```/g) || []).length;
    expect(backtickCount % 2).toBe(0);
  });

  it('filterForApi should not include markdown_format', () => {
    const input = '```js\ncode';
    const result = filterForApi(input);
    // API filter doesn't add markdown_format, so unclosed block remains
    const backtickCount = (result.text.match(/```/g) || []).length;
    expect(backtickCount).toBe(1);
  });

  it('filterStreamChunk should only strip ANSI and markers', () => {
    const input = '\x1B[31mHEARTBEAT\x1B[0m\nHello World';
    const result = filterStreamChunk(input);
    expect(result.text).toContain('Hello World');
    expect(result.text).not.toContain('HEARTBEAT');
    // Should not truncate (maxLength=0 in streaming config)
    expect(result.truncated).toBe(false);
  });
});
