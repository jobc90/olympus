import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxWorkerRuntime } from '../tmux-worker-runtime.js';
import type {
  NativeTerminalLauncherLike,
  TmuxLayoutManagerLike,
  TmuxSessionAdapterLike,
  TmuxWorkerTarget,
  WorkerHostLike,
} from '../worker-host.js';
import { RuntimeSocketClient } from '../worker-host/runtime-socket.js';
import { createRuntimeControlRequest } from '@olympus-dev/protocol';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true });
  }));
});

function createRuntime(overrides: { socketsRoot?: string } = {}) {
  const target: TmuxWorkerTarget = {
    projectId: 'server',
    workerId: 'server-worker',
    sessionName: 'olympus_server',
    windowName: 'server-worker',
    paneId: '%21',
    mode: 'resident',
  };

  const layoutManager: TmuxLayoutManagerLike = {
    reserveTarget: vi.fn().mockResolvedValue(target),
    releaseTarget: vi.fn().mockResolvedValue(undefined),
  };

  const sessionAdapter: TmuxSessionAdapterLike = {
    startSession: vi.fn(),
    sendInput: vi.fn().mockResolvedValue(undefined),
    resetSession: vi.fn(),
    stopSession: vi.fn().mockResolvedValue(undefined),
    capturePane: vi.fn().mockResolvedValue('Welcome\n\n❯ \n'),
  };

  const launcher: NativeTerminalLauncherLike = {
    launch: vi.fn().mockResolvedValue({ platform: 'darwin', terminal: 'tmux-attach' }),
  };

  const runtime = new TmuxWorkerRuntime({
    projectPath: '/workspace/server',
    workerName: 'server-worker',
    trustMode: true,
    socketsRoot: overrides.socketsRoot,
    layoutManager,
    sessionAdapter,
    launcher,
  });

  return { runtime, target, layoutManager, sessionAdapter, launcher };
}

function createRuntimeWithHost() {
  const target: TmuxWorkerTarget = {
    projectId: 'server',
    workerId: 'server-worker',
    sessionName: 'olympus_server',
    windowName: 'server-worker',
    paneId: '%21',
    mode: 'resident',
  };

  const host: WorkerHostLike = {
    bootResidentSession: vi.fn().mockResolvedValue(target),
    assignInstruction: vi.fn().mockResolvedValue({ accepted: true }),
    sendLocalInput: vi.fn(),
    sendRemoteInput: vi.fn(),
    sendRuntimeInput: vi.fn(),
    resetSession: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    captureTerminalSnapshot: vi
      .fn()
      .mockResolvedValueOnce('Welcome\n\n❯ \n')
      .mockResolvedValue('captured snapshot'),
    getCurrentTarget: vi.fn(() => target),
  };

  const runtime = new TmuxWorkerRuntime({
    projectPath: '/workspace/server',
    workerName: 'server-worker',
    trustMode: true,
    host,
  });

  return { runtime, host, target };
}

describe('TmuxWorkerRuntime', () => {
  it('boots the resident tmux session through WorkerHost when provided', async () => {
    const { runtime, host, target } = createRuntimeWithHost();

    await runtime.start();

    expect(host.bootResidentSession).toHaveBeenCalledWith({
      projectPath: '/workspace/server',
      trustMode: true,
    });
    expect(runtime.getCurrentTarget()).toEqual(target);
  });

  it('starts a resident tmux worker and opens a terminal attachment', async () => {
    const { runtime, target, layoutManager, launcher } = createRuntime();

    await runtime.start();

    expect(layoutManager.reserveTarget).toHaveBeenCalledWith({
      projectId: 'server',
      workerId: 'server-worker',
      mode: 'resident',
      projectPath: '/workspace/server',
      command: ['claude', '--dangerously-skip-permissions'],
    });
    expect(launcher.launch).toHaveBeenCalledWith({
      projectId: 'server',
      workerId: 'server-worker',
      sessionName: 'olympus_server',
      paneId: '%21',
    });
    expect(runtime.getCurrentTarget()).toEqual(target);
  });

  it('waits for an interactive idle prompt before reporting start success', async () => {
    const { runtime, sessionAdapter } = createRuntime();
    vi.mocked(sessionAdapter.capturePane)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Loading...')
      .mockResolvedValueOnce('Ready\n\n❯ \n');

    await runtime.start();

    expect(sessionAdapter.capturePane).toHaveBeenCalledTimes(3);
  });

  it('auto-confirms the folder trust prompt in trust mode before declaring startup ready', async () => {
    const { runtime, sessionAdapter, target } = createRuntime();
    vi.mocked(sessionAdapter.capturePane)
      .mockResolvedValueOnce([
        'Quick safety check:',
        '❯ 1. Yes, I trust this folder',
        'Enter to confirm · Esc to cancel',
      ].join('\n'))
      .mockResolvedValueOnce('Welcome\n\n❯ \n');

    await runtime.start();

    expect(sessionAdapter.sendInput).toHaveBeenCalledWith({
      target,
      text: '',
      source: 'local',
      submit: true,
    });
    expect(sessionAdapter.capturePane).toHaveBeenCalledTimes(2);
  });

  it('forwards remote input and destroys the tmux target cleanly', async () => {
    const { runtime, target, layoutManager, sessionAdapter } = createRuntime();
    await runtime.start();

    runtime.sendInput('status');
    await runtime.destroy();

    expect(sessionAdapter.sendInput).toHaveBeenCalledWith({
      target,
      text: 'status',
      source: 'remote',
    });
    expect(sessionAdapter.stopSession).toHaveBeenCalledWith(target);
    expect(layoutManager.releaseTarget).toHaveBeenCalledWith(target);
  });

  it('cancels the active monitor and resets the session when soft-preempted over runtime control', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-worker-runtime-'));
    cleanupPaths.push(socketsRoot);
    const { runtime, target, sessionAdapter } = createRuntime({ socketsRoot });
    vi.mocked(sessionAdapter.capturePane)
      .mockResolvedValueOnce('Welcome\n\n❯ \n')
      .mockResolvedValue('Implement auth flow\n\nThinking...');

    await runtime.start();

    const runningTask = runtime.executeTaskWithTimeout('Implement auth flow');
    const runningTaskAssertion = expect(runningTask).rejects.toThrow('task preempted by runtime control');
    await Promise.resolve();

    const client = new RuntimeSocketClient(runtime.getRuntimeSocketPath()!);
    const response = await client.send(createRuntimeControlRequest({
      request_id: 'req-preempt',
      worker_id: 'server-worker',
      command: 'soft_preempt',
      payload: {
        task_id: 'authority-1',
        replacement_task_id: 'authority-2',
        reason: 'urgent fix',
      },
    }));

    await runningTaskAssertion;
    expect('result' in response && response.result.type).toBe('accepted');
    expect(sessionAdapter.resetSession).toHaveBeenCalledWith(target);
  });

  it('serves runtime-control commands over the worker socket', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-worker-runtime-'));
    cleanupPaths.push(socketsRoot);
    const { runtime, target, sessionAdapter } = createRuntime({ socketsRoot });
    vi.mocked(sessionAdapter.capturePane)
      .mockResolvedValueOnce('Welcome\n\n❯ \n')
      .mockResolvedValue('captured snapshot');

    await runtime.start();

    const client = new RuntimeSocketClient(runtime.getRuntimeSocketPath()!);
    const assignResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-assign',
      worker_id: 'server-worker',
      command: 'assign_instruction',
      payload: {
        task_id: 'task-1',
        project_id: 'server',
        title: 'Implement auth flow',
        instruction_version: 'v1',
        instruction_path: '/tmp/task/instruction.md',
        project_mirror_path: '/workspace/server/.olympus/tasks/task-1/instruction.md',
        launcher_prompt: 'Read and execute the instruction file.',
        verification: ['pnpm test'],
        worker_mode: 'resident',
      },
    }));
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
        reason: 'merging',
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
        lines: 120,
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
        reason: 'done',
      },
    }));

    await runtime.destroy();

    expect(assignResponse).toMatchObject({
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
        active_task_id: 'task-1',
      },
    });
    expect(stateResponse).toMatchObject({
      ok: true,
      result: {
        type: 'state',
        input_locked: true,
        active_task_id: 'task-1',
      },
    });
    expect(sendInputResponse).toMatchObject({
      ok: true,
      result: {
        type: 'accepted',
        accepted: true,
      },
    });
    expect(snapshotResponse).toMatchObject({
      ok: true,
      result: {
        type: 'terminal_snapshot',
        snapshot: 'captured snapshot',
        lines: 120,
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
        active_task_id: 'task-1',
      },
    });
    expect(sessionAdapter.startSession).toHaveBeenCalledWith({
      target,
      instructionPath: '/tmp/task/instruction.md',
      launcherPrompt: 'Read and execute the instruction file.',
    });
    expect(sessionAdapter.sendInput).toHaveBeenCalledWith({
      target,
      text: 'status',
      source: 'remote',
      submit: true,
    });
    expect(sessionAdapter.capturePane).toHaveBeenCalledWith({
      target,
      lines: 120,
    });
    expect(sessionAdapter.resetSession).toHaveBeenCalledWith(target);
  });

  it('routes runtime control commands through WorkerHost when provided', async () => {
    const socketsRoot = await mkdtemp(join('/tmp', 'owr-host-'));
    cleanupPaths.push(socketsRoot);
    const { runtime, host } = createRuntimeWithHost();
    const runtimeWithSocket = new TmuxWorkerRuntime({
      projectPath: '/workspace/server',
      workerName: 'server-worker',
      trustMode: true,
      socketsRoot,
      host,
    });

    await runtimeWithSocket.start();

    const client = new RuntimeSocketClient(runtimeWithSocket.getRuntimeSocketPath()!);
    const assignResponse = await client.send(createRuntimeControlRequest({
      request_id: 'req-assign',
      worker_id: 'server-worker',
      command: 'assign_instruction',
      payload: {
        task_id: 'task-1',
        project_id: 'server',
        title: 'Implement auth flow',
        instruction_version: 'v1',
        instruction_path: '/tmp/task/instruction.md',
        project_mirror_path: '/workspace/server/.olympus/tasks/task-1/instruction.md',
        launcher_prompt: 'Read and execute the instruction file.',
        verification: ['pnpm test'],
        worker_mode: 'resident',
      },
    }));
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
        lines: 120,
      },
    }));

    await runtimeWithSocket.destroy();

    expect(assignResponse).toMatchObject({ ok: true, result: { type: 'accepted', accepted: true } });
    expect(sendInputResponse).toMatchObject({ ok: true, result: { type: 'accepted', accepted: true } });
    expect(stateResponse).toMatchObject({
      ok: true,
      result: { type: 'state', input_locked: false, active_task_id: 'task-1' },
    });
    expect(snapshotResponse).toMatchObject({
      ok: true,
      result: { type: 'terminal_snapshot', snapshot: 'captured snapshot', lines: 120 },
    });
    expect(host.assignInstruction).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      instructionPath: '/tmp/task/instruction.md',
    }));
    expect(host.sendRuntimeInput).toHaveBeenCalledWith('status', true);
    expect(host.captureTerminalSnapshot).toHaveBeenCalledWith(120);
    expect(host.stop).toHaveBeenCalled();
  });
});
