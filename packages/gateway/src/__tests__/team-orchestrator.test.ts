import { describe, it, expect } from 'vitest';
import { topologicalSort, extractJson, validatePlan, checkFileOwnership, buildPredecessorContext } from '../team-orchestrator.js';
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

  it('should handle path prefix matching correctly', () => {
    // 'src/api.ts' should NOT be considered owned by ['src/api.test.ts']
    const result = checkFileOwnership(['src/api.ts'], ['src/api.test.ts']);
    expect(result).toEqual(['src/api.ts']);
  });
});

// ──────────────────────────────────────────────
// validatePlan — new cases
// ──────────────────────────────────────────────

describe('validatePlan — overlap checks', () => {
  it('should throw when file is in both ownedFiles and readOnlyFiles', () => {
    const plan = {
      requirements: [],
      workItems: [
        {
          id: 'wi-1',
          title: 'Conflict',
          prompt: 'p',
          ownedFiles: ['src/api.ts', 'src/types.ts'],
          readOnlyFiles: ['src/types.ts'],
          blockedBy: [],
        },
      ],
    };
    expect(() => validatePlan(plan)).toThrow('cannot be in both ownedFiles and readOnlyFiles');
  });

  it('should accept when ownedFiles and readOnlyFiles are disjoint', () => {
    const plan = {
      requirements: [],
      workItems: [
        {
          id: 'wi-1',
          title: 'OK',
          prompt: 'p',
          ownedFiles: ['src/api.ts'],
          readOnlyFiles: ['src/types.ts'],
          blockedBy: [],
        },
      ],
    };
    expect(() => validatePlan(plan)).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// buildPredecessorContext
// ──────────────────────────────────────────────

function makeWiWithContext(
  id: string,
  blockedBy: string[] = [],
  extractedContext?: TeamWorkItem['extractedContext'],
): TeamWorkItem {
  return {
    id,
    title: `WI ${id}`,
    description: '',
    ownedFiles: [],
    readOnlyFiles: [],
    blockedBy,
    prompt: 'test',
    status: 'completed',
    retryCount: 0,
    extractedContext,
  };
}

describe('buildPredecessorContext', () => {
  it('should return empty string when no predecessors', () => {
    const wi = makeWiWithContext('wi-2', []);
    const result = buildPredecessorContext(wi, [wi], new Map());
    expect(result).toBe('');
  });

  it('should use extractedContext when available', () => {
    const dep = makeWiWithContext('wi-1', [], {
      success: true,
      summary: 'Implemented auth',
      filesChanged: ['src/auth.ts'],
      decisions: ['Used JWT'],
      errors: [],
      dependencies: [],
    });
    const wi = makeWiWithContext('wi-2', ['wi-1']);
    const diffs = new Map<string, string>();

    const result = buildPredecessorContext(wi, [dep, wi], diffs);

    expect(result).toContain('### wi-1: WI wi-1');
    expect(result).toContain('Summary: Implemented auth');
    expect(result).toContain('Files: src/auth.ts');
    expect(result).toContain('Decisions: Used JWT');
  });

  it('should fall back to diff when extractedContext is missing', () => {
    const dep = makeWiWithContext('wi-1', []);
    const wi = makeWiWithContext('wi-2', ['wi-1']);
    const diffs = new Map([['wi-1', 'diff --git a/src/auth.ts ...']]);

    const result = buildPredecessorContext(wi, [dep, wi], diffs);

    expect(result).toContain('### wi-1: WI wi-1');
    expect(result).toContain('diff --git a/src/auth.ts');
  });

  it('should return empty string when dep has neither extractedContext nor diff', () => {
    const dep = makeWiWithContext('wi-1', []);
    const wi = makeWiWithContext('wi-2', ['wi-1']);
    const diffs = new Map<string, string>();

    const result = buildPredecessorContext(wi, [dep, wi], diffs);
    expect(result).toBe('');
  });

  it('should combine multiple predecessors', () => {
    const dep1 = makeWiWithContext('wi-1', [], {
      success: true,
      summary: 'API done',
      filesChanged: ['src/api.ts'],
      decisions: [],
      errors: [],
      dependencies: [],
    });
    const dep2 = makeWiWithContext('wi-2', [], undefined);
    const diffs = new Map([['wi-2', 'diff content']]);
    const wi = makeWiWithContext('wi-3', ['wi-1', 'wi-2']);

    const result = buildPredecessorContext(wi, [dep1, dep2, wi], diffs);

    expect(result).toContain('### wi-1');
    expect(result).toContain('### wi-2');
    expect(result).toContain('Summary: API done');
    expect(result).toContain('diff content');
  });
});

// ──────────────────────────────────────────────
// DAG race condition — state machine unit test
// ──────────────────────────────────────────────

describe('DAG readiness logic', () => {
  it('should mark WI ready when all its blockers are completed', () => {
    const workItems: TeamWorkItem[] = [
      makeWi('wi-1'),
      makeWi('wi-2'),
      makeWi('wi-3', ['wi-1', 'wi-2']),
    ];

    // Simulate both wi-1 and wi-2 completing
    workItems[0].status = 'completed';
    workItems[1].status = 'completed';
    workItems[2].status = 'pending';

    // Replicate the unblocking logic from executePhase
    for (const other of workItems) {
      if (other.status === 'pending' && other.blockedBy.every(
        dep => workItems.find(w => w.id === dep)?.status === 'completed'
      )) {
        other.status = 'ready';
      }
    }

    expect(workItems[2].status).toBe('ready');
  });

  it('should NOT mark WI ready when only one of two blockers is completed', () => {
    const workItems: TeamWorkItem[] = [
      makeWi('wi-1'),
      makeWi('wi-2'),
      makeWi('wi-3', ['wi-1', 'wi-2']),
    ];

    workItems[0].status = 'completed';
    workItems[2].status = 'pending';

    for (const other of workItems) {
      if (other.status === 'pending' && other.blockedBy.every(
        dep => workItems.find(w => w.id === dep)?.status === 'completed'
      )) {
        other.status = 'ready';
      }
    }

    expect(workItems[2].status).toBe('pending');
  });

  it('topologicalSort should produce valid execution ordering for the race-prone case', () => {
    // WI-3 blocked by both WI-1 and WI-2 — the exact case that triggered the race
    const wis = [
      makeWi('wi-1'),
      makeWi('wi-2'),
      makeWi('wi-3', ['wi-1', 'wi-2']),
    ];
    const order = topologicalSort(wis);
    const wi1Idx = order.indexOf('wi-1');
    const wi2Idx = order.indexOf('wi-2');
    const wi3Idx = order.indexOf('wi-3');
    expect(wi1Idx).toBeLessThan(wi3Idx);
    expect(wi2Idx).toBeLessThan(wi3Idx);
  });
});
