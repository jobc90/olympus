import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { PtyWorkerRuntime } from '../pty-worker-runtime.js';
import { RuntimeSocketClient } from '../worker-host/runtime-socket.js';
import { createRuntimeControlRequest } from '@olympus-dev/protocol';
import type { TaskResult, TimeoutAwareResult } from '../worker-runtime.js';
import type { PtyWorkerHostLike } from '../pty-worker-host.js';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true });
  }));
});

class StubPtyHost implements PtyWorkerHostLike {
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

  readonly sendInput = vi.fn((_input: string, _submit?: boolean) => {});

  readonly sendRuntimeInput = vi.fn((input: string, submit?: boolean) => {
    this.sendInput(input, submit);
  });

  readonly resize = vi.fn((_cols: number, _rows: number) => {});

  readonly resetSession = vi.fn(async () => {});

  readonly captureTerminalSnapshot = vi.fn(async (_lines = 200) => 'pty snapshot');

  readonly stop = vi.fn(() => {});
}

describe('PtyWorkerRuntime', () => {
  it('delegates lifecycle and task execution to the underlying PtyWorkerHost', async () => {
    const host = new StubPtyHost();
    const runtime = new PtyWorkerRuntime({
      projectPath: '/workspace/server',
      trustMode: false,
      host,
    });

    await runtime.start();
    const timeoutAware = await runtime.executeTaskWithTimeout('git status');
    const monitored = await runtime.monitorForCompletion('git status');
    runtime.sendInput('status');
    runtime.resize(120, 40);
    runtime.destroy();

    expect(host.start).toHaveBeenCalledTimes(1);
    expect(host.executeTaskWithTimeout).toHaveBeenCalledWith('git status');
    expect(timeoutAware.result.text).toBe('executed');
    expect(host.monitorForCompletion).toHaveBeenCalledWith('git status');
    expect(monitored.text).toBe('done');
    expect(host.sendRuntimeInput).toHaveBeenCalledWith('status');
    expect(host.resize).toHaveBeenCalledWith(120, 40);
    expect(host.stop).toHaveBeenCalledTimes(1);
  });

  it('exposes processing state from the underlying PtyWorkerHost', () => {
    const host = new StubPtyHost();
    const runtime = new PtyWorkerRuntime({
      projectPath: '/workspace/server',
      trustMode: false,
      host,
    });

    expect(runtime.isProcessing).toBe(false);
    host.isProcessing = true;
    expect(runtime.isProcessing).toBe(true);
  });

  it('serves runtime-control commands over the worker socket', async () => {
    const socketsRoot = await mkdtemp(join('/tmp', 'opr-pty-'));
    cleanupPaths.push(socketsRoot);
    const host = new StubPtyHost();
    const runtime = new PtyWorkerRuntime({
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: false,
      socketsRoot,
      host,
    });

    await runtime.start();

    const client = new RuntimeSocketClient(runtime.getRuntimeSocketPath()!);
    const sendInputResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-input',
      worker_id: 'server-worker',
      command: 'send_input',
      payload: {
        text: 'status',
        submit: true,
        source: 'dashboard',
      },
    }));
    const lockResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-lock',
      worker_id: 'server-worker',
      command: 'lock_input',
      payload: {
        reason: 'pause',
      },
    }));
    const stateResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-state',
      worker_id: 'server-worker',
      command: 'get_state',
      payload: {},
    }));
    const snapshotResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-snapshot',
      worker_id: 'server-worker',
      command: 'capture_terminal_snapshot',
      payload: {
        lines: 50,
      },
    }));
    const resetResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-reset',
      worker_id: 'server-worker',
      command: 'reset_session',
      payload: {
        reason: 'retry',
      },
    }));
    const unlockResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-unlock',
      worker_id: 'server-worker',
      command: 'unlock_input',
      payload: {
        reason: 'resume',
      },
    }));

    await runtime.destroy();

    expect(sendInputResponse).toMatchObject({
      ok: true,
      result: {
        type: 'accepted',
        accepted: true,
      },
    });
    expect(lockResponse).toMatchObject({
      ok: true,
      result: {
        type: 'state',
        input_locked: true,
      },
    });
    expect(stateResponse).toMatchObject({
      ok: true,
      result: {
        type: 'state',
        input_locked: true,
      },
    });
    expect(snapshotResponse).toMatchObject({
      ok: true,
      result: {
        type: 'terminal_snapshot',
        snapshot: 'pty snapshot',
        lines: 50,
      },
    });
    expect(resetResponse).toMatchObject({
      ok: true,
      result: {
        type: 'accepted',
        accepted: true,
      },
    });
    expect(unlockResponse).toMatchObject({
      ok: true,
      result: {
        type: 'state',
        input_locked: false,
      },
    });
    expect(host.sendRuntimeInput).toHaveBeenCalledWith('status', true);
    expect(host.captureTerminalSnapshot).toHaveBeenCalledWith(50);
    expect(host.resetSession).toHaveBeenCalledTimes(1);
  });
});
