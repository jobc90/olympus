import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskAuthorityStore } from '@olympus-dev/core';
import { WorkerRegistry } from '../worker-registry.js';
import { ProjectScheduler } from '../project-runtime/project-scheduler.js';
import {
  ProjectRuntimeAdapter,
  type ProjectRuntimeWorktreePort,
} from '../project-runtime/project-runtime-adapter.js';

describe('ProjectRuntimeAdapter', () => {
  let tempDir: string;
  let store: TaskAuthorityStore;
  let registry: WorkerRegistry;
  let scheduler: ProjectScheduler;
  let runtimeEvents: Array<{ eventType: string; payload: unknown }>;
  let runtimeControl: {
    softPreempt: ReturnType<typeof vi.fn>;
    resetSession: ReturnType<typeof vi.fn>;
  };
  let worktreeManager: ProjectRuntimeWorktreePort;
  let adapter: ProjectRuntimeAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'project-runtime-adapter-'));
    store = TaskAuthorityStore.create(join(tempDir, 'task-authority.db'));
    registry = new WorkerRegistry();
    scheduler = new ProjectScheduler(registry);
    runtimeEvents = [];
    runtimeControl = {
      softPreempt: vi.fn(async () => ({ accepted: true })),
      resetSession: vi.fn(async () => ({ accepted: true })),
    };
    worktreeManager = {
      provisionEphemeralWorkspace: vi.fn(async () => ({
        wiId: 'task-ephemeral',
        branch: 'team/session/task-ephemeral',
        path: '/tmp/worktree/task-ephemeral',
      })),
      mergeEphemeralWorkspace: vi.fn(async () => ({ success: true })),
      cleanupSession: vi.fn(async () => {}),
    };

    adapter = new ProjectRuntimeAdapter({
      taskAuthorityStore: store,
      workerRegistry: registry,
      scheduler,
      runtimeControl,
      worktreeManager,
      onWorkerEvent: (eventType, payload) => {
        runtimeEvents.push({ eventType, payload });
      },
    });
  });

  afterEach(() => {
    store.close();
    registry.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates and dispatches a project task through the selected worker', async () => {
    const worker = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const dispatched = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement login API',
      projectPath: '/workspace/server',
      displayLabel: 'server-login-001',
      title: 'Implement login API',
    });

    expect(dispatched.task.status).toBe('in_progress');
    expect(dispatched.worker?.id).toBe(worker.id);
    expect(dispatched.workerTask?.authorityTaskId).toBe(dispatched.task.id);
    expect(runtimeEvents).toHaveLength(1);
    expect(runtimeEvents[0]?.eventType).toBe('worker:task:assigned');
  });

  it('keeps a task queued when no project worker is available', async () => {
    const dispatched = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement login API',
      displayLabel: 'server-login-queued',
      title: 'Queued login API',
    });

    expect(dispatched.disposition).toBe('queued');
    expect(dispatched.worker).toBeNull();
    expect(dispatched.task.status).toBe('ready');
    expect(runtimeEvents).toHaveLength(0);
  });

  it('soft-preempts the active project task when requested', async () => {
    const worker = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const first = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement initial API',
      projectPath: '/workspace/server',
      displayLabel: 'server-initial',
      title: 'Initial API',
    });

    const urgent = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Fix production outage',
      projectPath: '/workspace/server',
      displayLabel: 'server-urgent',
      title: 'Urgent outage fix',
      preemptRunningWorker: true,
      preferredWorkerId: worker.id,
    });

    expect(store.getTask(first.task.id)?.status).toBe('blocked');
    expect(urgent.disposition).toBe('preempted');
    expect(store.getTask(urgent.task.id)?.status).toBe('in_progress');
    expect(store.listPreemptionEvents('server')).toHaveLength(1);
    expect(runtimeControl.softPreempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: worker.id, name: worker.name }),
      first.task.id,
      urgent.task.id,
      'project-level urgent dispatch',
    );
  });

  it('emits the replacement assignment only after the soft-preempt runtime hint resolves', async () => {
    const worker = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const eventOrder: string[] = [];
    runtimeControl.softPreempt.mockImplementationOnce(async () => {
      eventOrder.push('soft-preempt');
      return { accepted: true };
    });
    adapter = new ProjectRuntimeAdapter({
      taskAuthorityStore: store,
      workerRegistry: registry,
      scheduler,
      runtimeControl,
      worktreeManager,
      onWorkerEvent: (eventType, payload) => {
        runtimeEvents.push({ eventType, payload });
        eventOrder.push(eventType);
      },
    });

    await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement initial API',
      projectPath: '/workspace/server',
      displayLabel: 'server-initial-order',
      title: 'Initial API',
      preferredWorkerId: worker.id,
    });

    await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Fix production outage',
      projectPath: '/workspace/server',
      displayLabel: 'server-urgent-order',
      title: 'Urgent outage fix',
      preemptRunningWorker: true,
      preferredWorkerId: worker.id,
    });

    expect(eventOrder).toEqual([
      'worker:task:assigned',
      'soft-preempt',
      'worker:task:assigned',
    ]);
  });

  it('provisions an ephemeral worktree when requested', async () => {
    registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const dispatched = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement background job',
      projectPath: '/workspace/server',
      displayLabel: 'server-ephemeral',
      title: 'Ephemeral worker task',
      allowEphemeralWorkspace: true,
    });

    expect(worktreeManager.provisionEphemeralWorkspace).toHaveBeenCalledTimes(1);
    expect(dispatched.ephemeralWorkspace?.path).toBe('/tmp/worktree/task-ephemeral');
  });

  it('transitions the authority task to completed when the worker task finishes successfully', async () => {
    registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const dispatched = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement login API',
      projectPath: '/workspace/server',
      displayLabel: 'server-login-finish',
      title: 'Finish login API',
    });

    const finalized = adapter.finalizeWorkerTask({
      workerTaskId: dispatched.workerTask!.taskId,
      success: true,
    });

    expect(finalized.transitionedTo).toBe('completed');
    expect(store.getTask(dispatched.task.id)?.status).toBe('completed');
  });

  it('resumes a blocked authority task onto another available worker using the previous prompt', async () => {
    const primary = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const secondary = registry.register({
      projectPath: '/workspace/server',
      name: 'server-helper',
      pid: 102,
      runtimeKind: 'tmux',
    });

    const first = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement initial API',
      projectPath: '/workspace/server',
      displayLabel: 'server-initial',
      title: 'Initial API',
      preferredWorkerId: primary.id,
    });

    await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Fix production outage',
      projectPath: '/workspace/server',
      displayLabel: 'server-urgent',
      title: 'Urgent outage fix',
      preemptRunningWorker: true,
      preferredWorkerId: primary.id,
    });

    const resumed = await adapter.resumeBlockedTask({
      taskId: first.task.id,
      preferredWorkerId: secondary.id,
      projectPath: '/workspace/server',
      source: 'resume',
    });

    expect(resumed.disposition).toBe('assigned');
    expect(resumed.worker?.id).toBe(secondary.id);
    expect(resumed.workerTask?.prompt).toBe('Implement initial API');
    expect(store.getTask(first.task.id)?.status).toBe('in_progress');
  });

  it('dispatches the next queued authority task onto a worker that became idle', async () => {
    const worker = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const first = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement initial API',
      projectPath: '/workspace/server',
      displayLabel: 'server-initial',
      title: 'Initial API',
      preferredWorkerId: worker.id,
    });

    const queued = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement follow-up API',
      projectPath: '/workspace/server',
      displayLabel: 'server-follow-up',
      title: 'Follow-up API',
      preferredWorkerId: worker.id,
    });

    expect(queued.disposition).toBe('queued');

    registry.completeTask(first.workerTask!.taskId, {
      success: true,
      text: 'done',
      sessionId: 'sess-1',
      model: 'claude',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      cost: 0,
      durationMs: 10,
      numTurns: 1,
    });

    const reassigned = await adapter.dispatchNextQueuedTask({
      projectId: 'server',
      workerId: worker.id,
    });

    expect(reassigned?.disposition).toBe('assigned');
    expect(reassigned?.task.id).toBe(queued.task.id);
    expect(reassigned?.workerTask?.prompt).toBe('Implement follow-up API');
    expect(store.getTask(queued.task.id)?.status).toBe('in_progress');
  });

  it('dispatches the next queued authority task onto another idle worker when no workerId is provided', async () => {
    const primary = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const secondary = registry.register({
      projectPath: '/workspace/server',
      name: 'server-helper',
      pid: 102,
      runtimeKind: 'tmux',
    });

    await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement initial API',
      projectPath: '/workspace/server',
      displayLabel: 'server-initial',
      title: 'Initial API',
      preferredWorkerId: primary.id,
    });

    const queued = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement follow-up API',
      projectPath: '/workspace/server',
      displayLabel: 'server-follow-up',
      title: 'Follow-up API',
      preferredWorkerId: primary.id,
    });

    const reassigned = await adapter.dispatchNextQueuedTask({
      projectId: 'server',
    });

    expect(queued.disposition).toBe('queued');
    expect(reassigned?.worker?.id).toBe(secondary.id);
    expect(reassigned?.workerTask?.prompt).toBe('Implement follow-up API');
  });

  it('returns null instead of throwing when a claimed queued task is already in progress', async () => {
    const worker = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const queuedAuthority = store.createTask({
      displayLabel: 'server-queued-race',
      title: 'Queued race task',
      kind: 'project',
      projectId: 'server',
      metadata: {
        __projectRuntimeDispatch: {
          prompt: 'Implement race follow-up',
          projectPath: '/workspace/server',
        },
      },
    });
    store.transitionTask(queuedAuthority.id, 'ready');
    store.enqueueTask(queuedAuthority.id);
    store.transitionTask(queuedAuthority.id, 'assigned', { assignedWorkerId: worker.id });
    store.transitionTask(queuedAuthority.id, 'in_progress', { assignedWorkerId: worker.id });
    registry.markIdle(worker.id);

    const dispatched = await adapter.dispatchNextQueuedTask({
      projectId: 'server',
      workerId: worker.id,
    });

    expect(dispatched).toBeNull();
    expect(store.getTask(queuedAuthority.id)?.status).toBe('in_progress');
  });

  it('cancels an in-progress authority task and resets the active worker runtime', async () => {
    const worker = registry.register({
      projectPath: '/workspace/server',
      name: 'server-default',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const dispatched = await adapter.dispatchTask({
      projectId: 'server',
      prompt: 'Implement login API',
      projectPath: '/workspace/server',
      displayLabel: 'server-login-cancel',
      title: 'Cancel login API',
      preferredWorkerId: worker.id,
    });

    const cancelled = await adapter.cancelTask({
      taskId: dispatched.task.id,
      projectId: 'server',
      reason: 'user requested cancellation',
    });

    expect(cancelled.task.status).toBe('cancelled');
    expect(cancelled.worker?.id).toBe(worker.id);
    expect(cancelled.workerTask?.status).toBe('cancelled');
    expect(registry.getAll().find((candidate) => candidate.id === worker.id)?.status).toBe('idle');
    expect(runtimeControl.resetSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: worker.id, name: worker.name }),
      'user requested cancellation',
    );
    expect(runtimeEvents.at(-1)?.eventType).toBe('worker:task:cancelled');
  });
});
