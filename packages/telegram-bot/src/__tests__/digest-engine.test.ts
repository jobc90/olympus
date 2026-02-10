import { describe, it, expect } from 'vitest';
import { digestOutput, classifyLine, redactSecrets, groupIntoBlocks, buildDigest, formatDigest } from '../digest/engine.js';
import type { ScoredLine } from '../digest/types.js';

// ============================================================
// Real orchestration output fixture (from actual Claude CLI)
// ============================================================

const ORCHESTRATION_OUTPUT = `
Phase 7: Final Test

 Build & Lint

 Build: pnpm -r build
  Build completed in 12.3s (8 packages)

 Lint: pnpm -r lint
  Lint completed in 6.1s (5 packages, 0 errors)

 Test: pnpm -r test
  Tests: 64 passed, 0 failed (gateway 28, telegram 12, 기존 24)

Phase 8: Judgment

Quality Gates:
 Category        Check              Result
 Hard Gates
                 Build              PASS (8/8 packages)
                 Lint               PASS (0 errors)
                 Type Check         PASS (5/5 packages)
                 Tests              PASS (64/64)
 Behavior Gates
                 Session Connect    PASS (Available→Connected)
                 ANSI Strip         PASS (clean output)
                 Session Broadcast  PASS (real-time list)
 Soft Gates
                 New Tests          +6 (28 total in gateway)

All Quality Gates passed.

 Changes Summary:
 File                                    Changes
 packages/gateway/src/session-manager.ts  +stripAnsi(), filterOutput에 적용
 packages/gateway/src/server.ts           +broadcastSessionsList()
 packages/gateway/src/api.ts              +onSessionsChanged 콜백
 packages/web/src/hooks/useOlympus.ts     +connectAvailableSession()
 packages/web/src/components/SessionList  +onConnectAvailable prop
 packages/web/src/App.tsx                 connectAvailableSession 연결
 session-manager.test.ts                  +6 ANSI strip 테스트

 main 97360f6 fix(dashboard): enable session connect, ANSI strip, and live output streaming
 8 files changed, 142 insertions(+), 12 deletions(-)

 push to origin/main... done.

모든 작업이 완료되었습니다.
`;

const NOISY_OUTPUT = `
Reading file packages/gateway/src/server.ts
Searching for "session" in packages/...
  Found 15 matches
Globbing packages/**/*.ts
Running 3 explore agents
⠋ Loading...
Thinking...
Working...
Reading packages/telegram-bot/src/index.ts
  ⎿ Reading 1226 lines
  ⎿ Found relevant sections

The server configuration looks correct.
`;

const ERROR_OUTPUT = `
 Build: pnpm -r build

ERROR: packages/gateway/src/server.ts(45,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

TypeScript build failed with 1 error.

Build FAIL (1 error in gateway package)
`;

const CODE_BLOCK_OUTPUT = `
Here is the implementation:

\`\`\`typescript
function digestOutput(content: string): DigestResult {
  const lines = content.split('\\n');
  const scored = lines.map(classifyLine);
  const blocks = groupIntoBlocks(scored);
  return buildDigest(blocks);
}
\`\`\`

The function processes the output correctly.
`;

// ============================================================
// classifyLine tests
// ============================================================

describe('classifyLine', () => {
  it('should classify build results as build', () => {
    expect(classifyLine('Build completed in 12.3s (8 packages)').category).toBe('build');
    expect(classifyLine('Build: PASS (8/8 packages)').category).toBe('build');
    expect(classifyLine('pnpm -r build').category).toBe('build');
  });

  it('should classify test results as test', () => {
    expect(classifyLine('Tests: 64 passed, 0 failed').category).toBe('test');
    expect(classifyLine('Test: PASS (64/64)').category).toBe('test');
    expect(classifyLine('PASS src/index.test.ts').category).toBe('test');
  });

  it('should classify commit info as commit', () => {
    expect(classifyLine('97360f6 fix(dashboard): enable session connect').category).toBe('commit');
    expect(classifyLine('8 files changed, 142 insertions(+), 12 deletions(-)').category).toBe('commit');
    expect(classifyLine('push to origin/main... done.').category).toBe('commit');
  });

  it('should classify errors as error', () => {
    expect(classifyLine('ERROR: Build failed').category).toBe('error');
    expect(classifyLine('TypeScript build failed with 1 error').category).toBe('error');
    expect(classifyLine('✗ Test suite failed').category).toBe('error');
  });

  it('should classify phase info as phase', () => {
    expect(classifyLine('Phase 7: Final Test').category).toBe('phase');
    expect(classifyLine('Quality Gates:').category).toBe('phase');
    expect(classifyLine('All Quality Gates passed.').category).toBe('phase');
  });

  it('should classify noise patterns', () => {
    expect(classifyLine('Reading file packages/server.ts').category).toBe('noise');
    expect(classifyLine('Searching for "session" in packages/...').category).toBe('noise');
    expect(classifyLine('⠋ Loading...').category).toBe('noise');
    expect(classifyLine('Thinking...').category).toBe('noise');
    expect(classifyLine('Working...').category).toBe('noise');
    expect(classifyLine('').category).toBe('noise');
    expect(classifyLine('───────────────────────').category).toBe('noise');
  });

  it('should classify non-empty non-noise as other', () => {
    expect(classifyLine('The server configuration looks correct.').category).toBe('other');
    expect(classifyLine('Here is the implementation:').category).toBe('other');
  });

  it('should assign correct scores', () => {
    expect(classifyLine('ERROR: Build failed').score).toBe(5);
    expect(classifyLine('Build: PASS').score).toBe(4);
    expect(classifyLine('Tests: 10 passed').score).toBe(4);
    expect(classifyLine('97360f6 fix: something').score).toBe(3);
    expect(classifyLine('Phase 8: Judgment').score).toBe(3);
    expect(classifyLine('Regular text').score).toBe(1);
    expect(classifyLine('Reading file...').score).toBe(0);
  });
});

// ============================================================
// groupIntoBlocks tests
// ============================================================

describe('groupIntoBlocks', () => {
  it('should group consecutive same-category lines', () => {
    const lines: ScoredLine[] = [
      { text: 'Build: PASS', score: 4, category: 'build' },
      { text: 'Build completed', score: 4, category: 'build' },
    ];
    const blocks = groupIntoBlocks(lines);
    expect(blocks.length).toBe(1);
    expect(blocks[0].lines.length).toBe(2);
    expect(blocks[0].category).toBe('build');
  });

  it('should skip noise lines', () => {
    const lines: ScoredLine[] = [
      { text: 'Build: PASS', score: 4, category: 'build' },
      { text: '', score: 0, category: 'noise' },
      { text: 'Tests: PASS', score: 4, category: 'test' },
    ];
    const blocks = groupIntoBlocks(lines);
    expect(blocks.length).toBe(2);
  });

  it('should handle empty input', () => {
    expect(groupIntoBlocks([])).toEqual([]);
  });
});

// ============================================================
// buildDigest tests
// ============================================================

describe('buildDigest', () => {
  it('should prioritize high-scoring blocks', () => {
    const lines: ScoredLine[] = [
      { text: 'Some text', score: 1, category: 'other' },
      { text: 'Build FAIL', score: 5, category: 'error' },
    ];
    const blocks = groupIntoBlocks(lines);
    const result = buildDigest(blocks, 100);
    expect(result).toContain('Build FAIL');
  });

  it('should respect maxLength', () => {
    const lines: ScoredLine[] = Array.from({ length: 50 }, (_, i) => ({
      text: `Result line ${i}: something happened here that is quite long`,
      score: 3,
      category: 'commit' as const,
    }));
    const blocks = groupIntoBlocks(lines);
    const result = buildDigest(blocks, 200);
    expect(result.length).toBeLessThanOrEqual(250); // some margin for formatting
  });
});

// ============================================================
// redactSecrets tests
// ============================================================

describe('redactSecrets', () => {
  it('should redact OpenAI API keys', () => {
    const text = 'Using key sk-proj-abc123def456ghi789jklmnop';
    const result = redactSecrets(text);
    expect(result).toContain('sk-p***');
    expect(result).not.toContain('abc123');
  });

  it('should redact Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const result = redactSecrets(text);
    expect(result).toContain('Bear***');
    expect(result).not.toContain('eyJhbGci');
  });

  it('should redact GitHub PAT', () => {
    const text = 'Token: ghp_abcdefghijklmnopqrstuvwxyz12345';
    const result = redactSecrets(text);
    expect(result).toContain('ghp_***');
  });

  it('should not redact short strings', () => {
    const text = 'Build passed with 0 errors';
    expect(redactSecrets(text)).toBe(text);
  });

  it('should redact long hex strings', () => {
    const text = 'Hash: aabbccddee11223344556677889900aabbccddee';
    const result = redactSecrets(text);
    expect(result).toContain('aabb***');
  });
});

// ============================================================
// digestOutput (integration) tests
// ============================================================

describe('digestOutput', () => {
  it('should extract key results from orchestration output', () => {
    const result = digestOutput(ORCHESTRATION_OUTPUT);
    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeLessThanOrEqual(1700); // allow some margin (maxLength=1500)
    expect(result.hasErrors).toBe(false);
    expect(result.signalCount).toBeGreaterThan(5);
    // Should contain key results
    expect(result.summary).toMatch(/Build|Test|PASS/i);
  });

  it('should contain commit info from orchestration output', () => {
    // Use larger budget to ensure commit info is included
    const result = digestOutput(ORCHESTRATION_OUTPUT, 1500);
    expect(result.summary).toMatch(/97360f6|files? changed|push/i);
  });

  it('should remove noise from mixed output', () => {
    const result = digestOutput(NOISY_OUTPUT);
    expect(result.summary).not.toMatch(/Reading file/);
    expect(result.summary).not.toMatch(/Searching for/);
    expect(result.summary).not.toMatch(/Globbing/);
    expect(result.summary).not.toMatch(/⠋/);
    // Should keep the meaningful line
    expect(result.summary).toContain('server configuration');
  });

  it('should preserve error context', () => {
    const result = digestOutput(ERROR_OUTPUT);
    expect(result.hasErrors).toBe(true);
    expect(result.summary).toMatch(/error|ERROR|FAIL/i);
    expect(result.summary).toMatch(/TS2345|type.*string/i);
  });

  it('should handle empty input', () => {
    const result = digestOutput('');
    expect(result.summary).toBe('');
    expect(result.hasErrors).toBe(false);
    expect(result.signalCount).toBe(0);
  });

  it('should handle all-noise input', () => {
    const noiseOnly = 'Reading file...\nSearching...\nGlobbing...\nThinking...\n';
    const result = digestOutput(noiseOnly);
    expect(result.summary).toBe('');
  });

  it('should handle code block content', () => {
    const result = digestOutput(CODE_BLOCK_OUTPUT);
    // Should include the surrounding text, not just code
    expect(result.summary).toBeTruthy();
  });

  it('should respect maxLength', () => {
    const result = digestOutput(ORCHESTRATION_OUTPUT, 300);
    expect(result.summary.length).toBeLessThanOrEqual(400); // margin for formatting
  });

  it('should track original length', () => {
    const result = digestOutput(ORCHESTRATION_OUTPUT);
    expect(result.originalLength).toBeGreaterThan(500);
  });
});

// ============================================================
// formatDigest tests
// ============================================================

describe('formatDigest', () => {
  it('should format with session prefix', () => {
    const result = digestOutput(ORCHESTRATION_OUTPUT);
    const formatted = formatDigest(result, '📩 [dev]');
    expect(formatted).toMatch(/^📩 \[dev\]/);
  });

  it('should add warning icon for errors', () => {
    const result = digestOutput(ERROR_OUTPUT);
    const formatted = formatDigest(result, '📩 [dev]');
    expect(formatted).toContain('⚠️');
  });

  it('should return empty string for empty result (suppress sending)', () => {
    const result = digestOutput('');
    const formatted = formatDigest(result, '📩 [dev]');
    expect(formatted).toBe('');
  });
});
