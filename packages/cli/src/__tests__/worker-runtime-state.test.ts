import { describe, expect, it, vi } from 'vitest';
import { createWorkerRuntimeState } from '../worker-runtime-state.js';

describe('createWorkerRuntimeState', () => {
  it('keeps tmux terminal ownership disabled after start and stores exit handler', async () => {
    const state = createWorkerRuntimeState('tmux');
    const exitHandler = vi.fn(async () => {});

    expect(state.isRuntimeOwningTerminal()).toBe(false);
    expect(state.getRuntimeExitHandler()).toBeNull();

    state.setRuntimeExitHandler(exitHandler);
    state.markStarted();

    expect(state.isRuntimeOwningTerminal()).toBe(false);
    await state.getRuntimeExitHandler()?.();
    expect(exitHandler).toHaveBeenCalledTimes(1);
  });

  it('enables terminal ownership for pty after start', () => {
    const state = createWorkerRuntimeState('pty');

    expect(state.isRuntimeOwningTerminal()).toBe(false);

    state.markStarted();

    expect(state.isRuntimeOwningTerminal()).toBe(true);
  });

  it('tracks shutdown state for local input gating', () => {
    const state = createWorkerRuntimeState('pty');

    expect(state.isShuttingDown()).toBe(false);

    state.beginShutdown();

    expect(state.isShuttingDown()).toBe(true);
  });
});
