import { randomUUID } from 'node:crypto';
import { supportsWorkerRuntimeControl, type TaskAuthorityTask, type WorkerTaskRecord } from '@olympus-dev/protocol';
import type { TaskAuthorityStore } from '@olympus-dev/core';
import type { ProjectScheduler } from './project-scheduler.js';
import type { WorkerRegistry } from '../worker-registry.js';

export interface ProjectRuntimeWorktreePort {
  provisionEphemeralWorkspace(input: {
    projectPath: string;
    sessionId: string;
    taskId: string;
  }): Promise<{ wiId: string; branch: string; path: string }>;
  mergeEphemeralWorkspace(input: {
    projectPath: string;
    sessionId: string;
    taskId: string;
    commitMessage: string;
  }): Promise<{ success: boolean; conflictFiles?: string[] }>;
  cleanupSession(projectPath: string, sessionId: string): Promise<void>;
}

export interface DispatchProjectTaskInput {
  projectId: string;
  prompt: string;
  projectPath?: string;
  displayLabel?: string;
  title?: string;
  priority?: number;
  metadata?: Record<string, unknown> | null;
  chatId?: number;
  source?: string;
  provider?: string;
  dangerouslySkipPermissions?: boolean;
  preferredWorkerId?: string | null;
  requiredRoleTags?: string[];
  requiredSkills?: string[];
  preemptRunningWorker?: boolean;
  allowEphemeralWorkspace?: boolean;
}

export interface DispatchProjectTaskResult {
  disposition: 'assigned' | 'queued' | 'preempted';
  task: TaskAuthorityTask;
  worker: ReturnType<WorkerRegistry['getAll']>[number] | null;
  workerTask: WorkerTaskRecord | null;
  ephemeralWorkspace: { wiId: string; branch: string; path: string } | null;
}

export interface FinalizeWorkerTaskInput {
  workerTaskId: string;
  success: boolean;
}

export interface FinalizeWorkerTaskResult {
  workerTask: WorkerTaskRecord | null;
  authorityTaskId: string | null;
  transitionedTo: 'completed' | 'failed' | null;
  task: TaskAuthorityTask | null;
}

export interface ResumeBlockedTaskInput {
  taskId: string;
  projectId?: string;
  projectPath?: string;
  chatId?: number;
  source?: string;
  provider?: string;
  dangerouslySkipPermissions?: boolean;
  preferredWorkerId?: string | null;
  requiredRoleTags?: string[];
  requiredSkills?: string[];
}

export interface CancelProjectTaskInput {
  taskId: string;
  projectId: string;
  reason?: string;
}

export interface CancelProjectTaskResult {
  task: TaskAuthorityTask;
  worker: ReturnType<WorkerRegistry['getAll']>[number] | null;
  workerTask: WorkerTaskRecord | null;
  runtimeResetRequested: boolean;
}

export interface DispatchNextQueuedTaskInput {
  projectId: string;
  workerId?: string;
}

const DISPATCH_METADATA_KEY = '__projectRuntimeDispatch';

interface StoredDispatchMetadata {
  prompt: string;
  projectPath?: string;
  chatId?: number;
  source?: string;
  provider?: string;
  dangerouslySkipPermissions?: boolean;
  allowEphemeralWorkspace?: boolean;
}

function buildStoredDispatchMetadata(input: DispatchProjectTaskInput): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    [DISPATCH_METADATA_KEY]: {
      prompt: input.prompt,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      ...(input.chatId !== undefined ? { chatId: input.chatId } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.dangerouslySkipPermissions !== undefined
        ? { dangerouslySkipPermissions: input.dangerouslySkipPermissions }
        : {}),
      ...(input.allowEphemeralWorkspace !== undefined
        ? { allowEphemeralWorkspace: input.allowEphemeralWorkspace }
        : {}),
    } satisfies StoredDispatchMetadata,
  };
}

function readStoredDispatchMetadata(task: TaskAuthorityTask): StoredDispatchMetadata | null {
  const metadata = task.metadata?.[DISPATCH_METADATA_KEY];
  if (!metadata || typeof metadata !== 'object') return null;

  const candidate = metadata as Record<string, unknown>;
  if (typeof candidate.prompt !== 'string' || candidate.prompt.length === 0) {
    return null;
  }

  return {
    prompt: candidate.prompt,
    ...(typeof candidate.projectPath === 'string' ? { projectPath: candidate.projectPath } : {}),
    ...(typeof candidate.chatId === 'number' ? { chatId: candidate.chatId } : {}),
    ...(typeof candidate.source === 'string' ? { source: candidate.source } : {}),
    ...(typeof candidate.provider === 'string' ? { provider: candidate.provider } : {}),
    ...(typeof candidate.dangerouslySkipPermissions === 'boolean'
      ? { dangerouslySkipPermissions: candidate.dangerouslySkipPermissions }
      : {}),
    ...(typeof candidate.allowEphemeralWorkspace === 'boolean'
      ? { allowEphemeralWorkspace: candidate.allowEphemeralWorkspace }
      : {}),
  };
}

export interface ProjectRuntimeAdapterOptions {
  taskAuthorityStore: Pick<
    TaskAuthorityStore,
    'createTask' | 'transitionTask' | 'enqueueTask' | 'claimNextQueuedTask' | 'softPreemptTask' | 'getTask'
  >;
  workerRegistry: Pick<
    WorkerRegistry,
    'createTask' | 'getTask' | 'getAll' | 'findTaskByAuthorityTaskId' | 'cancelTask'
  >;
  scheduler: Pick<ProjectScheduler, 'selectWorker'>;
  runtimeControl?: {
    softPreempt(
      worker: ReturnType<WorkerRegistry['getAll']>[number],
      taskId: string,
      replacementTaskId?: string,
      reason?: string,
    ): Promise<unknown>;
    resetSession(
      worker: ReturnType<WorkerRegistry['getAll']>[number],
      reason?: string,
    ): Promise<unknown>;
  };
  worktreeManager?: ProjectRuntimeWorktreePort;
  onWorkerEvent?: (eventType: string, payload: unknown) => void;
}

export class ProjectRuntimeAdapter {
  constructor(private readonly options: ProjectRuntimeAdapterOptions) {}

  async dispatchTask(input: DispatchProjectTaskInput): Promise<DispatchProjectTaskResult> {
    const task = this.options.taskAuthorityStore.createTask({
      displayLabel: input.displayLabel ?? `${input.projectId}-${Date.now()}`,
      title: input.title ?? input.prompt.slice(0, 120),
      kind: 'project',
      projectId: input.projectId,
      priority: input.priority ?? 0,
      metadata: buildStoredDispatchMetadata(input),
    });

    this.options.taskAuthorityStore.transitionTask(task.id, 'ready');
    this.options.taskAuthorityStore.enqueueTask(task.id);

    const selected = this.options.scheduler.selectWorker({
      projectId: input.projectId,
      preferredWorkerId: input.preferredWorkerId ?? undefined,
      requiredRoleTags: input.requiredRoleTags,
      requiredSkills: input.requiredSkills,
    });

    const worker = selected?.worker ?? null;
    const preemptedAuthorityTaskId = worker?.currentAuthorityTaskId ?? null;
    let disposition: DispatchProjectTaskResult['disposition'] = 'assigned';
    if (!worker) {
      return {
        disposition: 'queued',
        task: this.options.taskAuthorityStore.getTask(task.id)!,
        worker: null,
        workerTask: null,
        ephemeralWorkspace: null,
      };
    }

    if (worker.status === 'busy') {
      if (!input.preemptRunningWorker || !worker.currentAuthorityTaskId) {
        return {
          disposition: 'queued',
          task: this.options.taskAuthorityStore.getTask(task.id)!,
          worker: null,
          workerTask: null,
          ephemeralWorkspace: null,
        };
      }

      this.options.taskAuthorityStore.softPreemptTask({
        projectId: input.projectId,
        activeTaskId: worker.currentAuthorityTaskId,
        replacementTaskId: task.id,
        actor: 'project-runtime-adapter',
        reason: 'project-level urgent dispatch',
        assignedWorkerId: worker.id,
      });
      disposition = 'preempted';
    } else {
      this.options.taskAuthorityStore.claimNextQueuedTask(input.projectId, worker.id);
    }

    this.options.taskAuthorityStore.transitionTask(task.id, 'in_progress', {
      assignedWorkerId: worker.id,
    });

    const ephemeralWorkspace = input.allowEphemeralWorkspace && input.projectPath && this.options.worktreeManager
      ? await this.options.worktreeManager.provisionEphemeralWorkspace({
          projectPath: input.projectPath,
          sessionId: this.buildSessionId(input.projectId, worker.id),
          taskId: task.id,
        })
      : null;

    const workerTask = this.options.workerRegistry.createTask(
      worker.id,
      input.prompt,
      input.chatId,
      task.id,
    );

    if (disposition === 'preempted' && preemptedAuthorityTaskId && this.options.runtimeControl) {
      await this.options.runtimeControl.softPreempt(
        worker,
        preemptedAuthorityTaskId,
        task.id,
        'project-level urgent dispatch',
      ).catch(() => {
        // Best-effort runtime hint — authority state remains the source of truth.
      });
    }

    this.options.onWorkerEvent?.('worker:task:assigned', {
      taskId: workerTask.taskId,
      authorityTaskId: task.id,
      workerId: worker.id,
      workerName: worker.name,
      prompt: input.prompt,
      provider: input.provider ?? 'claude',
      dangerouslySkipPermissions: input.dangerouslySkipPermissions ?? true,
      projectPath: ephemeralWorkspace?.path ?? input.projectPath ?? worker.projectPath,
      source: input.source,
      chatId: input.chatId,
      runtimeKind: worker.runtimeKind,
      ...(ephemeralWorkspace ? { ephemeralWorkspace } : {}),
    });

    return {
      disposition,
      task: this.options.taskAuthorityStore.getTask(task.id)!,
      worker,
      workerTask,
      ephemeralWorkspace,
    };
  }

  finalizeWorkerTask(input: FinalizeWorkerTaskInput): FinalizeWorkerTaskResult {
    const workerTask = this.options.workerRegistry.getTask(input.workerTaskId);
    if (!workerTask?.authorityTaskId) {
      return {
        workerTask: workerTask ?? null,
        authorityTaskId: null,
        transitionedTo: null,
        task: null,
      };
    }

    const authorityTask = this.options.taskAuthorityStore.getTask(workerTask.authorityTaskId);
    if (!authorityTask) {
      return {
        workerTask,
        authorityTaskId: workerTask.authorityTaskId,
        transitionedTo: null,
        task: null,
      };
    }

    if (authorityTask.status !== 'in_progress' && authorityTask.status !== 'assigned') {
      return {
        workerTask,
        authorityTaskId: authorityTask.id,
        transitionedTo: null,
        task: authorityTask,
      };
    }

    const transitionedTo = input.success ? 'completed' : 'failed';
    const task = this.options.taskAuthorityStore.transitionTask(authorityTask.id, transitionedTo);

    return {
      workerTask,
      authorityTaskId: task.id,
      transitionedTo,
      task,
    };
  }

  async dispatchNextQueuedTask(
    input: DispatchNextQueuedTaskInput,
  ): Promise<DispatchProjectTaskResult | null> {
    const worker = input.workerId
      ? this.options.workerRegistry.getAll().find((candidate) => candidate.id === input.workerId) ?? null
      : this.options.scheduler.selectWorker({ projectId: input.projectId })?.worker ?? null;
    if (!worker || worker.status !== 'idle') {
      return null;
    }

    const claimed = this.options.taskAuthorityStore.claimNextQueuedTask(input.projectId, worker.id);
    if (!claimed) {
      return null;
    }

    const task = this.options.taskAuthorityStore.getTask(claimed.taskId);
    if (!task) {
      return null;
    }

    if (task.status === 'in_progress') {
      return null;
    }

    const dispatchMetadata = readStoredDispatchMetadata(task);
    if (!dispatchMetadata) {
      if (task.status === 'assigned') {
        this.options.taskAuthorityStore.transitionTask(task.id, 'failed', {
          assignedWorkerId: worker.id,
        });
      }
      return null;
    }

    if (task.status !== 'assigned') {
      return null;
    }

    const inProgressTask = this.options.taskAuthorityStore.transitionTask(task.id, 'in_progress', {
      assignedWorkerId: worker.id,
    });

    const ephemeralWorkspace =
      dispatchMetadata.allowEphemeralWorkspace && dispatchMetadata.projectPath && this.options.worktreeManager
        ? await this.options.worktreeManager.provisionEphemeralWorkspace({
            projectPath: dispatchMetadata.projectPath,
            sessionId: this.buildSessionId(input.projectId, worker.id),
            taskId: inProgressTask.id,
          })
        : null;

    const workerTask = this.options.workerRegistry.createTask(
      worker.id,
      dispatchMetadata.prompt,
      dispatchMetadata.chatId,
      inProgressTask.id,
    );

    this.options.onWorkerEvent?.('worker:task:assigned', {
      taskId: workerTask.taskId,
      authorityTaskId: inProgressTask.id,
      workerId: worker.id,
      workerName: worker.name,
      prompt: dispatchMetadata.prompt,
      provider: dispatchMetadata.provider ?? 'claude',
      dangerouslySkipPermissions: dispatchMetadata.dangerouslySkipPermissions ?? true,
      projectPath: ephemeralWorkspace?.path ?? dispatchMetadata.projectPath ?? worker.projectPath,
      source: dispatchMetadata.source,
      chatId: dispatchMetadata.chatId,
      runtimeKind: worker.runtimeKind,
      ...(ephemeralWorkspace ? { ephemeralWorkspace } : {}),
    });

    return {
      disposition: 'assigned',
      task: inProgressTask,
      worker,
      workerTask,
      ephemeralWorkspace,
    };
  }

  async resumeBlockedTask(input: ResumeBlockedTaskInput): Promise<DispatchProjectTaskResult> {
    const task = this.options.taskAuthorityStore.getTask(input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    const projectId = input.projectId ?? task.projectId;
    if (!projectId) {
      throw new Error(`Task ${input.taskId} is missing project ownership`);
    }
    if (task.projectId !== projectId) {
      throw new Error(`Task ${input.taskId} does not belong to project ${projectId}`);
    }
    if (task.status !== 'blocked') {
      throw new Error(`Task ${input.taskId} is not blocked`);
    }

    const previousWorkerTask = this.options.workerRegistry.findTaskByAuthorityTaskId(task.id);
    if (!previousWorkerTask) {
      throw new Error(`No worker task history found for blocked task ${task.id}`);
    }

    const selected = this.options.scheduler.selectWorker({
      projectId,
      preferredWorkerId: input.preferredWorkerId ?? undefined,
      requiredRoleTags: input.requiredRoleTags,
      requiredSkills: input.requiredSkills,
    });
    const worker = selected?.worker ?? null;
    if (!worker) {
      return {
        disposition: 'queued',
        task: this.options.taskAuthorityStore.getTask(task.id)!,
        worker: null,
        workerTask: null,
        ephemeralWorkspace: null,
      };
    }

    this.options.taskAuthorityStore.transitionTask(task.id, 'assigned', {
      assignedWorkerId: worker.id,
    });
    const resumedTask = this.options.taskAuthorityStore.transitionTask(task.id, 'in_progress', {
      assignedWorkerId: worker.id,
    });

    const workerTask = this.options.workerRegistry.createTask(
      worker.id,
      previousWorkerTask.prompt,
      input.chatId,
      resumedTask.id,
    );

    this.options.onWorkerEvent?.('worker:task:assigned', {
      taskId: workerTask.taskId,
      authorityTaskId: resumedTask.id,
      workerId: worker.id,
      workerName: worker.name,
      prompt: previousWorkerTask.prompt,
      provider: input.provider ?? 'claude',
      dangerouslySkipPermissions: input.dangerouslySkipPermissions ?? true,
      projectPath: input.projectPath ?? worker.projectPath,
      source: input.source ?? 'resume',
      chatId: input.chatId,
      runtimeKind: worker.runtimeKind,
    });

    return {
      disposition: 'assigned',
      task: resumedTask,
      worker,
      workerTask,
      ephemeralWorkspace: null,
    };
  }

  async cancelTask(input: CancelProjectTaskInput): Promise<CancelProjectTaskResult> {
    const task = this.options.taskAuthorityStore.getTask(input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    if (task.projectId !== input.projectId) {
      throw new Error(`Task ${input.taskId} does not belong to project ${input.projectId}`);
    }
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(`Task ${input.taskId} is already terminal`);
    }

    const workerTask = this.options.workerRegistry.findTaskByAuthorityTaskId(task.id);
    const worker = task.assignedWorkerId
      ? this.options.workerRegistry.getAll().find((candidate) => candidate.id === task.assignedWorkerId) ?? null
      : (workerTask
          ? this.options.workerRegistry.getAll().find((candidate) => candidate.id === workerTask.workerId) ?? null
          : null);

    const shouldResetRuntime = Boolean(
      worker &&
      supportsWorkerRuntimeControl(worker) &&
      worker.currentAuthorityTaskId === task.id &&
      this.options.runtimeControl,
    );
    const cancelledTask = this.options.taskAuthorityStore.transitionTask(task.id, 'cancelled', {
      assignedWorkerId: task.assignedWorkerId,
    });

    const cancelledWorkerTask = workerTask ? this.options.workerRegistry.cancelTask(workerTask.taskId) : null;

    if (shouldResetRuntime) {
      this.options.runtimeControl!.resetSession(
        worker!,
        input.reason ?? 'authority task cancelled',
      ).catch(() => {
        // Best-effort runtime hint — authority state remains the source of truth.
      });
    }

    this.options.onWorkerEvent?.('worker:task:cancelled', {
      taskId: cancelledWorkerTask?.taskId ?? null,
      authorityTaskId: cancelledTask.id,
      workerId: worker?.id ?? null,
      workerName: worker?.name ?? null,
      summary: input.reason ?? 'Task cancelled',
      status: 'cancelled',
    });

    return {
      task: cancelledTask,
      worker,
      workerTask: cancelledWorkerTask,
      runtimeResetRequested: shouldResetRuntime,
    };
  }

  private buildSessionId(projectId: string, workerId: string): string {
    return `${projectId}-${workerId}-${randomUUID().slice(0, 8)}`;
  }
}
