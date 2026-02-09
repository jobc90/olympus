import { describe, it, expect, vi } from 'vitest';
import { CodexAgent } from '../agent/agent.js';
import { CommandAnalyzer } from '../agent/analyzer.js';
import { ExecutionPlanner } from '../agent/planner.js';
import { ResultReviewer } from '../agent/reviewer.js';
import { AgentReporter } from '../agent/reporter.js';
import { WorkerManager } from '../workers/manager.js';
import { DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';
import type { WorkerTask, ExecutionPlan } from '@olympus-dev/protocol';

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

function makePlan(workers: WorkerTask[]): ExecutionPlan {
  return {
    strategy: 'pipeline',
    workers,
    checkpoints: [],
    rollbackStrategy: 'none',
    totalEstimate: '1s',
  };
}

function makeWorker(id: string, prompt: string): WorkerTask {
  return {
    id,
    type: 'claude-cli',
    prompt,
    projectPath: '/tmp',
    dependencies: [],
    timeout: 30_000,
    orchestration: false,
    successCriteria: [],
  };
}

describe('Pipeline Output Chaining (A1)', () => {
  it('should chain output from previous worker to next worker prompt', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    const capturedPrompts: string[] = [];

    vi.spyOn(workerManager, 'execute').mockImplementation(async (task: WorkerTask) => {
      capturedPrompts.push(task.prompt);
      return {
        workerId: task.id,
        status: 'completed',
        exitCode: 0,
        output: `Output from ${task.id}`,
        duration: 100,
      };
    });

    const agent = createTestAgent(workerManager);
    const plan = makePlan([
      makeWorker('w1', 'Step 1'),
      makeWorker('w2', 'Step 2'),
    ]);

    // Set _currentTask to avoid null reference in emitProgress
    (agent as unknown as Record<string, unknown>)['_currentTask'] = {
      id: 'test',
      command: 'test',
      state: 'EXECUTING',
      analysis: null,
      plan: null,
      workers: plan.workers,
      results: [],
      report: null,
      startedAt: Date.now(),
    };

    // Call executeWorkers directly via reflection
    const executeWorkers = (agent as unknown as Record<string, (p: ExecutionPlan) => Promise<unknown[]>>)['executeWorkers'];
    const results = await executeWorkers.call(agent, plan);
    expect(results).toHaveLength(2);

    // First prompt should be original
    expect(capturedPrompts[0]).toBe('Step 1');
    // Second prompt should include output from first worker
    expect(capturedPrompts[1]).toContain('Step 2');
    expect(capturedPrompts[1]).toContain('Output from w1');
    expect(capturedPrompts[1]).toContain('Previous step output');
  });

  it('should stop pipeline on failure', async () => {
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    let callCount = 0;

    vi.spyOn(workerManager, 'execute').mockImplementation(async (task: WorkerTask) => {
      callCount++;
      if (task.id === 'w1') {
        return {
          workerId: task.id,
          status: 'failed',
          exitCode: 1,
          output: '',
          duration: 100,
          error: 'Step 1 failed',
        };
      }
      return {
        workerId: task.id,
        status: 'completed',
        exitCode: 0,
        output: 'ok',
        duration: 100,
      };
    });

    const agent = createTestAgent(workerManager);
    const plan = makePlan([
      makeWorker('w1', 'Fail step'),
      makeWorker('w2', 'Should not run'),
    ]);

    (agent as unknown as Record<string, unknown>)['_currentTask'] = {
      id: 'test',
      command: 'test',
      state: 'EXECUTING',
      analysis: null,
      plan: null,
      workers: plan.workers,
      results: [],
      report: null,
      startedAt: Date.now(),
    };

    const executeWorkers = (agent as unknown as Record<string, (p: ExecutionPlan) => Promise<unknown[]>>)['executeWorkers'];
    const results = await executeWorkers.call(agent, plan);
    // Only 1 result — pipeline stopped on failure
    expect(results).toHaveLength(1);
    expect(callCount).toBe(1);
  });
});
