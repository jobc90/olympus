import type {
  RegisteredWorker,
  RuntimeStateResult,
  RuntimeTerminalSnapshotResult,
  TaskAuthorityStatus,
  TaskAuthorityTask,
} from '@olympus-dev/protocol';

export interface TerminalProjectionTaskMetadata {
  taskId: string;
  authorityTaskId: string | null;
  displayLabel: string | null;
  title: string | null;
  status: TaskAuthorityStatus | null;
  projectId: string | null;
  parentTaskId: string | null;
  assignedWorkerId: string | null;
  priority: number | null;
  prompt: string | null;
  source: 'authority' | 'worker' | 'runtime';
}

export interface TerminalProjectionViewPayload {
  type: 'terminal_projection_view';
  worker: {
    id: string;
    name: string;
    projectPath: string;
    runtimeKind: RegisteredWorker['runtimeKind'] | 'unknown';
  };
  terminal: {
    snapshotText: string;
    inputLocked: boolean;
  };
  activeTask: TerminalProjectionTaskMetadata | null;
  generatedAt: number;
}

export interface TerminalProjectionViewModel {
  workerId: string;
  workerName: string;
  projectPath: string;
  runtimeKind: RegisteredWorker['runtimeKind'] | 'unknown';
  snapshotText: string;
  inputLocked: boolean;
  activeTask: TerminalProjectionTaskMetadata | null;
  payload: TerminalProjectionViewPayload;
}

export interface ProjectTerminalStateInput {
  worker: Pick<
    RegisteredWorker,
    'id' | 'name' | 'projectPath' | 'runtimeKind' | 'currentAuthorityTaskId' | 'currentTaskId' | 'currentTaskPrompt'
  >;
  snapshot?: RuntimeTerminalSnapshotResult | null;
  runtimeState?: RuntimeStateResult | null;
  activeTask?: Pick<
    TaskAuthorityTask,
    'id' | 'displayLabel' | 'title' | 'status' | 'projectId' | 'parentTaskId' | 'assignedWorkerId' | 'priority'
  > | null;
  generatedAt?: number;
}

function buildTaskMetadata(
  input: ProjectTerminalStateInput,
  snapshotText: string,
): TerminalProjectionTaskMetadata | null {
  const activeTaskId = input.activeTask?.id
    ?? input.runtimeState?.active_task_id
    ?? input.worker.currentAuthorityTaskId
    ?? input.worker.currentTaskId
    ?? null;

  if (!activeTaskId) {
    return null;
  }

  if (input.activeTask) {
    return {
      taskId: input.activeTask.id,
      authorityTaskId: input.worker.currentAuthorityTaskId ?? input.activeTask.id,
      displayLabel: input.activeTask.displayLabel,
      title: input.activeTask.title,
      status: input.activeTask.status,
      projectId: input.activeTask.projectId,
      parentTaskId: input.activeTask.parentTaskId,
      assignedWorkerId: input.activeTask.assignedWorkerId,
      priority: input.activeTask.priority,
      prompt: input.worker.currentTaskPrompt ?? null,
      source: 'authority',
    };
  }

  return {
    taskId: activeTaskId,
    authorityTaskId: input.worker.currentAuthorityTaskId ?? null,
    displayLabel: null,
    title: null,
    status: null,
    projectId: null,
    parentTaskId: null,
    assignedWorkerId: null,
    priority: null,
    prompt: input.worker.currentTaskPrompt ?? (snapshotText ? snapshotText : null),
    source: input.runtimeState?.active_task_id
      ? 'runtime'
      : 'worker',
  };
}

export class TerminalProjectionService {
  project(input: ProjectTerminalStateInput): TerminalProjectionViewModel {
    const snapshotText = input.snapshot?.snapshot ?? '';
    const inputLocked = input.runtimeState?.input_locked ?? false;
    const runtimeKind = input.worker.runtimeKind ?? 'unknown';
    const activeTask = buildTaskMetadata(input, snapshotText);
    const generatedAt = input.generatedAt ?? Date.now();

    return {
      workerId: input.worker.id,
      workerName: input.worker.name,
      projectPath: input.worker.projectPath,
      runtimeKind,
      snapshotText,
      inputLocked,
      activeTask,
      payload: {
        type: 'terminal_projection_view',
        worker: {
          id: input.worker.id,
          name: input.worker.name,
          projectPath: input.worker.projectPath,
          runtimeKind,
        },
        terminal: {
          snapshotText,
          inputLocked,
        },
        activeTask,
        generatedAt,
      },
    };
  }
}
