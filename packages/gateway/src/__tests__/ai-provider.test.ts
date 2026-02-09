import { describe, it, expect } from 'vitest';
import { MockProvider } from '../agent/providers/mock.js';
import { createAIProvider } from '../agent/providers/index.js';
import { DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';
import type { AgentTask, WorkerResult } from '@olympus-dev/protocol';

const mockConfig = {
  provider: 'mock' as const,
  model: 'gpt-4o',
  apiKey: '',
  defaultTimeout: 300_000,
  orchestrationMode: 'auto' as const,
};

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    command: 'test command',
    state: 'REVIEWING',
    analysis: null,
    plan: null,
    workers: [],
    results: [],
    report: null,
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('MockProvider', () => {
  const provider = new MockProvider(mockConfig);

  describe('analyze', () => {
    it('should detect question intent', async () => {
      const result = await provider.analyze('현재 상태 알려줘', {});
      expect(result.intent).toBe('question');
      expect(result.complexity).toBe('simple');
    });

    it('should detect coding intent', async () => {
      const result = await provider.analyze('새로운 컴포넌트 만들어줘', {});
      expect(result.intent).toBe('coding');
    });

    it('should detect testing intent', async () => {
      const result = await provider.analyze('테스트 작성해줘', {});
      expect(result.intent).toBe('testing');
    });

    it('should detect complex tasks', async () => {
      const result = await provider.analyze('전체 아키텍처 리팩토링', {});
      expect(result.complexity).toBe('complex');
      expect(result.useOrchestration).toBe(true);
    });

    it('should flag destructive commands', async () => {
      const result = await provider.analyze('데이터베이스 삭제', {});
      expect(result.needsConfirmation).toBe(true);
    });

    it('should use context projectPath', async () => {
      const result = await provider.analyze('수정', { projectPath: '/my/project' });
      expect(result.targetProject).toBe('/my/project');
    });
  });

  describe('plan', () => {
    it('should create single-worker plan for simple tasks', async () => {
      const analysis = await provider.analyze('간단한 수정', {});
      const plan = await provider.plan(analysis, {});
      expect(plan.strategy).toBe('single');
      expect(plan.workers.length).toBe(1);
    });

    it('should use orchestration for complex tasks', async () => {
      const analysis = await provider.analyze('아키텍처 리팩토링', {});
      const plan = await provider.plan(analysis, {});
      expect(plan.workers[0].orchestration).toBe(true);
    });
  });

  describe('review', () => {
    it('should mark success for completed workers', async () => {
      const results: WorkerResult[] = [
        { workerId: 'w1', status: 'completed', exitCode: 0, output: '빌드 성공\nTests 5 passed', duration: 1000 },
      ];
      const report = await provider.review(results, makeTask());
      expect(report.status).toBe('success');
      expect(report.buildStatus).toBe('pass');
    });

    it('should mark failed for all-failed workers', async () => {
      const results: WorkerResult[] = [
        { workerId: 'w1', status: 'failed', exitCode: 1, output: '', duration: 500, error: 'spawn failed' },
      ];
      const report = await provider.review(results, makeTask());
      expect(report.status).toBe('failed');
    });

    // D1 FIX: "0 failed" should NOT be a test failure
    it('should not treat "0 failed" as test failure (D1 fix)', async () => {
      const results: WorkerResult[] = [
        { workerId: 'w1', status: 'completed', exitCode: 0, output: 'Tests 10 passed, 0 failed', duration: 1000 },
      ];
      const report = await provider.review(results, makeTask());
      expect(report.status).toBe('success'); // was: 'partial' before D1 fix
    });

    it('should detect real test failures', async () => {
      const results: WorkerResult[] = [
        { workerId: 'w1', status: 'completed', exitCode: 0, output: 'Tests 8 passed, 2 failed', duration: 1000 },
      ];
      const report = await provider.review(results, makeTask());
      expect(report.status).toBe('partial');
    });

    it('should recommend retry on type errors', async () => {
      const results: WorkerResult[] = [
        { workerId: 'w1', status: 'failed', exitCode: 1, output: 'error TS2345: type\nerror TS2339: prop', duration: 1000 },
      ];
      const report = await provider.review(results, makeTask());
      expect(report.shouldRetry).toBe(true);
    });

    it('should not retry when too many type errors', async () => {
      const errors = Array.from({ length: 10 }, (_, i) => `error TS${2300 + i}: problem`).join('\n');
      const results: WorkerResult[] = [
        { workerId: 'w1', status: 'failed', exitCode: 1, output: errors, duration: 1000 },
      ];
      const report = await provider.review(results, makeTask());
      expect(report.shouldRetry).toBe(false);
    });
  });
});

describe('createAIProvider', () => {
  it('should create MockProvider for mock config', () => {
    const provider = createAIProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'mock' });
    expect(provider.name).toBe('mock');
  });

  it('should create MockProvider when apiKey is empty', () => {
    const provider = createAIProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'openai', apiKey: '' });
    expect(provider.name).toBe('mock');
  });

  it('should create OpenAIProvider with valid config', () => {
    const provider = createAIProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'openai', apiKey: 'sk-test' });
    expect(provider.name).toBe('openai');
  });

  it('should fallback to mock for unsupported providers', () => {
    const provider = createAIProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'anthropic', apiKey: 'key' });
    expect(provider.name).toBe('mock');
  });
});
