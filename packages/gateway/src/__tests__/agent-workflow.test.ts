import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexAgent, type CodexAgentOptions } from '../agent/agent.js';
import { CommandAnalyzer } from '../agent/analyzer.js';
import { ExecutionPlanner } from '../agent/planner.js';
import { ResultReviewer } from '../agent/reviewer.js';
import { AgentReporter } from '../agent/reporter.js';
import { WorkerManager } from '../workers/manager.js';
import { DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';

/**
 * Integration test: full agent workflow from command → result.
 *
 * Tests the complete pipeline: Analyze → Plan → Execute → Review → Report
 * using mock workers to verify the orchestration logic.
 */

function createTestAgent(workerOverride?: WorkerManager): CodexAgent {
  const config = { ...DEFAULT_AGENT_CONFIG, provider: 'mock' as const };
  const workerManager = workerOverride ?? new WorkerManager({ maxConcurrent: 3 });
  return new CodexAgent({
    config,
    analyzer: new CommandAnalyzer(config),
    planner: new ExecutionPlanner(config),
    reviewer: new ResultReviewer(config),
    reporter: new AgentReporter(),
    workerManager,
  });
}

describe('Agent Workflow Integration', () => {
  it('should complete a simple question flow: IDLE → ANALYZING → REPORTING → IDLE', async () => {
    const agent = createTestAgent();
    const states: string[] = [];
    const results: unknown[] = [];

    agent.on('progress', (p: { state?: string }) => {
      if (p.state) states.push(p.state);
    });
    agent.on('result', (r: unknown) => results.push(r));

    const taskId = await agent.handleCommand({
      command: '현재 프로젝트 상태 어때?',
      senderId: 'user1',
      channelType: 'dashboard',
    });

    expect(taskId).toBeTruthy();

    // Wait for async pipeline
    await new Promise(r => setTimeout(r, 200));

    // Simple question shortcut: ANALYZING → REPORTING → IDLE
    expect(agent.state).toBe('IDLE');
    expect(results.length).toBe(1);
    const result = results[0] as { report: { status: string } };
    expect(result.report.status).toBe('success');
  });

  it('should complete a coding flow with mock worker', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    vi.spyOn(workerManager, 'execute').mockResolvedValue({
      workerId: 'w1',
      status: 'completed',
      exitCode: 0,
      output: 'Build complete\n빌드 성공\nTests 10 passed',
      duration: 2000,
    });

    const agent = createTestAgent(workerManager);
    const results: unknown[] = [];
    agent.on('result', (r: unknown) => results.push(r));

    await agent.handleCommand({
      command: '로그인 컴포넌트 추가해줘',
      senderId: 'user1',
      channelType: 'telegram',
    });

    // Wait for full pipeline
    await new Promise(r => setTimeout(r, 500));

    expect(agent.state).toBe('IDLE');
    expect(results.length).toBe(1);
    const result = results[0] as { report: { status: string } };
    expect(result.report.status).toBe('success');
  });

  it('should handle worker failure and emit error result', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    vi.spyOn(workerManager, 'execute').mockResolvedValue({
      workerId: 'w1',
      status: 'failed',
      exitCode: 1,
      output: '',
      duration: 100,
      error: 'spawn ENOENT',
    });

    const agent = createTestAgent(workerManager);
    const results: unknown[] = [];
    agent.on('result', (r: unknown) => results.push(r));

    await agent.handleCommand({
      command: '빌드 실행해줘',
      senderId: 'user1',
      channelType: 'test',
    });

    await new Promise(r => setTimeout(r, 500));

    expect(agent.state).toBe('IDLE');
    expect(results.length).toBe(1);
    const result = results[0] as { report: { status: string } };
    expect(result.report.status).toBe('failed');
  });

  it('should queue multiple commands and process them in order', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    let callCount = 0;
    vi.spyOn(workerManager, 'execute').mockImplementation(
      () => new Promise(resolve => {
        callCount++;
        const n = callCount;
        setTimeout(() => resolve({
          workerId: `w${n}`,
          status: 'completed',
          exitCode: 0,
          output: `Task ${n} done`,
          duration: 100,
        }), 200);
      })
    );

    const agent = createTestAgent(workerManager);
    const results: unknown[] = [];
    agent.on('result', (r: unknown) => results.push(r));

    // First command
    await agent.handleCommand({
      command: '컴포넌트 수정',
      senderId: 'user1',
      channelType: 'test',
    });

    // Wait for state transition
    await new Promise(r => setTimeout(r, 50));

    // Second command should be queued
    await agent.handleCommand({
      command: '테스트 실행',
      senderId: 'user1',
      channelType: 'test',
    });

    expect(agent.queueSize).toBe(1);

    // Wait for both to complete
    await new Promise(r => setTimeout(r, 2000));

    expect(agent.state).toBe('IDLE');
    expect(results.length).toBe(2);
  });

  it('should cancel and return to IDLE', async () => {
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

    const agent = createTestAgent(workerManager);
    const errors: unknown[] = [];
    agent.on('error', (e: unknown) => errors.push(e));

    await agent.handleCommand({
      command: '대규모 리팩토링 시작',
      senderId: 'user1',
      channelType: 'test',
    });

    await new Promise(r => setTimeout(r, 50));
    expect(agent.state).not.toBe('IDLE');

    agent.cancel();
    expect(agent.state).toBe('IDLE');
  });

  it('should emit progress events throughout pipeline', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    vi.spyOn(workerManager, 'execute').mockResolvedValue({
      workerId: 'w1',
      status: 'completed',
      exitCode: 0,
      output: 'ok',
      duration: 100,
    });

    const agent = createTestAgent(workerManager);
    const progressEvents: unknown[] = [];
    agent.on('progress', (p: unknown) => progressEvents.push(p));

    await agent.handleCommand({
      command: '간단한 수정',
      senderId: 'user1',
      channelType: 'test',
    });

    await new Promise(r => setTimeout(r, 500));

    // Should have multiple progress events (state transitions)
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
  });
});
