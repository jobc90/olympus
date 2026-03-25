import { describe, expect, it, vi } from 'vitest';
import { WorkerTaskOrchestrator, selectPendingTaskForWorker } from '../worker-task-orchestrator.js';
import type { WorkerRuntimeLike } from '../worker-runtime.js';

function createRuntime(): WorkerRuntimeLike {
  return {
    start: vi.fn(async () => {}),
    executeTaskWithTimeout: vi.fn(async () => ({
      result: {
        success: true,
        text: 'implemented',
        durationMs: 12,
      },
    })),
    monitorForCompletion: vi.fn(async () => ({
      success: true,
      text: 'monitored',
      durationMs: 15,
    })),
    sendInput: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    get isProcessing() {
      return false;
    },
  };
}

describe('WorkerTaskOrchestrator', () => {
  it('executes normal assigned tasks through executeTaskWithTimeout', async () => {
    const runtime = createRuntime();
    const reportResult = vi.fn(async () => {});
    const orchestrator = new WorkerTaskOrchestrator({
      workerId: 'worker-1',
      projectPath: '/workspace/server',
      runtime,
      handledTaskIds: new Set(),
      isRuntimeOwningTerminal: () => false,
      reportResult,
    });

    await orchestrator.handleAssignedTask({
      taskId: 'task-1',
      workerId: 'worker-1',
      workerName: 'server-default',
      prompt: 'Implement login API',
    });

    expect(runtime.executeTaskWithTimeout).toHaveBeenCalledWith('Implement login API');
    expect(reportResult).toHaveBeenCalledWith('task-1', {
      success: true,
      text: 'implemented',
      truncated: false,
      originalLength: undefined,
      durationMs: 12,
    });
  });

  it('monitors terminal sourced tasks without re-sending input', async () => {
    const runtime = createRuntime();
    const reportResult = vi.fn(async () => {});
    const orchestrator = new WorkerTaskOrchestrator({
      workerId: 'worker-1',
      projectPath: '/workspace/server',
      runtime,
      handledTaskIds: new Set(),
      isRuntimeOwningTerminal: () => false,
      reportResult,
    });

    await orchestrator.handleAssignedTask({
      taskId: 'task-terminal',
      workerId: 'worker-1',
      workerName: 'server-default',
      prompt: 'status',
      source: 'terminal',
    });

    await Promise.resolve();

    expect(runtime.monitorForCompletion).toHaveBeenCalledWith('status');
    expect(runtime.executeTaskWithTimeout).not.toHaveBeenCalled();
    expect(reportResult).toHaveBeenCalledWith('task-terminal', {
      success: true,
      text: 'monitored',
      truncated: false,
      originalLength: undefined,
      durationMs: 15,
    });
  });

  it('skips execution for local-pty sourced tasks', async () => {
    const runtime = createRuntime();
    const reportResult = vi.fn(async () => {});
    const handledTaskIds = new Set<string>();
    const orchestrator = new WorkerTaskOrchestrator({
      workerId: 'worker-1',
      projectPath: '/workspace/server',
      runtime,
      handledTaskIds,
      isRuntimeOwningTerminal: () => true,
      reportResult,
    });

    await orchestrator.handleAssignedTask({
      taskId: 'task-local',
      workerId: 'worker-1',
      workerName: 'server-default',
      prompt: 'already typed',
      source: 'local-pty',
    });

    expect(handledTaskIds.has('task-local')).toBe(true);
    expect(runtime.executeTaskWithTimeout).not.toHaveBeenCalled();
    expect(runtime.monitorForCompletion).not.toHaveBeenCalled();
    expect(reportResult).not.toHaveBeenCalled();
  });

  it('recovers pending tasks for the current worker', async () => {
    const runtime = createRuntime();
    const reportResult = vi.fn(async () => {});
    const orchestrator = new WorkerTaskOrchestrator({
      workerId: 'worker-1',
      projectPath: '/workspace/server',
      runtime,
      handledTaskIds: new Set(),
      isRuntimeOwningTerminal: () => false,
      reportResult,
    });

    await orchestrator.recoverPendingTask([
      {
        taskId: 'task-1',
        workerId: 'worker-1',
        workerName: 'server-default',
        prompt: 'Recover me',
        status: 'running',
      },
    ]);

    expect(runtime.executeTaskWithTimeout).toHaveBeenCalledWith('Recover me');
  });

  it('reads terminal ownership from live state instead of constructor-time capture', async () => {
    const runtime = createRuntime();
    const reportResult = vi.fn(async () => {});
    const logDiagnostic = vi.fn();
    let runtimeOwnsTerminal = false;
    vi.mocked(runtime.executeTaskWithTimeout).mockRejectedValueOnce(new Error('boom'));

    const orchestrator = new WorkerTaskOrchestrator({
      workerId: 'worker-1',
      projectPath: '/workspace/server',
      runtime,
      handledTaskIds: new Set(),
      isRuntimeOwningTerminal: () => runtimeOwnsTerminal,
      reportResult,
      logDiagnostic,
    });

    runtimeOwnsTerminal = true;

    await orchestrator.handleAssignedTask({
      taskId: 'task-live-state',
      workerId: 'worker-1',
      workerName: 'server-default',
      prompt: 'Implement login API',
    });

    expect(logDiagnostic).not.toHaveBeenCalled();
    expect(reportResult).toHaveBeenCalledWith('task-live-state', {
      success: false,
      error: 'boom',
      durationMs: 0,
    });
  });
});

describe('selectPendingTaskForWorker', () => {
  it('selects timeout tasks as recoverable work', () => {
    const task = selectPendingTaskForWorker([
      { taskId: 't1', workerId: 'w1', workerName: 'a', prompt: 'x', status: 'timeout' },
    ], 'w1', new Set());

    expect(task?.taskId).toBe('t1');
  });
});
