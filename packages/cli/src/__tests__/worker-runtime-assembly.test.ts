import { describe, expect, it, vi } from 'vitest';
import { createWorkerRuntimeAssembly } from '../worker-runtime-assembly.js';
import { createWorkerRuntimeState } from '../worker-runtime-state.js';
import type { WorkerRuntimeLike } from '../worker-runtime.js';

function createRuntime(): WorkerRuntimeLike {
  return {
    start: vi.fn(async () => {}),
    executeTaskWithTimeout: vi.fn(),
    monitorForCompletion: vi.fn(),
    sendInput: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    get isProcessing() {
      return false;
    },
  };
}

describe('createWorkerRuntimeAssembly', () => {
  it('assembles gateway session, runtime, orchestrator, and lifecycle around shared state', async () => {
    const runtime = createRuntime();
    const runtimeState = createWorkerRuntimeState('pty');
    const hooks = { onData: vi.fn() };
    const reportResult = vi.fn(async () => {});
    const queueWorkerStream = vi.fn();
    const gatewaySession = {
      reportResult,
      queueWorkerStream,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const taskOrchestrator = {
      handleAssignedTask: vi.fn(async () => {}),
      forwardInput: vi.fn(),
      forwardResize: vi.fn(),
      recoverPendingTask: vi.fn(async () => {}),
    };
    const runtimeExitHandler = vi.fn(async () => {});
    const runtimeLifecycle = {
      start: vi.fn(async () => {}),
      handleStartFailure: vi.fn(async () => {
        throw new Error('should not be called');
      }),
      installSignalHandlers: vi.fn(),
      createRuntimeExitHandler: vi.fn(() => runtimeExitHandler),
    };

    let gatewaySessionOptions: Record<string, unknown> | undefined;
    let runtimeLifecycleOptions: Record<string, unknown> | undefined;

    const assembly = await createWorkerRuntimeAssembly({
      workerId: 'worker-1',
      workerName: 'alpha',
      projectPath: '/workspace/server',
      runtimeKind: 'pty',
      runtimeSocketsRoot: '/tmp/runtime-sockets',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: true,
      handledTaskIds: new Set<string>(),
      controlPlaneClient: {} as never,
      runtimeState,
      logBrief: vi.fn(),
    }, {
      createGatewaySession: (options) => {
        gatewaySessionOptions = options as unknown as Record<string, unknown>;
        return gatewaySession as never;
      },
      createWorkerRuntimeBridge: vi.fn(() => hooks),
      createWorkerRuntime: vi.fn(async () => runtime),
      createTaskOrchestrator: vi.fn(() => taskOrchestrator as never),
      createRuntimeLifecycle: (options) => {
        runtimeLifecycleOptions = options as unknown as Record<string, unknown>;
        return runtimeLifecycle as never;
      },
    });

    expect(assembly.gatewaySession).toBe(gatewaySession);
    expect(assembly.runtime).toBe(runtime);
    expect(assembly.taskOrchestrator).toBe(taskOrchestrator);
    expect(assembly.runtimeLifecycle).toBe(runtimeLifecycle);

    expect(gatewaySessionOptions).toBeTruthy();
    await (gatewaySessionOptions?.onAssignedTask as (payload: unknown) => Promise<void>)({ taskId: 'task-1' });
    expect(taskOrchestrator.handleAssignedTask).toHaveBeenCalledWith({ taskId: 'task-1' });

    (gatewaySessionOptions?.onInput as (payload: unknown) => void)({ input: 'status' });
    expect(taskOrchestrator.forwardInput).toHaveBeenCalledWith({ input: 'status' });

    (gatewaySessionOptions?.onResize as (payload: unknown) => void)({ cols: 80, rows: 24 });
    expect(taskOrchestrator.forwardResize).toHaveBeenCalledWith({ cols: 80, rows: 24 });

    await (gatewaySessionOptions?.onRecoverPendingTasks as (tasks: unknown[]) => Promise<void>)([{ taskId: 'task-1' }]);
    expect(taskOrchestrator.recoverPendingTask).toHaveBeenCalledWith([{ taskId: 'task-1' }]);

    expect(runtimeLifecycleOptions).toBeTruthy();
    expect(runtimeState.isRuntimeOwningTerminal()).toBe(false);
    (runtimeLifecycleOptions?.onStarted as () => void)();
    expect(runtimeState.isRuntimeOwningTerminal()).toBe(true);
    expect(runtimeState.getRuntimeExitHandler()).toBe(runtimeExitHandler);
    expect(runtimeState.isShuttingDown()).toBe(false);
    (runtimeLifecycleOptions?.onShutdownStart as () => void)();
    expect(runtimeState.isShuttingDown()).toBe(true);
  });
});
