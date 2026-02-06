/**
 * Context OS Types for Hierarchical Context Management
 *
 * Contexts form a hierarchy: Workspace → Project → Task
 * with merge/report workflows for context synchronization.
 */

// Context scope levels
export type ContextScope = 'workspace' | 'project' | 'task';

// Context status
export type ContextStatus = 'active' | 'archived' | 'deleted';

// Edge types for context relationships
export type ContextEdgeType = 'parent' | 'reports_to' | 'derived_from';

// Merge request status
export type ContextMergeStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'applied' | 'conflict';

// Async operation status
export type OperationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

// Core context entity
export interface Context {
  id: string;
  scope: ContextScope;
  path: string;                     // e.g., '/workspace/project-a/task-1'
  parentId: string | null;
  status: ContextStatus;
  summary: string | null;
  content: string | null;
  version: number;                  // Optimistic locking
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Context creation input
export interface CreateContextInput {
  scope: ContextScope;
  path: string;
  parentId?: string | null;
  summary?: string;
  content?: string;
}

// Context update input (with version for optimistic lock)
export interface UpdateContextInput {
  summary?: string;
  content?: string;
  status?: ContextStatus;
  expectedVersion: number;          // Must match current version
}

// Context edge (relationship)
export interface ContextEdge {
  id: string;
  sourceId: string;
  targetId: string;
  edgeType: ContextEdgeType;
  createdAt: string;
}

// Context version history entry (append-only)
export interface ContextVersionEntry {
  id: string;
  contextId: string;
  baseVersion: number;
  content: string;
  summary: string | null;
  reason: string | null;
  actor: string;                    // 'user' | 'agent:{name}' | 'system' | 'merge:{mergeId}'
  createdAt: string;
}

// Context merge request
export interface ContextMerge {
  id: string;
  sourceId: string;
  targetId: string;
  status: ContextMergeStatus;
  diff: string | null;
  resolution: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

// Async operation tracking
export interface Operation {
  id: string;
  type: 'merge' | 'report_upstream';
  status: OperationStatus;
  contextId: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// Create merge input
export interface CreateMergeInput {
  sourceId: string;
  targetId: string;
  idempotencyKey?: string;
}

// Report upstream input
export interface ReportUpstreamInput {
  contextId: string;
  summary?: string;
}

// Context tree node for UI rendering
export interface ContextTreeNode extends Context {
  children: ContextTreeNode[];
  mergeCount?: number;              // Pending merges count
  hasConflict?: boolean;
}

// WebSocket events for real-time sync
export interface ContextCreatedPayload {
  context: Context;
}

export interface ContextUpdatedPayload {
  context: Context;
  previousVersion: number;
}

export interface ContextMergeRequestedPayload {
  merge: ContextMerge;
  operation: Operation;
}

export interface ContextMergedPayload {
  merge: ContextMerge;
  targetContext: Context;
}

export interface ContextConflictDetectedPayload {
  merge: ContextMerge;
  conflicts: string[];
}

export interface ContextReportedUpstreamPayload {
  sourceContext: Context;
  targetContext: Context;
  operation: Operation;
}
