import { describe, expect, it, vi } from 'vitest';
import { createWorkerRuntimeBridge } from '../worker-runtime-bridge.js';

describe('createWorkerRuntimeBridge', () => {
  it('returns empty hooks for tmux without creating a local pty bridge', () => {
    const createLocalPtyTaskBridge = vi.fn();
    const createWorkerRuntimeHooks = vi.fn();

    const hooks = createWorkerRuntimeBridge({
      runtimeKind: 'tmux',
      workerId: 'worker-1',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: false,
      handledTaskIds: new Set<string>(),
      isRuntimeProcessing: () => false,
      shouldAcceptInput: () => true,
      monitorForCompletion: async () => ({
        success: true,
        text: 'done',
        durationMs: 1,
      }),
      reportResult: async () => {},
      queueWorkerStream: vi.fn(),
      getRuntimeExitHandler: () => null,
    }, {
      createLocalPtyTaskBridge,
      createWorkerRuntimeHooks,
    });

    expect(hooks).toEqual({});
    expect(createLocalPtyTaskBridge).not.toHaveBeenCalled();
    expect(createWorkerRuntimeHooks).not.toHaveBeenCalled();
  });

  it('creates a local pty bridge and runtime hooks for pty workers', () => {
    const localPtyTaskBridge = {
      onLocalInput: vi.fn(async () => {}),
    };
    const hooks = {
      onData: vi.fn(),
      onExit: vi.fn(),
      onLocalInput: vi.fn(),
    };
    const createLocalPtyTaskBridge = vi.fn(() => localPtyTaskBridge);
    const createWorkerRuntimeHooks = vi.fn(() => hooks);
    const queueWorkerStream = vi.fn();
    const getRuntimeExitHandler = vi.fn(() => null);

    const result = createWorkerRuntimeBridge({
      runtimeKind: 'pty',
      workerId: 'worker-1',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: true,
      handledTaskIds: new Set<string>(),
      isRuntimeProcessing: () => false,
      shouldAcceptInput: () => true,
      monitorForCompletion: async () => ({
        success: true,
        text: 'done',
        durationMs: 1,
      }),
      reportResult: async () => {},
      queueWorkerStream,
      getRuntimeExitHandler,
    }, {
      createLocalPtyTaskBridge,
      createWorkerRuntimeHooks,
    });

    expect(result).toBe(hooks);
    expect(createLocalPtyTaskBridge).toHaveBeenCalledOnce();
    expect(createLocalPtyTaskBridge).toHaveBeenCalledWith({
      workerId: 'worker-1',
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      forceTrust: true,
      handledTaskIds: expect.any(Set),
      isRuntimeProcessing: expect.any(Function),
      shouldAcceptInput: expect.any(Function),
      monitorForCompletion: expect.any(Function),
      reportResult: expect.any(Function),
    });
    expect(createWorkerRuntimeHooks).toHaveBeenCalledWith({
      runtimeKind: 'pty',
      queueWorkerStream,
      localPtyTaskBridge,
      getRuntimeExitHandler,
    });
  });
});
