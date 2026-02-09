import { describe, it, expect } from 'vitest';
import { ResponseProcessor } from '../response-processor.js';

describe('ResponseProcessor', () => {
  const processor = new ResponseProcessor();

  describe('detectType', () => {
    it('should detect build type', () => {
      expect(processor.detectType('Build succeeded')).toBe('build');
      expect(processor.detectType('빌드 완료')).toBe('build');
    });

    it('should detect test type', () => {
      expect(processor.detectType('test 42 passed, 0 failed')).toBe('test');
    });

    it('should detect error type', () => {
      expect(processor.detectType('3 errors found in compilation')).toBe('error');
    });

    it('should detect code type', () => {
      expect(processor.detectType('Here is the code:\n```typescript\nconst x = 1;\n```')).toBe('code');
    });

    it('should detect question type', () => {
      expect(processor.detectType('Should I proceed?')).toBe('question');
    });

    it('should default to text', () => {
      expect(processor.detectType('This is a regular response')).toBe('text');
    });

    it('should not false positive on 0 errors', () => {
      // "0 errors" should not match since pattern requires [1-9]
      expect(processor.detectType('0 errors, build clean')).not.toBe('error');
    });
  });

  describe('parseChangedFiles', () => {
    it('should parse Edit pattern', () => {
      const output = '⏺ Edit src/components/App.tsx\nSome changes made\n⏺ Edit src/utils/helper.ts';
      const files = processor.parseChangedFiles(output);
      expect(files).toEqual(['src/components/App.tsx', 'src/utils/helper.ts']);
    });

    it('should parse Write pattern', () => {
      const output = '⏺ Write src/new-file.ts';
      const files = processor.parseChangedFiles(output);
      expect(files).toEqual(['src/new-file.ts']);
    });

    it('should parse Create pattern', () => {
      const output = '⏺ Create tests/new.test.ts';
      const files = processor.parseChangedFiles(output);
      expect(files).toEqual(['tests/new.test.ts']);
    });

    it('should deduplicate files', () => {
      const output = '⏺ Edit src/foo.ts\n⏺ Edit src/foo.ts';
      const files = processor.parseChangedFiles(output);
      expect(files).toEqual(['src/foo.ts']);
    });

    it('should return empty array for no matches', () => {
      expect(processor.parseChangedFiles('No files changed')).toEqual([]);
    });
  });

  describe('process', () => {
    it('should create ProcessedResponse with metadata', () => {
      const startTime = Date.now() - 5000;
      const result = processor.process('Build succeeded\n✅ All tests passed', {
        sessionId: 'sess-1',
        projectName: 'console',
        startTime,
      });

      expect(result.type).toBe('build');
      expect(result.metadata.projectName).toBe('console');
      expect(result.metadata.sessionId).toBe('sess-1');
      expect(result.metadata.duration).toBeGreaterThan(0);
      expect(result.rawOutput).toContain('Build succeeded');
    });

    it('should extract changed files', () => {
      const result = processor.process('⏺ Edit src/app.ts\nUpdated the file', {
        sessionId: 'sess-1',
        projectName: 'test',
        startTime: Date.now(),
      });

      expect(result.metadata.filesChanged).toEqual(['src/app.ts']);
    });
  });

  describe('formatForTelegram', () => {
    it('should include project name and duration', () => {
      const response = processor.process('Some output here', {
        sessionId: 'sess-1',
        projectName: 'console',
        startTime: Date.now() - 3000,
      });

      const formatted = processor.formatForTelegram(response);
      expect(formatted).toContain('📂 console');
      expect(formatted).toContain('⏱');
    });

    it('should include file changes', () => {
      const response = processor.process('⏺ Edit src/foo.ts\nDone', {
        sessionId: 'sess-1',
        projectName: 'test',
        startTime: Date.now(),
      });

      const formatted = processor.formatForTelegram(response);
      expect(formatted).toContain('📎 변경');
    });

    it('should truncate long content', () => {
      const longContent = 'A'.repeat(5000);
      const response = processor.process(longContent, {
        sessionId: 'sess-1',
        projectName: 'test',
        startTime: Date.now(),
      });

      const formatted = processor.formatForTelegram(response);
      expect(formatted.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('formatForDashboard', () => {
    it('should include timestamp', () => {
      const response = processor.process('output', {
        sessionId: 'sess-1',
        projectName: 'test',
        startTime: Date.now(),
      });

      const dashboard = processor.formatForDashboard(response);
      expect(dashboard.timestamp).toBeGreaterThan(0);
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(processor.formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(processor.formatDuration(3500)).toBe('3.5s');
    });

    it('should format minutes', () => {
      expect(processor.formatDuration(125000)).toBe('2m 5s');
    });
  });
});
