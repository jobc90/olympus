export const TASK_AUTHORITY_STATUSES = [
  'draft',
  'ready',
  'assigned',
  'in_progress',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const;

export type TaskAuthorityStatus = typeof TASK_AUTHORITY_STATUSES[number];

export type TaskAuthorityTaskKind = 'parent' | 'project';

export type TaskDependencyType = 'depends_on' | 'blocks';

export interface TaskAuthorityTask {
  id: string;
  displayLabel: string;
  title: string;
  kind: TaskAuthorityTaskKind;
  status: TaskAuthorityStatus;
  projectId: string | null;
  parentTaskId: string | null;
  assignedWorkerId: string | null;
  priority: number;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskAuthorityTaskInput {
  id?: string;
  displayLabel: string;
  title: string;
  kind: TaskAuthorityTaskKind;
  projectId?: string | null;
  parentTaskId?: string | null;
  priority?: number;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateTaskAuthorityTaskInput {
  displayLabel?: string;
  title?: string;
  assignedWorkerId?: string | null;
  priority?: number;
  metadata?: Record<string, unknown> | null;
}

export interface TaskDependencyEdge {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: TaskDependencyType;
  createdAt: number;
}

export interface TaskQueueEntry {
  id: string;
  projectId: string;
  taskId: string;
  priority: number;
  insertedAt: number;
  assignedAt: number | null;
  assignedWorkerId: string | null;
}

export interface TaskExecutionLock {
  id: string;
  projectId: string;
  taskId: string;
  reason: string;
  createdAt: number;
  releasedAt: number | null;
}

export interface TaskPreemptionEvent {
  id: string;
  projectId: string;
  preemptedTaskId: string;
  replacementTaskId: string;
  actor: string;
  reason: string;
  createdAt: number;
}

export const TASK_STATUS_TRANSITIONS: Record<TaskAuthorityStatus, readonly TaskAuthorityStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['assigned', 'cancelled', 'failed'],
  assigned: ['in_progress', 'blocked', 'cancelled', 'failed'],
  in_progress: ['blocked', 'completed', 'failed', 'cancelled'],
  blocked: ['assigned', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionTaskStatus(
  from: TaskAuthorityStatus,
  to: TaskAuthorityStatus,
): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

export function assertTaskStatusTransition(
  from: TaskAuthorityStatus,
  to: TaskAuthorityStatus,
): void {
  if (!canTransitionTaskStatus(from, to)) {
    throw new Error(`Invalid task status transition: ${from} -> ${to}`);
  }
}
