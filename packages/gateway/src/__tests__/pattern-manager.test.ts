import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternManager } from '../memory/patterns.js';

// Mock better-sqlite3 Database interface
function createMockDb() {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  tables.set('learning_patterns', []);

  const getPatterns = () => tables.get('learning_patterns')!;

  return {
    prepare: vi.fn((sql: string) => {
      // Simple mock based on SQL keywords
      if (sql.includes('INSERT OR REPLACE')) {
        return {
          run: (...args: unknown[]) => {
            const patterns = getPatterns();
            const existing = patterns.findIndex(p => p.id === args[0]);
            const row = {
              id: args[0], trigger: args[1], action: args[2],
              confidence: args[3], usage_count: args[4], last_used: args[5],
            };
            if (existing >= 0) {
              patterns[existing] = row;
            } else {
              patterns.push(row);
            }
          },
        };
      }
      if (sql.includes('DELETE')) {
        return {
          run: (id: string) => {
            const patterns = getPatterns();
            const idx = patterns.findIndex(p => p.id === id);
            if (idx >= 0) {
              patterns.splice(idx, 1);
              return { changes: 1 };
            }
            return { changes: 0 };
          },
        };
      }
      if (sql.includes('UPDATE')) {
        return {
          run: (lastUsed: number, id: string) => {
            const p = getPatterns().find(p => p.id === id);
            if (p) {
              (p.usage_count as number)++;
              p.last_used = lastUsed;
            }
          },
        };
      }
      if (sql.includes('COUNT')) {
        return {
          get: () => ({ count: getPatterns().length }),
        };
      }
      if (sql.includes('LOWER(trigger) LIKE')) {
        return {
          all: (minConf: number, ...keywords: string[]) => {
            return getPatterns().filter(p => {
              if ((p.confidence as number) < minConf) return false;
              return keywords.some(k => {
                const kw = k.replace(/%/g, '');
                return (p.trigger as string).toLowerCase().includes(kw);
              });
            });
          },
        };
      }
      if (sql.includes('WHERE confidence >=')) {
        return {
          all: (minConf: number) => {
            return getPatterns().filter(p => (p.confidence as number) >= minConf);
          },
        };
      }
      if (sql.includes('ORDER BY confidence')) {
        return {
          all: () => [...getPatterns()].sort((a, b) => (b.confidence as number) - (a.confidence as number)),
        };
      }
      return { run: vi.fn(), all: vi.fn(() => []), get: vi.fn() };
    }),
    _patterns: getPatterns,
  };
}

describe('PatternManager', () => {
  let manager: PatternManager;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    manager = new PatternManager(mockDb as unknown as import('better-sqlite3').Database);
  });

  it('should save and retrieve patterns', () => {
    manager.save({
      id: 'p1',
      trigger: 'build fail',
      action: 'check dependencies',
      confidence: 0.8,
      usageCount: 5,
      lastUsed: Date.now(),
    });

    const all = manager.getAll();
    expect(all.length).toBe(1);
    expect(all[0].trigger).toBe('build fail');
  });

  it('should find matching patterns by keyword', () => {
    manager.save({
      id: 'p1',
      trigger: 'build failure',
      action: 'check deps',
      confidence: 0.8,
      usageCount: 3,
      lastUsed: Date.now(),
    });
    manager.save({
      id: 'p2',
      trigger: 'test error',
      action: 'check test config',
      confidence: 0.7,
      usageCount: 2,
      lastUsed: Date.now(),
    });

    const matches = manager.findMatching('build failed', 0.5);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].trigger).toBe('build failure');
  });

  it('should filter by minimum confidence', () => {
    manager.save({
      id: 'p1',
      trigger: 'low confidence',
      action: 'maybe',
      confidence: 0.2,
      usageCount: 1,
      lastUsed: Date.now(),
    });

    const matches = manager.getByConfidence(0.5);
    expect(matches.length).toBe(0);
  });

  it('should delete a pattern', () => {
    manager.save({
      id: 'p1',
      trigger: 'test',
      action: 'act',
      confidence: 0.5,
      usageCount: 1,
      lastUsed: Date.now(),
    });

    const deleted = manager.delete('p1');
    expect(deleted).toBe(true);
    expect(manager.getCount()).toBe(0);
  });

  it('should return false when deleting non-existent pattern', () => {
    const deleted = manager.delete('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should record usage', () => {
    manager.save({
      id: 'p1',
      trigger: 'test',
      action: 'act',
      confidence: 0.5,
      usageCount: 1,
      lastUsed: 1000,
    });

    manager.recordUsage('p1');
    // Verify the DB call was made (usage_count incremented)
    const patterns = mockDb._patterns();
    expect(patterns[0].usage_count).toBe(2);
  });

  it('should return empty arrays when db is null', () => {
    const nullManager = new PatternManager(null);
    expect(nullManager.getAll()).toEqual([]);
    expect(nullManager.findMatching('test')).toEqual([]);
    expect(nullManager.getCount()).toBe(0);
    expect(nullManager.delete('x')).toBe(false);
  });

  it('should handle setDb', () => {
    const nullManager = new PatternManager(null);
    expect(nullManager.getCount()).toBe(0);

    nullManager.setDb(mockDb as unknown as import('better-sqlite3').Database);
    // Now it should use the mock db
    expect(nullManager.getCount()).toBe(0); // Empty but functional
  });
});
