import type { TaskAuthorityTask, WorkerTaskRecord } from '@olympus-dev/protocol';

type SummaryBucket = 'blocked' | 'failed' | 'risky' | 'completed';
type SummarySource = 'authority' | 'worker';

export interface TaskSummaryServiceInput {
  authorityTasks: TaskAuthorityTask[];
  workerTaskRecords: WorkerTaskRecord[];
}

export interface ProjectTaskSummaryItem {
  id: string;
  projectId: string;
  source: SummarySource;
  status: string;
  title: string;
  bucket: SummaryBucket;
  workerName?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ProjectTaskSummaryCounts {
  blocked: number;
  failed: number;
  risky: number;
  completed: number;
  total: number;
}

export interface ProjectTaskSummary {
  projectId: string;
  counts: ProjectTaskSummaryCounts;
  orderedItems: ProjectTaskSummaryItem[];
  summary: string;
}

interface ProjectSummaryState {
  projectId: string;
  authorityTasks: TaskAuthorityTask[];
  workerTaskRecords: WorkerTaskRecord[];
}

const BUCKET_ORDER: SummaryBucket[] = ['blocked', 'failed', 'risky', 'completed'];

function bucketRank(bucket: SummaryBucket): number {
  return BUCKET_ORDER.indexOf(bucket);
}

function isTerminalAuthorityStatus(status: TaskAuthorityTask['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function classifyAuthorityTask(task: TaskAuthorityTask): SummaryBucket | null {
  if (task.status === 'blocked') return 'blocked';
  if (task.status === 'failed') return 'failed';
  if (task.status === 'assigned' || task.status === 'in_progress') return 'risky';
  if (task.status === 'completed' || task.status === 'cancelled') return 'completed';
  return null;
}

function classifyWorkerRecord(record: WorkerTaskRecord): SummaryBucket | null {
  if (record.status === 'completed') return 'completed';
  if (record.status === 'failed') return 'failed';
  if (record.status === 'timeout' || record.status === 'running') return 'risky';
  return null;
}

function buildItemLabel(item: ProjectTaskSummaryItem): string {
  if (item.source === 'worker') {
    return item.workerName ? `${item.workerName} ${item.status}` : item.title;
  }
  return item.title;
}

function buildSummary(items: ProjectTaskSummaryItem[]): string {
  const parts: string[] = [];
  for (const bucket of BUCKET_ORDER) {
    const match = items.find((item) => item.bucket === bucket);
    if (!match) continue;
    const label = buildItemLabel(match);
    parts.push(`${bucket[0].toUpperCase()}${bucket.slice(1)}: ${label}`);
  }
  return parts.join(' | ');
}

function buildProjectSummary(state: ProjectSummaryState): ProjectTaskSummary {
  const authorityById = new Map(state.authorityTasks.map((task) => [task.id, task] as const));
  const items: ProjectTaskSummaryItem[] = [];
  const counts: ProjectTaskSummaryCounts = {
    blocked: 0,
    failed: 0,
    risky: 0,
    completed: 0,
    total: 0,
  };

  for (const task of state.authorityTasks) {
    const bucket = classifyAuthorityTask(task);
    if (!bucket) continue;
    counts[bucket] += 1;
    counts.total += 1;
    items.push({
      id: task.id,
      projectId: state.projectId,
      source: 'authority',
      status: task.status,
      title: task.title,
      bucket,
      ...(task.assignedWorkerId ? { workerName: task.assignedWorkerId } : {}),
      startedAt: task.createdAt,
      completedAt: task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' ? task.updatedAt : undefined,
    });
  }

  for (const record of state.workerTaskRecords) {
    if (!record.authorityTaskId) continue;
    const authorityTask = authorityById.get(record.authorityTaskId) ?? null;
    if (!authorityTask?.projectId || authorityTask.projectId !== state.projectId) continue;

    const bucket = classifyWorkerRecord(record);
    if (!bucket) continue;

    const shouldCount =
      (bucket === 'completed' &&
        authorityTask.status !== 'completed' &&
        authorityTask.status !== 'cancelled' &&
        authorityTask.status !== 'failed') ||
      (bucket === 'failed' &&
        authorityTask.status !== 'failed' &&
        authorityTask.status !== 'cancelled' &&
        authorityTask.status !== 'completed') ||
      (bucket === 'risky' && !isTerminalAuthorityStatus(authorityTask.status));

    if (shouldCount) {
      counts[bucket] += 1;
      counts.total += 1;
    }

    items.push({
      id: record.taskId,
      projectId: state.projectId,
      source: 'worker',
      status: record.status,
      title: record.workerName,
      bucket,
      workerName: record.workerName,
      startedAt: record.startedAt,
      completedAt: record.completedAt ?? record.timeoutAt,
    });
  }

  items.sort((left, right) => {
    const rankDelta = bucketRank(left.bucket) - bucketRank(right.bucket);
    if (rankDelta !== 0) return rankDelta;
    return (right.startedAt ?? 0) - (left.startedAt ?? 0);
  });

  return {
    projectId: state.projectId,
    counts,
    orderedItems: items,
    summary: buildSummary(items),
  };
}

export class TaskSummaryService {
  buildProjectSummaries(input: TaskSummaryServiceInput): ProjectTaskSummary[] {
    const projectStates = new Map<string, ProjectSummaryState>();
    const authorityById = new Map<string, TaskAuthorityTask>();

    for (const task of input.authorityTasks) {
      if (!task.projectId) continue;
      authorityById.set(task.id, task);
      const state = projectStates.get(task.projectId) ?? {
        projectId: task.projectId,
        authorityTasks: [],
        workerTaskRecords: [],
      };
      state.authorityTasks.push(task);
      projectStates.set(task.projectId, state);
    }

    for (const record of input.workerTaskRecords) {
      if (!record.authorityTaskId) continue;
      const authorityTask = authorityById.get(record.authorityTaskId);
      if (!authorityTask?.projectId) continue;
      const state = projectStates.get(authorityTask.projectId);
      if (!state) continue;
      state.workerTaskRecords.push(record);
    }

    return Array.from(projectStates.values())
      .map((state) => buildProjectSummary(state))
      .sort((left, right) => {
        const leftRank = bucketRank(left.orderedItems[0]?.bucket ?? 'completed');
        const rightRank = bucketRank(right.orderedItems[0]?.bucket ?? 'completed');
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.projectId.localeCompare(right.projectId);
      });
  }
}
