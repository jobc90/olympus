import { describe, it, expect } from 'vitest';
import { extractContext } from '../context-extractor.js';

describe('extractContext', () => {
  describe('summary', () => {
    it('should return full text when <= 500 chars', () => {
      const result = extractContext({ success: true, text: 'Short result.' }, 'test');
      expect(result.summary).toBe('Short result.');
    });

    it('should truncate at sentence boundary for text > 500 chars', () => {
      const longText = 'A'.repeat(200) + '. ' + 'B'.repeat(200) + '. ' + 'C'.repeat(200) + '.';
      const result = extractContext({ success: true, text: longText }, 'test');
      expect(result.summary.length).toBeLessThanOrEqual(501);
      expect(result.summary.endsWith('.')).toBe(true);
    });

    it('should handle empty text', () => {
      const result = extractContext({ success: true, text: '' }, 'test');
      expect(result.summary).toBe('');
    });
  });

  describe('filesChanged', () => {
    it('should extract file paths from text', () => {
      const text = 'Modified src/components/App.tsx and packages/core/src/index.ts';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.filesChanged).toContain('src/components/App.tsx');
      expect(result.filesChanged).toContain('packages/core/src/index.ts');
    });

    it('should deduplicate file paths', () => {
      const text = 'src/foo.ts was changed. Then src/foo.ts again.';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.filesChanged.filter((f) => f === 'src/foo.ts')).toHaveLength(1);
    });

    it('should handle text without file paths', () => {
      const result = extractContext({ success: true, text: 'No files here' }, 'test');
      expect(result.filesChanged).toEqual([]);
    });
  });

  describe('decisions', () => {
    it('should extract Korean decision markers', () => {
      const text = '결정: TypeScript를 사용한다\n다른 내용';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.decisions).toContain('TypeScript를 사용한다');
    });

    it('should extract English decision markers', () => {
      const text = 'Decided to use Vite instead of webpack';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.decisions).toContain('use Vite instead of webpack');
    });

    it('should extract arrow decisions', () => {
      const text = '→ SQLite 기반으로 구현';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.decisions).toContain('SQLite 기반으로 구현');
    });

    it('should return empty for no decisions', () => {
      const result = extractContext({ success: true, text: 'Just some text' }, 'test');
      expect(result.decisions).toEqual([]);
    });
  });

  describe('errors', () => {
    it('should extract Error: patterns', () => {
      const text = 'Error: module not found\nSome other line';
      const result = extractContext({ success: false, text }, 'test');
      expect(result.errors.some((e) => e.includes('module not found'))).toBe(true);
    });

    it('should include result.error.message', () => {
      const result = extractContext(
        { success: false, text: '', error: { message: 'spawn failed' } },
        'test',
      );
      expect(result.errors).toContain('spawn failed');
    });

    it('should extract TypeError patterns', () => {
      const text = "TypeError: Cannot read properties of undefined (reading 'foo')";
      const result = extractContext({ success: false, text }, 'test');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return empty on success with no errors', () => {
      const result = extractContext({ success: true, text: 'All good' }, 'test');
      expect(result.errors).toEqual([]);
    });
  });

  describe('dependencies', () => {
    it('should detect pnpm add', () => {
      const text = 'pnpm add lodash @types/lodash';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.dependencies.length).toBeGreaterThan(0);
      expect(result.dependencies[0]).toContain('pnpm add');
    });

    it('should detect npm install', () => {
      const text = 'npm install better-sqlite3';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('should detect package.json changes', () => {
      const text = 'Updated package.json with new deps';
      const result = extractContext({ success: true, text }, 'test');
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('should return empty when no deps', () => {
      const result = extractContext({ success: true, text: 'No dependencies' }, 'test');
      expect(result.dependencies).toEqual([]);
    });
  });

  describe('success', () => {
    it('should mirror result.success', () => {
      expect(extractContext({ success: true, text: '' }, '').success).toBe(true);
      expect(extractContext({ success: false, text: '' }, '').success).toBe(false);
    });
  });
});
