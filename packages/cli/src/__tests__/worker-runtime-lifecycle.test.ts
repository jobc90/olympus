import { describe, expect, it, vi } from 'vitest';
import { WorkerRuntimeLifecycle, type ProcessSignalHost } from '../worker-runtime-lifecycle.js';
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

function createLifecycle() {
  const runtime = createRuntime();
  const gatewaySession = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  };
  const controlPlaneClient = {
    deregisterWorker: vi.fn(async () => {}),
  };
  const processHost: ProcessSignalHost = {
    on: vi.fn(),
    off: vi.fn(),
    exit: vi.fn((() => undefined) as never),
  };
  const onStarted = vi.fn();
  const onShutdownStart = vi.fn();
  const logBrief = vi.fn();

  const lifecycle = new WorkerRuntimeLifecycle({
    runtime,
    gatewaySession: gatewaySession as never,
    controlPlaneClient: controlPlaneClient as never,
    workerId: 'worker-1',
    runtimeKind: 'tmux',
    logBrief,
    onStarted,
    onShutdownStart,
    processHost,
    startTimeoutMs: 50,
  });

  return { lifecycle, runtime, gatewaySession, controlPlaneClient, processHost, onStarted, onShutdownStart, logBrief };
}

describe('WorkerRuntimeLifecycle', () => {
  it('starts the runtime and gateway session, then marks runtime ownership via callback', async () => {
    const { lifecycle, runtime, gatewaySession, onStarted } = createLifecycle();

    await lifecycle.start();

    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(gatewaySession.start).toHaveBeenCalledTimes(1);
  });

  it('installs signal handlers and routes runtime exit through shutdown', async () => {
    const { lifecycle, processHost, gatewaySession, runtime, controlPlaneClient } = createLifecycle();

    lifecycle.installSignalHandlers();
    const sigintHandler = vi.mocked(processHost.on).mock.calls.find(([signal]) => signal === 'SIGINT')?.[1];
    expect(sigintHandler).toBeTypeOf('function');

    await sigintHandler?.();

    expect(gatewaySession.stop).toHaveBeenCalledTimes(1);
    expect(runtime.destroy).toHaveBeenCalledTimes(1);
    expect(controlPlaneClient.deregisterWorker).toHaveBeenCalledWith('worker-1');
    expect(processHost.exit).toHaveBeenCalledWith(0);
  });

  it('handles runtime start failure by deregistering the worker and exiting', async () => {
    const { lifecycle, runtime, controlPlaneClient, processHost, logBrief } = createLifecycle();
    vi.mocked(runtime.start).mockRejectedValueOnce(new Error('tmux missing'));

    await lifecycle.start().catch((error) => lifecycle.handleStartFailure(error as Error));

    expect(controlPlaneClient.deregisterWorker).toHaveBeenCalledWith('worker-1');
    expect(logBrief).toHaveBeenCalledWith(expect.stringContaining('tmux 시작 실패'));
    expect(processHost.exit).toHaveBeenCalledWith(1);
  });

  it('returns a runtime exit handler that triggers shutdown only once', async () => {
    const { lifecycle, gatewaySession, runtime, processHost, onShutdownStart } = createLifecycle();
    const exitHandler = lifecycle.createRuntimeExitHandler();

    await exitHandler();
    await lifecycle.shutdown('SIGINT');

    expect(onShutdownStart).toHaveBeenCalledTimes(1);
    expect(gatewaySession.stop).toHaveBeenCalledTimes(1);
    expect(runtime.destroy).toHaveBeenCalledTimes(1);
    expect(processHost.exit).toHaveBeenCalledTimes(1);
  });
});
