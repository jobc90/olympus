import { describe, expect, it, vi } from 'vitest';
import {
  buildCreateWorkerRuntimeInput,
  createWorkerRuntime,
  type CreateWorkerRuntimeDeps,
  type TaskResult,
  type TimeoutAwareResult,
  type WorkerRuntimeLike,
} from '../worker-runtime.js';

class StubRuntime implements WorkerRuntimeLike {
  isProcessing = false;

  constructor(readonly kind: 'pty' | 'tmux') {}

  async start(): Promise<void> {}

  async executeTaskWithTimeout(_prompt: string): Promise<TimeoutAwareResult> {
    return { result: { success: true, text: this.kind, durationMs: 1 } };
  }

  async monitorForCompletion(_prompt: string): Promise<TaskResult> {
    return { success: true, text: this.kind, durationMs: 1 };
  }

  sendInput(_input: string): void {}

  resize(_cols: number, _rows: number): void {}

  destroy(): void {}
}

describe('createWorkerRuntime', () => {
  it('builds tmux runtime input without pty-only hooks', () => {
    const onData = vi.fn();
    const input = buildCreateWorkerRuntimeInput({
      runtimeKind: 'tmux',
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: true,
      socketsRoot: '/tmp/runtime-sockets',
      hooks: {
        onData,
      },
    });

    expect(input).toEqual({
      runtimeKind: 'tmux',
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: true,
      socketsRoot: '/tmp/runtime-sockets',
    });
    expect(input).not.toHaveProperty('onData');
  });

  it('builds pty runtime input with runtime hooks', () => {
    const onData = vi.fn();
    const onReady = vi.fn();
    const onExit = vi.fn();
    const onLocalInput = vi.fn();

    const input = buildCreateWorkerRuntimeInput({
      runtimeKind: 'pty',
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: false,
      socketsRoot: '/tmp/runtime-sockets',
      hooks: {
        onData,
        onReady,
        onExit,
        onLocalInput,
      },
    });

    expect(input).toEqual({
      runtimeKind: 'pty',
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: false,
      socketsRoot: '/tmp/runtime-sockets',
      onData,
      onReady,
      onExit,
      onLocalInput,
    });
  });

  it('creates a tmux runtime by default', async () => {
    const tmuxRuntime = new StubRuntime('tmux');
    const TmuxWorkerRuntime = vi.fn().mockImplementation(() => tmuxRuntime);
    const deps: CreateWorkerRuntimeDeps = {
      loadTmuxWorkerRuntime: vi.fn(async () => ({
        TmuxWorkerRuntime,
      })),
      loadPtyWorkerRuntime: vi.fn(async () => {
        throw new Error('should not load pty');
      }),
    };

    const runtime = await createWorkerRuntime({
      runtimeKind: 'tmux',
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: true,
      socketsRoot: '/tmp/runtime-sockets',
      hooks: {
        onData: vi.fn(),
      },
    }, deps);

    expect(runtime).toBe(tmuxRuntime);
    expect(deps.loadTmuxWorkerRuntime).toHaveBeenCalled();
    expect(TmuxWorkerRuntime).toHaveBeenCalledWith({
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: true,
      socketsRoot: '/tmp/runtime-sockets',
    });
  });

  it('creates a pty runtime with local terminal callbacks', async () => {
    const ptyRuntime = new StubRuntime('pty');
    const PtyWorkerRuntime = vi.fn().mockImplementation(() => ptyRuntime);
    const deps: CreateWorkerRuntimeDeps = {
      loadTmuxWorkerRuntime: vi.fn(async () => {
        throw new Error('should not load tmux');
      }),
      loadPtyWorkerRuntime: vi.fn(async () => ({
        PtyWorkerRuntime,
      })),
    };
    const onData = vi.fn();
    const onReady = vi.fn();
    const onExit = vi.fn();
    const onLocalInput = vi.fn();

    const runtime = await createWorkerRuntime({
      runtimeKind: 'pty',
      projectPath: '/workspace/server',
      trustMode: false,
      hooks: {
        onData,
        onReady,
        onExit,
        onLocalInput,
      },
    }, deps);

    expect(runtime).toBe(ptyRuntime);
    expect(deps.loadPtyWorkerRuntime).toHaveBeenCalled();
    expect(PtyWorkerRuntime).toHaveBeenCalledWith({
      projectPath: '/workspace/server',
      workerName: undefined,
      trustMode: false,
      socketsRoot: undefined,
      onData,
      onReady,
      onExit,
      onLocalInput,
    });
  });
});
