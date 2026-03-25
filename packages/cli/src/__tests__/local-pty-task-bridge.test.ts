import { describe, expect, it, vi } from 'vitest';
import { createLocalPtyTaskBridge } from '../local-pty-task-bridge.js';
import type { TaskResult } from '../worker-runtime.js';
import type { ReportTaskResultInput } from '../worker-task-orchestrator.js';

describe('createLocalPtyTaskBridge', () => {
  it('creates a task, monitors completion, and reports success', async () => {
    const handledTaskIds = new Set<string>();
    const monitorForCompletion = vi.fn<() => Promise<TaskResult>>(async () => ({
      success: true,
      text: 'completed successfully',
      durationMs: 123,
    }));
    const reportResult = vi.fn<(taskId: string, result: ReportTaskResultInput) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain('/api/workers/worker-1/task');
      return new Response(JSON.stringify({ taskId: 'task-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const bridge = createLocalPtyTaskBridge({
      workerId: 'worker-1',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: true,
      handledTaskIds,
      isRuntimeProcessing: () => false,
      shouldAcceptInput: () => true,
      monitorForCompletion,
      reportResult,
      fetchImpl,
    });

    await bridge.onLocalInput('git status');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(monitorForCompletion).toHaveBeenCalledWith('git status');
    expect(handledTaskIds.has('task-1')).toBe(true);
    expect(reportResult).toHaveBeenCalledWith('task-1', {
      success: true,
      text: 'completed successfully',
      durationMs: 123,
    });
  });

  it('does nothing when input should be ignored', async () => {
    const monitorForCompletion = vi.fn<() => Promise<TaskResult>>();
    const reportResult = vi.fn<(taskId: string, result: ReportTaskResultInput) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn<typeof fetch>();

    const bridge = createLocalPtyTaskBridge({
      workerId: 'worker-1',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: false,
      handledTaskIds: new Set<string>(),
      isRuntimeProcessing: () => false,
      shouldAcceptInput: () => false,
      monitorForCompletion,
      reportResult,
      fetchImpl,
    });

    await bridge.onLocalInput('git status');

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(monitorForCompletion).not.toHaveBeenCalled();
    expect(reportResult).not.toHaveBeenCalled();
  });

  it('reports monitor failures after task creation succeeds', async () => {
    const monitorForCompletion = vi.fn<() => Promise<TaskResult>>(async () => {
      throw new Error('runtime failed');
    });
    const reportResult = vi.fn<(taskId: string, result: ReportTaskResultInput) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ taskId: 'task-2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const bridge = createLocalPtyTaskBridge({
      workerId: 'worker-1',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: false,
      handledTaskIds: new Set<string>(),
      isRuntimeProcessing: () => false,
      shouldAcceptInput: () => true,
      monitorForCompletion,
      reportResult,
      fetchImpl,
    });

    await bridge.onLocalInput('git status');

    expect(reportResult).toHaveBeenCalledWith('task-2', {
      success: false,
      error: 'runtime failed',
      durationMs: 0,
    });
  });
});
