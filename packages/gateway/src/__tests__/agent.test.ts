import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexAgent, type CodexAgentOptions } from '../agent/agent.js';
import { CommandAnalyzer } from '../agent/analyzer.js';
import { ExecutionPlanner } from '../agent/planner.js';
import { ResultReviewer } from '../agent/reviewer.js';
import { AgentReporter } from '../agent/reporter.js';
import { WorkerManager } from '../workers/manager.js';
import { DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';

function createAgent(overrides?: Partial<CodexAgentOptions>): CodexAgent {
  const config = { ...DEFAULT_AGENT_CONFIG, provider: 'mock' as const };
  return new CodexAgent({
    config,
    analyzer: new CommandAnalyzer(config),
    planner: new ExecutionPlanner(config),
    reviewer: new ResultReviewer(config),
    reporter: new AgentReporter(),
    workerManager: new WorkerManager({ maxConcurrent: 3 }),
    ...overrides,
  });
}

describe('CodexAgent', () => {
  let agent: CodexAgent;

  beforeEach(() => {
    agent = createAgent();
  });

  it('should start in IDLE state', () => {
    expect(agent.state).toBe('IDLE');
    expect(agent.currentTask).toBeNull();
  });

  it('should transition to ANALYZING on command', async () => {
    const progressEvents: unknown[] = [];
    agent.on('progress', (payload) => progressEvents.push(payload));

    const taskId = await agent.handleCommand({
      command: '현재 상태 알려줘',
      senderId: 'test',
      channelType: 'test',
    });

    expect(taskId).toBeTruthy();
    expect(taskId.length).toBe(12);

    // Wait for async pipeline to complete
    await new Promise(r => setTimeout(r, 100));

    // Simple question should complete immediately
    expect(agent.state).toBe('IDLE');
    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('should queue commands when busy', async () => {
    // Make a complex command that takes time
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    // Mock execute to be slow
    vi.spyOn(workerManager, 'execute').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        workerId: 'w1',
        status: 'completed',
        exitCode: 0,
        output: 'done',
        duration: 100,
      }), 500))
    );

    const busyAgent = createAgent({ workerManager });
    const queuedEvents: unknown[] = [];
    busyAgent.on('queued', (payload) => queuedEvents.push(payload));

    // First command
    await busyAgent.handleCommand({
      command: '코드 리팩토링 해줘',
      senderId: 'test',
      channelType: 'test',
    });

    // Wait for state transition
    await new Promise(r => setTimeout(r, 50));

    // Second command should be queued (not rejected)
    const queuedTaskId = await busyAgent.handleCommand({
      command: '다른 작업',
      senderId: 'test',
      channelType: 'test',
    });

    expect(queuedTaskId).toBeTruthy();
    expect(busyAgent.queueSize).toBe(1);
    expect(queuedEvents.length).toBe(1);

    // Cleanup
    busyAgent.cancel();
  });

  it('should cancel current task', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    vi.spyOn(workerManager, 'execute').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        workerId: 'w1',
        status: 'completed',
        exitCode: 0,
        output: 'done',
        duration: 100,
      }), 5000))
    );

    const cancelAgent = createAgent({ workerManager });

    await cancelAgent.handleCommand({
      command: '대규모 리팩토링',
      senderId: 'test',
      channelType: 'test',
    });

    await new Promise(r => setTimeout(r, 50));

    const cancelled = cancelAgent.cancel();
    expect(cancelled).toBe(true);
    expect(cancelAgent.state).toBe('IDLE');
  });

  it('should return false when cancelling with no active task', () => {
    expect(agent.cancel()).toBe(false);
  });

  it('should emit result for simple questions', async () => {
    const results: unknown[] = [];
    agent.on('result', (payload) => results.push(payload));

    await agent.handleCommand({
      command: '현재 상태 어때?',
      senderId: 'test',
      channelType: 'test',
    });

    await new Promise(r => setTimeout(r, 100));

    expect(results.length).toBe(1);
    const result = results[0] as { taskId: string; report: { status: string } };
    expect(result.report.status).toBe('success');
  });
});

describe('CommandAnalyzer', () => {
  const analyzer = new CommandAnalyzer({ ...DEFAULT_AGENT_CONFIG, provider: 'mock' });

  it('should detect question intent', async () => {
    const analysis = await analyzer.analyze('현재 상태 알려줘', {});
    expect(analysis.intent).toBe('question');
    expect(analysis.complexity).toBe('simple');
  });

  it('should detect coding intent', async () => {
    const analysis = await analyzer.analyze('버튼 컴포넌트 추가해줘', {});
    expect(analysis.intent).toBe('coding');
  });

  it('should detect testing intent', async () => {
    const analysis = await analyzer.analyze('테스트 코드 작성해줘', {});
    expect(analysis.intent).toBe('testing');
  });

  it('should detect debugging intent', async () => {
    const analysis = await analyzer.analyze('이 에러 수정해줘', {});
    expect(analysis.intent).toBe('debugging');
  });

  it('should detect documentation intent', async () => {
    const analysis = await analyzer.analyze('README 문서 업데이트', {});
    expect(analysis.intent).toBe('documentation');
  });

  it('should detect complex tasks', async () => {
    const analysis = await analyzer.analyze('전체 아키텍처 리팩토링', {});
    expect(analysis.complexity).toBe('complex');
    expect(analysis.useOrchestration).toBe(true);
  });

  it('should flag destructive commands for confirmation', async () => {
    const analysis = await analyzer.analyze('데이터베이스 삭제해줘', {});
    expect(analysis.needsConfirmation).toBe(true);
  });

  it('should extract project from command', async () => {
    const analysis = await analyzer.analyze('gateway 패키지 수정', {});
    expect(analysis.targetProject).toBe('gateway');
  });

  it('should use context projectPath', async () => {
    const analysis = await analyzer.analyze('코드 수정', { projectPath: '/my/project' });
    expect(analysis.targetProject).toBe('/my/project');
  });
});

describe('ExecutionPlanner', () => {
  const planner = new ExecutionPlanner({ ...DEFAULT_AGENT_CONFIG, provider: 'mock' });

  it('should create single-worker plan for simple tasks', async () => {
    const plan = await planner.plan({
      intent: 'coding',
      complexity: 'simple',
      targetProject: '/test',
      targetFiles: [],
      requirements: ['간단한 수정'],
      useOrchestration: false,
      suggestedApproach: 'fix',
      risks: [],
      estimatedDuration: '1-2분',
      needsConfirmation: false,
    });

    expect(plan.strategy).toBe('single');
    expect(plan.workers.length).toBe(1);
    expect(plan.workers[0].orchestration).toBe(false);
  });

  it('should use orchestration for complex tasks with auto mode', async () => {
    const plan = await planner.plan({
      intent: 'coding',
      complexity: 'complex',
      targetProject: '/test',
      targetFiles: [],
      requirements: ['대규모 리팩토링'],
      useOrchestration: true,
      suggestedApproach: 'refactor',
      risks: [],
      estimatedDuration: '15-30분',
      needsConfirmation: false,
    });

    expect(plan.workers[0].orchestration).toBe(true);
    expect(plan.workers[0].prompt).toContain('/orchestration');
  });
});

describe('ResultReviewer', () => {
  const reviewer = new ResultReviewer({ ...DEFAULT_AGENT_CONFIG, provider: 'mock' });

  it('should mark all-success as success', async () => {
    const report = await reviewer.review(
      [{ workerId: 'w1', status: 'completed', exitCode: 0, output: 'Build complete\n빌드 성공\nTests 5 passed', duration: 1000 }],
      { id: 't1', command: 'test', state: 'REVIEWING', analysis: null, plan: null, workers: [], results: [], report: null, startedAt: 0 },
    );

    expect(report.status).toBe('success');
    expect(report.buildStatus).toBe('pass');
  });

  it('should mark all-failed as failed', async () => {
    const report = await reviewer.review(
      [{ workerId: 'w1', status: 'failed', exitCode: 1, output: '', duration: 1000, error: 'spawn failed' }],
      { id: 't1', command: 'test', state: 'REVIEWING', analysis: null, plan: null, workers: [], results: [], report: null, startedAt: 0 },
    );

    expect(report.status).toBe('failed');
  });

  it('should detect type errors and mark as partial', async () => {
    const report = await reviewer.review(
      [{ workerId: 'w1', status: 'completed', exitCode: 0, output: 'error TS2345: type mismatch\nerror TS2339: property missing', duration: 1000 }],
      { id: 't1', command: 'test', state: 'REVIEWING', analysis: null, plan: null, workers: [], results: [], report: null, startedAt: 0 },
    );

    // Type errors make it partial (testFail regex matches "error TS*")
    expect(report.status).toBe('partial');
    expect(report.buildStatus).toBe('fail');
  });

  it('should retry on failed status with type errors', async () => {
    const report = await reviewer.review(
      [{ workerId: 'w1', status: 'failed', exitCode: 1, output: 'error TS2345: type mismatch\nerror TS2339: property missing', duration: 1000 }],
      { id: 't1', command: 'test', state: 'REVIEWING', analysis: null, plan: null, workers: [], results: [], report: null, startedAt: 0 },
    );

    expect(report.status).toBe('failed');
    expect(report.shouldRetry).toBe(true);
    expect(report.retryReason).toContain('타입 에러');
  });
});

describe('AgentReporter', () => {
  it('should format success report', () => {
    const reporter = new AgentReporter();

    const formatted = reporter.formatReport({
      taskId: 't1',
      status: 'success',
      summary: '작업이 완료되었습니다.',
      details: '',
      changedFiles: ['src/index.ts', 'src/utils.ts'],
      testResults: 'Tests 10 passed',
      buildStatus: 'pass',
      warnings: [],
      nextSteps: [],
      shouldRetry: false,
    });

    expect(formatted).toContain('✅');
    expect(formatted).toContain('src/index.ts');
    expect(formatted).toContain('Tests 10 passed');
  });

  it('should format failure report with warnings', () => {
    const reporter = new AgentReporter();

    const formatted = reporter.formatReport({
      taskId: 't1',
      status: 'failed',
      summary: '빌드 실패',
      details: '',
      changedFiles: [],
      testResults: '',
      buildStatus: 'fail',
      warnings: ['unused variable'],
      nextSteps: ['에러 로그 확인'],
      shouldRetry: false,
    });

    expect(formatted).toContain('❌');
    expect(formatted).toContain('unused variable');
    expect(formatted).toContain('에러 로그 확인');
  });

  it('should distribute reports to listeners', async () => {
    const reporter = new AgentReporter();
    const listener = vi.fn();

    const unsubscribe = reporter.onReport(listener);

    await reporter.report({
      taskId: 't1',
      status: 'success',
      summary: 'done',
      details: '',
      changedFiles: [],
      testResults: '',
      buildStatus: 'pass',
      warnings: [],
      nextSteps: [],
      shouldRetry: false,
    });

    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();

    await reporter.report({
      taskId: 't2',
      status: 'success',
      summary: 'done2',
      details: '',
      changedFiles: [],
      testResults: '',
      buildStatus: 'pass',
      warnings: [],
      nextSteps: [],
      shouldRetry: false,
    });

    // Should not be called again after unsubscribe
    expect(listener).toHaveBeenCalledOnce();
  });
});
