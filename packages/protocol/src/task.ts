/**
 * Hierarchical Task Types for Long-term Memory
 *
 * Tasks form a tree structure with parent-child relationships.
 * Context propagates bidirectionally through the hierarchy.
 */

// Task status
export type TaskStatus = 'active' | 'archived' | 'deleted';

// Task node in the hierarchy
export interface Task {
  id: string;
  parentId: string | null;
  path: string;              // Materialized path: '/root/phase1/task3'
  depth: number;             // Tree depth (root = 0)
  siblingOrder: number;      // Order among siblings (for drag-drop)
  name: string;
  context: string | null;    // Task-specific context
  metadata: Record<string, unknown> | null;  // Extensible JSON
  status: TaskStatus;
  version: number;           // Optimistic locking
  createdAt: number;         // Unix timestamp
  updatedAt: number;
}

// Task creation input
export interface CreateTaskInput {
  parentId?: string | null;
  name: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

// Task update input
export interface UpdateTaskInput {
  name?: string;
  context?: string;
  metadata?: Record<string, unknown>;
  status?: TaskStatus;
  parentId?: string | null;  // For reparenting (drag-drop)
  siblingOrder?: number;     // For reordering
}

// Task with resolved context (merged from ancestors)
export interface TaskWithResolvedContext extends Task {
  resolvedContext: string;   // Merged context from ancestors
  ancestors: Pick<Task, 'id' | 'name' | 'context'>[];
}

// Context version history entry
export interface ContextVersion {
  id: string;
  taskId: string;
  context: string;
  changedAt: number;
  changedBy: string;  // 'user' | 'agent:{name}' | 'system'
}

// Tree node for UI rendering
export interface TaskTreeNode extends Task {
  children: TaskTreeNode[];
}

// WebSocket events for real-time sync
export interface TaskCreatedPayload {
  task: Task;
}

export interface TaskUpdatedPayload {
  task: Task;
  previousVersion: number;
}

export interface TaskDeletedPayload {
  taskId: string;
  deletedAt: number;
}

export interface TaskMovedPayload {
  taskId: string;
  oldPath: string;
  newPath: string;
  affectedTasks: string[];  // IDs of tasks with updated paths
}
