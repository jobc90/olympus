import { describe, expect, it } from 'vitest';
import type { TaskAuthorityTask, WorkerTaskRecord } from '@olympus-dev/protocol';
import { TaskSummaryService } from '../reporting/task-summary-service.js';

function makeAuthorityTask(overrides: Partial<TaskAuthorityTask> & { id: string; projectId: string | null; status: TaskAuthorityTask['status']; title: string; displayLabel: string }): TaskAuthorityTask {
  return {
    id: overrides.id,
    displayLabel: overrides.displayLabel,
    title: overrides.title,
    kind: overrides.kind ?? 'project',
    status: overrides.status,
    projectId: overrides.projectId,
    parentTaskId: overrides.parentTaskId ?? null,
    assignedWorkerId: overrides.assignedWorkerId ?? null,
    priority: overrides.priority ?? 0,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? 1_000,
    updatedAt: overrides.updatedAt ?? 1_000,
  };
}

function makeWorkerTaskRecord(overrides: Partial<WorkerTaskRecord> & { taskId: string; workerId: string; workerName: string; status: WorkerTaskRecord['status']; startedAt?: number }): WorkerTaskRecord {
  return {
    taskId: overrides.taskId,
    workerId: overrides.workerId,
    workerName: overrides.workerName,
    prompt: overrides.prompt ?? 'do work',
    status: overrides.status,
    startedAt: overrides.startedAt ?? 1_000,
    ...(overrides.completedAt !== undefined ? { completedAt: overrides.completedAt } : {}),
    ...(overrides.result !== undefined ? { result: overrides.result } : {}),
    ...(overrides.chatId !== undefined ? { chatId: overrides.chatId } : {}),
    ...(overrides.timeoutResult !== undefined ? { timeoutResult: overrides.timeoutResult } : {}),
    ...(overrides.timeoutAt !== undefined ? { timeoutAt: overrides.timeoutAt } : {}),
    ...(overrides.authorityTaskId !== undefined ? { authorityTaskId: overrides.authorityTaskId } : {}),
  };
}

describe('TaskSummaryService', () => {
  it('groups project tasks and ranks blocked, failed, and risky items ahead of completed ones', () => {
    const service = new TaskSummaryService();

    const summaries = service.buildProjectSummaries({
      authorityTasks: [
        makeAuthorityTask({
          id: 'server-complete',
          projectId: 'server',
          status: 'completed',
          title: 'Ship login',
          displayLabel: 'server-login',
        }),
        makeAuthorityTask({
          id: 'server-blocked',
          projectId: 'server',
          status: 'blocked',
          title: 'Fix deploy',
          displayLabel: 'server-deploy',
          assignedWorkerId: 'worker-server',
        }),
        makeAuthorityTask({
          id: 'web-failed',
          projectId: 'web',
          status: 'failed',
          title: 'Repair build',
          displayLabel: 'web-build',
        }),
      ],
      workerTaskRecords: [
        makeWorkerTaskRecord({
          taskId: 'worker-task-1',
          workerId: 'worker-server',
          workerName: 'server-default',
          authorityTaskId: 'server-blocked',
          status: 'running',
        }),
        makeWorkerTaskRecord({
          taskId: 'worker-task-2',
          workerId: 'worker-server',
          workerName: 'server-default',
          authorityTaskId: 'server-complete',
          status: 'completed',
          completedAt: 2_000,
        }),
        makeWorkerTaskRecord({
          taskId: 'worker-task-3',
          workerId: 'worker-web',
          workerName: 'web-default',
          authorityTaskId: 'web-failed',
          status: 'timeout',
        }),
      ],
    });

    const server = summaries.find((summary) => summary.projectId === 'server');
    const web = summaries.find((summary) => summary.projectId === 'web');

    expect(server).toBeDefined();
    expect(server?.counts).toMatchObject({
      blocked: 1,
      failed: 0,
      risky: 1,
      completed: 1,
    });
    expect(server?.orderedItems.map((item) => `${item.source}:${item.status}`)).toEqual([
      'authority:blocked',
      'worker:running',
      'authority:completed',
      'worker:completed',
    ]);
    expect(server?.summary).toBe('Blocked: Fix deploy | Risky: server-default running | Completed: Ship login');

    expect(web).toBeDefined();
    expect(web?.orderedItems[0]).toMatchObject({
      source: 'authority',
      status: 'failed',
      title: 'Repair build',
    });
    expect(web?.orderedItems[1]).toMatchObject({
      source: 'worker',
      status: 'timeout',
      title: 'web-default',
    });
  });

  it('ignores worker records that cannot be linked to a project task', () => {
    const service = new TaskSummaryService();

    const summaries = service.buildProjectSummaries({
      authorityTasks: [
        makeAuthorityTask({
          id: 'server-complete',
          projectId: 'server',
          status: 'completed',
          title: 'Ship login',
          displayLabel: 'server-login',
        }),
      ],
      workerTaskRecords: [
        makeWorkerTaskRecord({
          taskId: 'worker-task-1',
          workerId: 'worker-server',
          workerName: 'server-default',
          authorityTaskId: 'missing-task',
          status: 'failed',
        }),
      ],
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.projectId).toBe('server');
    expect(summaries[0]?.counts).toMatchObject({
      blocked: 0,
      failed: 0,
      risky: 0,
      completed: 1,
    });
    expect(summaries[0]?.orderedItems).toHaveLength(1);
    expect(summaries[0]?.orderedItems[0]).toMatchObject({
      source: 'authority',
      status: 'completed',
      title: 'Ship login',
    });
  });
});
