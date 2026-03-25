import { describe, expect, it, vi } from 'vitest';
import { PtySessionAdapter } from '../pty-session-adapter.js';

describe('PtySessionAdapter', () => {
  it('spawns a claude session with trust mode and synchronizes terminal size', async () => {
    const session = {
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    };
    const spawn = vi.fn(() => session);
    const adapter = new PtySessionAdapter({
      ensureSpawnHelperPermissions: vi.fn(),
      loadSpawn: vi.fn(async () => spawn),
      getTerminalSize: vi.fn(() => ({ cols: 180, rows: 48 })),
    });

    const handle = await adapter.startSession({
      projectPath: '/workspace/server',
      trustMode: true,
      cols: 120,
      rows: 40,
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    expect(spawn).toHaveBeenCalledWith('claude', ['--dangerously-skip-permissions'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: '/workspace/server',
      env: expect.any(Object),
    });
    expect(session.resize).toHaveBeenCalledWith(180, 48);
    expect(handle).toBe(session);
  });

  it('wires onData and onExit callbacks into the spawned session', async () => {
    let onDataHandler: ((data: string) => void) | undefined;
    let onExitHandler: ((event: { exitCode: number }) => void) | undefined;
    const session = {
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      onData: vi.fn((handler: (data: string) => void) => {
        onDataHandler = handler;
        return { dispose: vi.fn() };
      }),
      onExit: vi.fn((handler: (event: { exitCode: number }) => void) => {
        onExitHandler = handler;
        return { dispose: vi.fn() };
      }),
    };
    const onData = vi.fn();
    const onExit = vi.fn();
    const adapter = new PtySessionAdapter({
      ensureSpawnHelperPermissions: vi.fn(),
      loadSpawn: vi.fn(async () => vi.fn(() => session)),
      getTerminalSize: vi.fn(() => null),
    });

    await adapter.startSession({
      projectPath: '/workspace/server',
      trustMode: false,
      cols: 120,
      rows: 40,
      onData,
      onExit,
    });

    onDataHandler?.('hello');
    onExitHandler?.({ exitCode: 1 });

    expect(onData).toHaveBeenCalledWith('hello');
    expect(onExit).toHaveBeenCalledWith({ exitCode: 1 });
  });
});
