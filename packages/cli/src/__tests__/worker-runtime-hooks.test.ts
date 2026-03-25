import { describe, expect, it, vi } from 'vitest';
import {
  createWorkerRuntimeHooks,
  runtimeOwnsTerminalForKind,
} from '../worker-runtime-hooks.js';

describe('worker-runtime-hooks', () => {
  it('returns no-op hooks for tmux workers', () => {
    const hooks = createWorkerRuntimeHooks({
      runtimeKind: 'tmux',
      queueWorkerStream: vi.fn(),
      getRuntimeExitHandler: () => null,
    });

    expect(hooks).toEqual({});
    expect(runtimeOwnsTerminalForKind('tmux')).toBe(false);
  });

  it('builds pty-specific hooks that delegate to stream, exit, and local input bridges', async () => {
    const queueWorkerStream = vi.fn();
    const onLocalInput = vi.fn(async () => {});
    const runtimeExitHandler = vi.fn(async () => {});
    const hooks = createWorkerRuntimeHooks({
      runtimeKind: 'pty',
      queueWorkerStream,
      localPtyTaskBridge: {
        onLocalInput,
      },
      getRuntimeExitHandler: () => runtimeExitHandler,
    });

    hooks.onData?.('chunk');
    hooks.onReady?.();
    hooks.onExit?.();
    await hooks.onLocalInput?.('git status');

    expect(queueWorkerStream).toHaveBeenCalledWith('chunk');
    expect(runtimeExitHandler).toHaveBeenCalledTimes(1);
    expect(onLocalInput).toHaveBeenCalledWith('git status');
    expect(runtimeOwnsTerminalForKind('pty')).toBe(true);
  });
});
