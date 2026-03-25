import { describe, expect, it, vi } from 'vitest';
import { PtyWorkerHost } from '../pty-worker-host.js';
import type { TaskResult, TimeoutAwareResult, WorkerRuntimeLike } from '../worker-runtime.js';

class StubPtyWorker implements WorkerRuntimeLike {
  isProcessing = false;

  readonly start = vi.fn(async () => {});

  readonly executeTaskWithTimeout = vi.fn(
    async (_prompt: string): Promise<TimeoutAwareResult> => ({
      result: {
        success: true,
        text: 'executed',
        durationMs: 1,
      },
    }),
  );

  readonly monitorForCompletion = vi.fn(
    async (_prompt: string): Promise<TaskResult> => ({
      success: true,
      text: 'done',
      durationMs: 2,
    }),
  );

  readonly sendInput = vi.fn((_input: string) => {});

  readonly resize = vi.fn((_cols: number, _rows: number) => {});

  readonly destroy = vi.fn(() => {});
}

describe('PtyWorkerHost', () => {
  it('delegates runtime operations to the underlying PtyWorker', async () => {
    const ptyWorker = new StubPtyWorker();
    const host = new PtyWorkerHost({
      projectPath: '/workspace/server',
      trustMode: false,
      worker: ptyWorker,
    });

    await host.start();
    const timeoutAware = await host.executeTaskWithTimeout('git status');
    const monitored = await host.monitorForCompletion('git status');
    host.sendInput('status');
    host.sendRuntimeInput('continue', true);
    host.resize(120, 40);
    host.stop();

    expect(ptyWorker.start).toHaveBeenCalledTimes(1);
    expect(ptyWorker.executeTaskWithTimeout).toHaveBeenCalledWith('git status');
    expect(timeoutAware.result.text).toBe('executed');
    expect(ptyWorker.monitorForCompletion).toHaveBeenCalledWith('git status');
    expect(monitored.text).toBe('done');
    expect(ptyWorker.sendInput).toHaveBeenCalledWith('status');
    expect(ptyWorker.sendInput).toHaveBeenCalledWith('continue\r');
    expect(ptyWorker.resize).toHaveBeenCalledWith(120, 40);
    expect(ptyWorker.destroy).toHaveBeenCalledTimes(1);
  });

  it('exposes processing state from the underlying PtyWorker', () => {
    const ptyWorker = new StubPtyWorker();
    const host = new PtyWorkerHost({
      projectPath: '/workspace/server',
      trustMode: false,
      worker: ptyWorker,
    });

    expect(host.isProcessing).toBe(false);
    ptyWorker.isProcessing = true;
    expect(host.isProcessing).toBe(true);
  });

  it('supports submit/reset/snapshot through the host boundary', async () => {
    const ptyWorker = new StubPtyWorker();
    const host = new PtyWorkerHost({
      projectPath: '/workspace/server',
      trustMode: false,
      worker: ptyWorker,
      onData: () => {},
    });

    await host.start();
    host.sendInput('status', true);
    await host.resetSession();
    const snapshot = await host.captureTerminalSnapshot(50);

    expect(ptyWorker.sendInput).toHaveBeenCalledWith('status\r');
    expect(ptyWorker.destroy).toHaveBeenCalledTimes(1);
    expect(ptyWorker.start).toHaveBeenCalledTimes(2);
    expect(snapshot).toBe('');
  });
});
