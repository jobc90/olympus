import { describe, expect, it, vi } from 'vitest';
import {
  WorkerHost,
  type NativeTerminalLauncherLike,
  type TmuxLayoutManagerLike,
  type TmuxSessionAdapterLike,
  type TmuxWorkerTarget,
  type WorkerArtifactEmitter,
  type WorkerHostOptions,
  type WorkerInstruction,
} from '../worker-host.js';
import { TmuxLayoutManager } from '../worker-host/tmux-layout-manager.js';

function createHost(overrides: Partial<WorkerHostOptions> = {}) {
  const target: TmuxWorkerTarget = {
    projectId: 'server',
    workerId: 'worker-1',
    sessionName: 'olympus_server',
    windowName: 'worker-1',
    paneId: '%1',
    mode: 'resident',
  };

  const sessionAdapter: TmuxSessionAdapterLike = {
    startSession: vi.fn(),
    sendInput: vi.fn(),
    resetSession: vi.fn(),
    stopSession: vi.fn(),
    capturePane: vi.fn().mockResolvedValue('captured'),
  };

  const layoutManager: TmuxLayoutManagerLike = {
    reserveTarget: vi.fn().mockResolvedValue(target),
    releaseTarget: vi.fn(),
  };

  const launcher: NativeTerminalLauncherLike = {
    launch: vi.fn().mockResolvedValue({ platform: 'darwin', terminal: 'tmux-attach' }),
  };

  const artifacts: WorkerArtifactEmitter = {
    emitStartAck: vi.fn(),
    emitFinalReport: vi.fn(),
  };

  const host = new WorkerHost({
    projectId: 'server',
    workerId: 'worker-1',
    instructionDirectory: '/tmp/olympus/tasks/task-1',
    layoutManager,
    sessionAdapter,
    launcher,
    artifacts,
    ...overrides,
  });

  return { host, target, sessionAdapter, layoutManager, launcher, artifacts };
}

describe('WorkerHost', () => {
  it('reserves a tmux target, starts the session there, and emits a start acknowledgement', async () => {
    const { host, target, layoutManager, launcher, sessionAdapter, artifacts } = createHost();
    const instruction: WorkerInstruction = {
      taskId: 'task-1',
      projectId: 'server',
      title: 'Implement auth flow',
      instructionVersion: 'v1',
      instructionPath: '/tmp/olympus/tasks/task-1/instruction.md',
      projectMirrorPath: '/workspace/server/.olympus/tasks/task-1/instruction.md',
      launcherPrompt: 'Read the instruction file and execute it.',
      verification: ['pnpm test'],
    };

    const result = await host.assignInstruction(instruction);

    expect(result.accepted).toBe(true);
    expect(layoutManager.reserveTarget).toHaveBeenCalledWith({
      projectId: 'server',
      workerId: 'worker-1',
      mode: 'resident',
    });
    expect(launcher.launch).toHaveBeenCalledWith({
      projectId: 'server',
      workerId: 'worker-1',
      sessionName: 'olympus_server',
      paneId: '%1',
    });
    expect(sessionAdapter.startSession).toHaveBeenCalledWith({
      target,
      instructionPath: instruction.instructionPath,
      launcherPrompt: instruction.launcherPrompt,
    });
    expect(artifacts.emitStartAck).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-1',
        project_id: 'server',
        worker_id: 'worker-1',
        instruction_version: 'v1',
        accepted: true,
        understood_goal: 'Implement auth flow',
        verification_scope: ['pnpm test'],
        execution_plan_summary: [
          'Execute instruction at /tmp/olympus/tasks/task-1/instruction.md via tmux olympus_server %1',
        ],
      }),
    );
    expect(host.getCurrentInstruction()?.taskId).toBe('task-1');
    expect(host.getCurrentTarget()).toEqual(target);
  });

  it('routes local and remote input through tmux and captures pane output', async () => {
    const { host, target, sessionAdapter } = createHost();
    await host.assignInstruction({
      taskId: 'task-1',
      projectId: 'server',
      title: 'Implement auth flow',
      instructionVersion: 'v1',
      instructionPath: '/tmp/olympus/tasks/task-1/instruction.md',
      projectMirrorPath: '/workspace/server/.olympus/tasks/task-1/instruction.md',
      launcherPrompt: 'Read the instruction file and execute it.',
      verification: [],
    });

    host.sendLocalInput('status');
    host.sendRemoteInput('continue');
    host.sendRuntimeInput('resume', true);
    const snapshot = await host.captureTerminalSnapshot(120);

    expect(sessionAdapter.sendInput).toHaveBeenNthCalledWith(1, {
      target,
      text: 'status',
      source: 'local',
    });
    expect(sessionAdapter.sendInput).toHaveBeenNthCalledWith(2, {
      target,
      text: 'continue',
      source: 'remote',
    });
    expect(sessionAdapter.sendInput).toHaveBeenNthCalledWith(3, {
      target,
      text: 'resume',
      source: 'remote',
      submit: true,
    });
    expect(sessionAdapter.capturePane).toHaveBeenCalledWith({
      target,
      lines: 120,
    });
    expect(snapshot).toBe('captured');
  });

  it('records final reports and releases the tmux target on stop', async () => {
    const { host, target, layoutManager, artifacts } = createHost();
    await host.assignInstruction({
      taskId: 'task-1',
      projectId: 'server',
      title: 'Implement auth flow',
      instructionVersion: 'v1',
      instructionPath: '/tmp/olympus/tasks/task-1/instruction.md',
      projectMirrorPath: '/workspace/server/.olympus/tasks/task-1/instruction.md',
      launcherPrompt: 'Read the instruction file and execute it.',
      verification: [],
    });

    await host.recordFinalReport({
      task_id: 'task-1',
      project_id: 'server',
      worker_id: 'worker-1',
      status: 'completed',
      summary: 'done',
      files_changed: ['src/index.ts'],
      commands_executed: ['pnpm test'],
      verification_results: [],
      blocked_points: [],
      autonomous_decisions: [],
      risks_remaining: [],
      artifacts: [],
      timestamp: new Date().toISOString(),
    });

    await host.stop();

    expect(artifacts.emitFinalReport).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-1',
        status: 'completed',
        files_changed: ['src/index.ts'],
      }),
    );
    expect(layoutManager.releaseTarget).toHaveBeenCalledWith(target);
    expect(host.getFinalReport()?.status).toBe('completed');
    expect(host.getCurrentTarget()).toBeNull();
  });
});

describe('TmuxLayoutManager', () => {
  it('builds deterministic tmux worker targets', () => {
    const manager = new TmuxLayoutManager();
    const target = manager.buildTarget({
      projectId: 'server',
      workerId: 'worker-ephemeral-2',
      mode: 'ephemeral',
    });

    expect(target).toEqual({
      projectId: 'server',
      workerId: 'worker-ephemeral-2',
      sessionName: 'olympus_server',
      windowName: 'worker-ephemeral-2',
      paneId: '',
      mode: 'ephemeral',
    });
  });
});
