import { describe, it, expect } from 'vitest';
import { topologicalSort, extractJson, validatePlan, checkFileOwnership } from '../team-orchestrator.js';
import type { TeamWorkItem } from '@olympus-dev/protocol';

// ──────────────────────────────────────────────
// topologicalSort
// ──────────────────────────────────────────────

function makeWi(id: string, blockedBy: string[] = []): TeamWorkItem {
  return {
    id,
    title: `WI ${id}`,
    description: '',
    ownedFiles: [],
    readOnlyFiles: [],
    blockedBy,
    prompt: 'test',
    status: 'pending',
    retryCount: 0,
  };
}

describe('topologicalSort', () => {
  it('should sort independent items', () => {
    const wis = [makeWi('a'), makeWi('b'), makeWi('c')];
    const result = topologicalSort(wis);
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('should sort linear chain', () => {
    const wis = [
      makeWi('a'),
      makeWi('b', ['a']),
      makeWi('c', ['b']),
    ];
    const result = topologicalSort(wis);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should sort diamond DAG', () => {
    const wis = [
      makeWi('a'),
      makeWi('b', ['a']),
      makeWi('c', ['a']),
      makeWi('d', ['b', 'c']),
    ];
    const result = topologicalSort(wis);

    // a must come first, d must come last
    expect(result[0]).toBe('a');
    expect(result[3]).toBe('d');
    // b and c can be in either order
    expect(new Set(result.slice(1, 3))).toEqual(new Set(['b', 'c']));
  });

  it('should detect circular dependency', () => {
    const wis = [
      makeWi('a', ['c']),
      makeWi('b', ['a']),
      makeWi('c', ['b']),
    ];
    expect(() => topologicalSort(wis)).toThrow('Circular dependency');
  });

  it('should detect unknown dependency', () => {
    const wis = [makeWi('a', ['nonexistent'])];
    expect(() => topologicalSort(wis)).toThrow('Unknown dependency');
  });

  it('should handle single item', () => {
    const wis = [makeWi('a')];
    expect(topologicalSort(wis)).toEqual(['a']);
  });
});

// ──────────────────────────────────────────────
// extractJson
// ──────────────────────────────────────────────

describe('extractJson', () => {
  it('should parse bare JSON object', () => {
    const result = extractJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse bare JSON array', () => {
    const result = extractJson('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should extract JSON from markdown code fence', () => {
    const text = 'Here is the plan:\n```json\n{"key": "value"}\n```\nDone.';
    const result = extractJson(text);
    expect(result).toEqual({ key: 'value' });
  });

  it('should extract JSON from plain code fence', () => {
    const text = '```\n{"a": 1}\n```';
    const result = extractJson(text);
    expect(result).toEqual({ a: 1 });
  });

  it('should extract JSON from mixed content', () => {
    const text = 'The result is: {"data": true} and more text';
    const result = extractJson(text);
    expect(result).toEqual({ data: true });
  });

  it('should throw on no valid JSON', () => {
    expect(() => extractJson('no json here')).toThrow('No valid JSON');
  });
});

// ──────────────────────────────────────────────
// validatePlan
// ──────────────────────────────────────────────

describe('validatePlan', () => {
  const validPlan = {
    requirements: [
      { id: 'R1', description: 'Add feature', priority: 'must' },
    ],
    workItems: [
      {
        id: 'wi-1',
        title: 'Implement API',
        description: 'Create API endpoints',
        ownedFiles: ['src/api.ts'],
        readOnlyFiles: ['src/types.ts'],
        blockedBy: [],
        prompt: 'Implement the API',
      },
      {
        id: 'wi-2',
        title: 'Add tests',
        description: 'Create tests',
        ownedFiles: ['src/api.test.ts'],
        readOnlyFiles: ['src/api.ts'],
        blockedBy: ['wi-1'],
        prompt: 'Write tests',
      },
    ],
  };

  it('should validate a correct plan', () => {
    const plan = validatePlan(validPlan);
    expect(plan.requirements).toHaveLength(1);
    expect(plan.workItems).toHaveLength(2);
    expect(plan.workItems[0].status).toBe('pending');
    expect(plan.workItems[0].retryCount).toBe(0);
  });

  it('should reject non-object', () => {
    expect(() => validatePlan(null)).toThrow('must be an object');
    expect(() => validatePlan('string')).toThrow('must be an object');
  });

  it('should reject missing requirements', () => {
    expect(() => validatePlan({ workItems: [] })).toThrow('requirements array');
  });

  it('should reject missing workItems', () => {
    expect(() => validatePlan({ requirements: [] })).toThrow('workItems array');
  });

  it('should reject empty workItems', () => {
    expect(() => validatePlan({ requirements: [], workItems: [] })).toThrow('at least one');
  });

  it('should reject too many workItems', () => {
    const wis = Array.from({ length: 9 }, (_, i) => ({
      id: `wi-${i}`, title: 't', prompt: 'p', ownedFiles: [], readOnlyFiles: [], blockedBy: [],
    }));
    expect(() => validatePlan({ requirements: [], workItems: wis })).toThrow('max 8');
  });

  it('should reject duplicate WI IDs', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'a', prompt: 'p', ownedFiles: [], readOnlyFiles: [], blockedBy: [] },
        { id: 'wi-1', title: 'b', prompt: 'p', ownedFiles: [], readOnlyFiles: [], blockedBy: [] },
      ],
    };
    expect(() => validatePlan(plan)).toThrow('Duplicate work item ID');
  });

  it('should reject duplicate file ownership', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'a', prompt: 'p', ownedFiles: ['src/api.ts'], readOnlyFiles: [], blockedBy: [] },
        { id: 'wi-2', title: 'b', prompt: 'p', ownedFiles: ['src/api.ts'], readOnlyFiles: [], blockedBy: [] },
      ],
    };
    expect(() => validatePlan(plan)).toThrow('owned by both');
  });

  it('should reject unknown blockedBy reference', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'a', prompt: 'p', ownedFiles: [], readOnlyFiles: [], blockedBy: ['nonexistent'] },
      ],
    };
    expect(() => validatePlan(plan)).toThrow('unknown WI');
  });

  it('should reject circular dependencies', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'a', prompt: 'p', ownedFiles: [], readOnlyFiles: [], blockedBy: ['wi-2'] },
        { id: 'wi-2', title: 'b', prompt: 'p', ownedFiles: [], readOnlyFiles: [], blockedBy: ['wi-1'] },
      ],
    };
    expect(() => validatePlan(plan)).toThrow('Circular dependency');
  });

  it('should handle missing optional fields gracefully', () => {
    const plan = {
      requirements: [{ description: 'something' }],
      workItems: [
        { id: 'wi-1', title: 'task', prompt: 'do it' },
      ],
    };
    const result = validatePlan(plan);
    expect(result.workItems[0].ownedFiles).toEqual([]);
    expect(result.workItems[0].readOnlyFiles).toEqual([]);
    expect(result.workItems[0].blockedBy).toEqual([]);
    expect(result.requirements[0].id).toBe('R1');
    expect(result.requirements[0].priority).toBe('should');
  });

  it('should accept shared files', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'task', prompt: 'do it' },
      ],
      sharedFiles: ['src/shared.ts'],
    };
    const result = validatePlan(plan);
    expect(result.sharedFiles).toEqual(['src/shared.ts']);
  });

  it('should parse valid provider field', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'task', prompt: 'do it', provider: 'codex' },
      ],
    };
    const result = validatePlan(plan);
    expect(result.workItems[0].provider).toBe('codex');
  });

  it('should parse claude provider field', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'task', prompt: 'do it', provider: 'claude' },
      ],
    };
    const result = validatePlan(plan);
    expect(result.workItems[0].provider).toBe('claude');
  });

  it('should ignore invalid provider value', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'task', prompt: 'do it', provider: 'gemini' },
      ],
    };
    const result = validatePlan(plan);
    expect(result.workItems[0].provider).toBeUndefined();
  });

  it('should handle missing provider field', () => {
    const plan = {
      requirements: [],
      workItems: [
        { id: 'wi-1', title: 'task', prompt: 'do it' },
      ],
    };
    const result = validatePlan(plan);
    expect(result.workItems[0].provider).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// checkFileOwnership
// ──────────────────────────────────────────────

describe('checkFileOwnership', () => {
  it('should return no violations when all files are owned', () => {
    const result = checkFileOwnership(['src/a.ts', 'src/b.ts'], ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(result).toEqual([]);
  });

  it('should detect unauthorized file changes', () => {
    const result = checkFileOwnership(
      ['src/a.ts', 'src/unauthorized.ts', 'src/b.ts'],
      ['src/a.ts', 'src/b.ts'],
    );
    expect(result).toEqual(['src/unauthorized.ts']);
  });

  it('should skip check when ownedFiles is empty', () => {
    const result = checkFileOwnership(['src/a.ts', 'src/b.ts'], []);
    expect(result).toEqual([]);
  });

  it('should report all violations', () => {
    const result = checkFileOwnership(
      ['src/x.ts', 'src/y.ts', 'src/z.ts'],
      ['src/a.ts'],
    );
    expect(result).toEqual(['src/x.ts', 'src/y.ts', 'src/z.ts']);
  });

  it('should handle empty changed files', () => {
    const result = checkFileOwnership([], ['src/a.ts']);
    expect(result).toEqual([]);
  });
});
