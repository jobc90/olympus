import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(),
}));

import { runCli } from '../cli-runner.js';
import { extractContextWithLlm } from '../llm-context-extractor.js';

const mockedRunCli = vi.mocked(runCli);

function makeResult(overrides?: Partial<{ success: boolean; text: string; error?: { message?: string } }>) {
  return {
    success: true,
    text: 'Updated src/app.ts and fixed Error: build failed',
    ...overrides,
  };
}

describe('extractContextWithLlm', () => {
  beforeEach(() => {
    mockedRunCli.mockReset();
  });

  it('returns structured context from LLM JSON', async () => {
    mockedRunCli.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: '앱 빌드 오류를 수정하고 파일을 업데이트함',
        filesChanged: ['src/app.ts'],
        decisions: ['빌드 설정을 유지하고 오류만 수정'],
        errors: ['Error: build failed'],
        dependencies: ['pnpm add zod'],
      }),
    } as any);

    const extracted = await extractContextWithLlm({
      result: makeResult(),
      prompt: '빌드 실패 고쳐줘',
    });

    expect(extracted.summary).toContain('수정');
    expect(extracted.filesChanged).toEqual(['src/app.ts']);
    expect(extracted.decisions).toHaveLength(1);
    expect(extracted.errors).toContain('Error: build failed');
    expect(extracted.dependencies).toContain('pnpm add zod');
  });

  it('parses JSON block inside non-JSON response', async () => {
    mockedRunCli.mockResolvedValue({
      success: true,
      text: `Here is the result:\n\`\`\`json\n{"summary":"done","filesChanged":["src/a.ts"],"decisions":[],"errors":[],"dependencies":[]}\n\`\`\``,
    } as any);

    const extracted = await extractContextWithLlm({
      result: makeResult(),
      prompt: '정리해줘',
    });

    expect(extracted.summary).toBe('done');
    expect(extracted.filesChanged).toEqual(['src/a.ts']);
  });

  it('falls back to regex extractor when LLM fails', async () => {
    mockedRunCli.mockResolvedValue({
      success: false,
      text: '',
    } as any);

    const extracted = await extractContextWithLlm({
      result: makeResult({ text: 'Error: failed. modified src/index.ts' }),
      prompt: 'fallback test',
    });

    expect(extracted.summary).toContain('Error');
    expect(extracted.filesChanged).toContain('src/index.ts');
    expect(extracted.errors.some(e => e.includes('Error:'))).toBe(true);
  });

  it('sanitizes duplicate/non-string list items', async () => {
    mockedRunCli.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: 'ok',
        filesChanged: ['src/a.ts', 'src/a.ts', 42, null],
        decisions: ['A', 'A', ''],
        errors: ['E1', 'E1'],
        dependencies: ['pnpm add x', 'pnpm add x'],
      }),
    } as any);

    const extracted = await extractContextWithLlm({
      result: makeResult(),
      prompt: 'sanitize test',
    });

    expect(extracted.filesChanged).toEqual(['src/a.ts']);
    expect(extracted.decisions).toEqual(['A']);
    expect(extracted.errors).toEqual(['E1']);
    expect(extracted.dependencies).toEqual(['pnpm add x']);
  });
});

