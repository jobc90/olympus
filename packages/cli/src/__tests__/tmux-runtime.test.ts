import { describe, expect, it, vi } from 'vitest';
import { NativeTerminalLauncher } from '../worker-host/native-terminal-launcher.js';
import { TmuxLayoutManager } from '../worker-host/tmux-layout-manager.js';
import { TmuxSessionAdapter } from '../worker-host/tmux-session-adapter.js';

describe('TmuxLayoutManager', () => {
  it('creates a detached session for the first worker and returns its pane target', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('no session'))
      .mockResolvedValueOnce('%11');
    const manager = new TmuxLayoutManager(run);

    const target = await manager.reserveTarget({
      projectId: 'server',
      workerId: 'worker-1',
      mode: 'resident',
      projectPath: '/workspace/server',
      command: ['claude', '--dangerously-skip-permissions'],
    });

    expect(run).toHaveBeenNthCalledWith(1, 'tmux', ['has-session', '-t', 'olympus_server']);
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', [
      'new-session',
      '-d',
      '-s',
      'olympus_server',
      '-n',
      'worker-1',
      '-c',
      '/workspace/server',
      '-P',
      '-F',
      '#{pane_id}',
      'claude',
      '--dangerously-skip-permissions',
    ]);
    expect(target).toEqual({
      projectId: 'server',
      workerId: 'worker-1',
      sessionName: 'olympus_server',
      windowName: 'worker-1',
      paneId: '%11',
      mode: 'resident',
    });
  });

  it('creates a detached window for an additional worker when the session already exists', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('%22');
    const manager = new TmuxLayoutManager(run);

    const target = await manager.reserveTarget({
      projectId: 'server',
      workerId: 'worker-2',
      mode: 'ephemeral',
      projectPath: '/workspace/server-worktree',
      command: ['claude'],
    });

    expect(run).toHaveBeenNthCalledWith(2, 'tmux', [
      'new-window',
      '-d',
      '-t',
      'olympus_server',
      '-n',
      'worker-2',
      '-c',
      '/workspace/server-worktree',
      '-P',
      '-F',
      '#{pane_id}',
      'claude',
    ]);
    expect(target.paneId).toBe('%22');
    expect(target.mode).toBe('ephemeral');
  });

  it('falls back to creating a new window when session creation races with another worker', async () => {
    const duplicateSessionError = new Error('duplicate session: olympus_server');
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('no session'))
      .mockRejectedValueOnce(duplicateSessionError)
      .mockResolvedValueOnce('%33');
    const manager = new TmuxLayoutManager(run);

    const target = await manager.reserveTarget({
      projectId: 'server',
      workerId: 'worker-2',
      mode: 'resident',
      projectPath: '/workspace/server',
      command: ['claude'],
    });

    expect(run).toHaveBeenNthCalledWith(1, 'tmux', ['has-session', '-t', 'olympus_server']);
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', [
      'new-session',
      '-d',
      '-s',
      'olympus_server',
      '-n',
      'worker-2',
      '-c',
      '/workspace/server',
      '-P',
      '-F',
      '#{pane_id}',
      'claude',
    ]);
    expect(run).toHaveBeenNthCalledWith(3, 'tmux', [
      'new-window',
      '-d',
      '-t',
      'olympus_server',
      '-n',
      'worker-2',
      '-c',
      '/workspace/server',
      '-P',
      '-F',
      '#{pane_id}',
      'claude',
    ]);
    expect(target.paneId).toBe('%33');
  });

  it('kills the reserved window when releasing a target', async () => {
    const run = vi.fn().mockResolvedValue('');
    const manager = new TmuxLayoutManager(run);

    await manager.releaseTarget({
      projectId: 'server',
      workerId: 'worker-2',
      sessionName: 'olympus_server',
      windowName: 'worker-2',
      paneId: '%22',
      mode: 'ephemeral',
    });

    expect(run).toHaveBeenCalledWith('tmux', [
      'kill-window',
      '-t',
      'olympus_server:worker-2',
    ]);
  });
});

describe('TmuxSessionAdapter', () => {
  it('sends the launcher prompt and instruction path to the target pane', async () => {
    const run = vi.fn().mockResolvedValue('');
    const adapter = new TmuxSessionAdapter(run);

    await adapter.startSession({
      target: {
        projectId: 'server',
        workerId: 'worker-1',
        sessionName: 'olympus_server',
        windowName: 'worker-1',
        paneId: '%11',
        mode: 'resident',
      },
      instructionPath: '/tmp/task/instruction.md',
      launcherPrompt: 'Read the instruction file and execute it.',
    });

    expect(run).toHaveBeenNthCalledWith(1, 'tmux', [
      'send-keys',
      '-t',
      '%11',
      '-l',
      'Read the instruction file and execute it.\n/tmp/task/instruction.md',
    ]);
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', [
      'send-keys',
      '-t',
      '%11',
      'Enter',
    ]);
  });

  it('sends input, resets with C-c, and captures pane output', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('captured output');
    const adapter = new TmuxSessionAdapter(run);
    const target = {
      projectId: 'server',
      workerId: 'worker-1',
      sessionName: 'olympus_server',
      windowName: 'worker-1',
      paneId: '%11',
      mode: 'resident' as const,
    };

    await adapter.sendInput({
      target,
      text: 'continue',
      source: 'remote',
    });
    await adapter.resetSession(target);
    const output = await adapter.capturePane({
      target,
      lines: 120,
    });

    expect(run).toHaveBeenNthCalledWith(1, 'tmux', [
      'send-keys',
      '-t',
      '%11',
      '-l',
      'continue',
    ]);
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', [
      'send-keys',
      '-t',
      '%11',
      'C-c',
    ]);
    expect(run).toHaveBeenNthCalledWith(3, 'tmux', [
      'capture-pane',
      '-p',
      '-t',
      '%11',
      '-S',
      '-120',
    ]);
    expect(output).toBe('captured output');
  });

  it('submits Enter when sendInput requests submission', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    const adapter = new TmuxSessionAdapter(run);
    const target = {
      projectId: 'server',
      workerId: 'worker-1',
      sessionName: 'olympus_server',
      windowName: 'worker-1',
      paneId: '%11',
      mode: 'resident' as const,
    };

    await adapter.sendInput({
      target,
      text: 'Implement auth flow',
      source: 'remote',
      submit: true,
    });

    expect(run).toHaveBeenNthCalledWith(1, 'tmux', [
      'send-keys',
      '-t',
      '%11',
      '-l',
      'Implement auth flow',
    ]);
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', [
      'send-keys',
      '-t',
      '%11',
      'Enter',
    ]);
  });
});

describe('NativeTerminalLauncher', () => {
  it('uses osascript to attach Terminal.app to the tmux session on macOS', async () => {
    const run = vi.fn().mockResolvedValue('');
    const launcher = new NativeTerminalLauncher(run);

    const result = await launcher.launch({
      projectId: 'server',
      workerId: 'worker-1',
      sessionName: 'olympus_server',
      paneId: '%11',
    });

    expect(run).toHaveBeenCalledWith('osascript', [
      '-e',
      `tell application "Terminal" to do script "tmux attach-session -t '=olympus_server'"`,
      '-e',
      'tell application "Terminal" to activate',
    ]);
    expect(result).toEqual({
      platform: 'darwin',
      terminal: 'tmux-attach',
    });
  });
});
