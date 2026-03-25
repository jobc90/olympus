import { describe, expect, it } from 'vitest';
import { TerminalProjectionService } from '../terminal-projection-service.js';

describe('TerminalProjectionService', () => {
  it('projects snapshot text, input lock state, runtime kind, and task metadata into a payload', () => {
    const service = new TerminalProjectionService();

    const projection = service.project({
      worker: {
        id: 'worker-1',
        name: 'server',
        projectPath: '/workspace/server',
        runtimeKind: 'tmux',
        currentAuthorityTaskId: 'authority-task-1',
        currentTaskId: 'worker-task-1',
        currentTaskPrompt: 'fix the failing endpoint',
      },
      snapshot: {
        type: 'terminal_snapshot',
        snapshot: 'line 1\nline 2',
        lines: 2,
      },
      runtimeState: {
        type: 'state',
        input_locked: true,
        active_task_id: 'authority-task-1',
      },
      activeTask: {
        id: 'authority-task-1',
        displayLabel: 'server-api',
        title: 'Fix failing endpoint',
        status: 'in_progress',
        projectId: 'server',
        parentTaskId: null,
        assignedWorkerId: 'worker-1',
        priority: 3,
      },
      generatedAt: 1_234,
    });

    expect(projection).toMatchObject({
      workerId: 'worker-1',
      workerName: 'server',
      projectPath: '/workspace/server',
      runtimeKind: 'tmux',
      snapshotText: 'line 1\nline 2',
      inputLocked: true,
      activeTask: {
        taskId: 'authority-task-1',
        authorityTaskId: 'authority-task-1',
        displayLabel: 'server-api',
        title: 'Fix failing endpoint',
        status: 'in_progress',
        projectId: 'server',
        parentTaskId: null,
        assignedWorkerId: 'worker-1',
        priority: 3,
        prompt: 'fix the failing endpoint',
        source: 'authority',
      },
      payload: {
        type: 'terminal_projection_view',
        worker: {
          id: 'worker-1',
          name: 'server',
          projectPath: '/workspace/server',
          runtimeKind: 'tmux',
        },
        terminal: {
          snapshotText: 'line 1\nline 2',
          inputLocked: true,
        },
        generatedAt: 1_234,
      },
    });
  });

  it('falls back to worker/runtime data when authority task metadata is absent', () => {
    const service = new TerminalProjectionService();

    const projection = service.project({
      worker: {
        id: 'worker-2',
        name: 'web',
        projectPath: '/workspace/web',
        runtimeKind: 'pty',
        currentTaskId: 'worker-task-2',
        currentTaskPrompt: 'inspect logs',
      },
      runtimeState: {
        type: 'state',
        input_locked: false,
        active_task_id: 'runtime-task-9',
      },
    });

    expect(projection).toMatchObject({
      runtimeKind: 'pty',
      snapshotText: '',
      inputLocked: false,
      activeTask: {
        taskId: 'runtime-task-9',
        authorityTaskId: null,
        displayLabel: null,
        title: null,
        status: null,
        projectId: null,
        parentTaskId: null,
        assignedWorkerId: null,
        priority: null,
        prompt: 'inspect logs',
        source: 'runtime',
      },
      payload: {
        type: 'terminal_projection_view',
        terminal: {
          snapshotText: '',
          inputLocked: false,
        },
      },
    });
  });

  it('returns no active task when runtime data is absent', () => {
    const service = new TerminalProjectionService();

    const projection = service.project({
      worker: {
        id: 'worker-3',
        name: 'misc',
        projectPath: '/workspace/misc',
        runtimeKind: undefined,
      },
    });

    expect(projection).toMatchObject({
      runtimeKind: 'unknown',
      snapshotText: '',
      inputLocked: false,
      activeTask: null,
      payload: {
        type: 'terminal_projection_view',
        worker: {
          id: 'worker-3',
          name: 'misc',
          projectPath: '/workspace/misc',
          runtimeKind: 'unknown',
        },
        terminal: {
          snapshotText: '',
          inputLocked: false,
        },
        activeTask: null,
      },
    });
  });
});
