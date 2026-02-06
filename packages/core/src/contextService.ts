/**
 * ContextService - Higher-level domain logic for Context OS
 *
 * Provides:
 * - Auto-report policy (task→project→workspace propagation)
 * - Merge policy engine (auto-approve/conflict detection)
 * - Cascade reporting (walk up hierarchy)
 * - Event hooks (created, updated, merged, reported_upstream)
 */

import { ContextStore } from './contextStore.js';
import type {
  Context,
  ContextScope,
  ContextMerge,
  CreateContextInput,
  UpdateContextInput,
} from '@olympus-dev/protocol';

export type AutoReportPolicy = 'auto' | 'manual' | 'on-threshold';

export interface ContextServiceConfig {
  autoReportPolicy?: AutoReportPolicy;
  autoReportThreshold?: number; // Content length threshold for 'on-threshold' policy
}

export type ContextEventType =
  | 'context:created'
  | 'context:updated'
  | 'context:merged'
  | 'context:reported_upstream';

export interface ContextEvent {
  type: ContextEventType;
  contextId: string;
  targetId?: string; // For merge/report operations
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type ContextEventCallback = (event: ContextEvent) => void;

export class ContextService {
  private static instance: ContextService | null = null;
  private store: ContextStore;
  private config: Required<ContextServiceConfig>;
  private eventCallbacks: ContextEventCallback[] = [];

  private constructor(config: ContextServiceConfig = {}) {
    this.store = ContextStore.getInstance();
    this.config = {
      autoReportPolicy: config.autoReportPolicy ?? 'manual',
      autoReportThreshold: config.autoReportThreshold ?? 500,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: ContextServiceConfig): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService(config);
    }
    return ContextService.instance;
  }

  /**
   * Register event callback
   */
  on(callback: ContextEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Emit event to all registered callbacks
   */
  private emit(event: ContextEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('ContextService event callback error:', error);
      }
    }
  }

  /**
   * Create context with event emission
   */
  create(input: CreateContextInput, actor = 'user'): Context {
    const context = this.store.create(input, actor);
    this.emit({
      type: 'context:created',
      contextId: context.id,
      timestamp: new Date().toISOString(),
      metadata: { scope: context.scope, path: context.path },
    });
    return context;
  }

  /**
   * Update context with auto-report policy and event emission
   */
  update(id: string, input: UpdateContextInput, actor = 'user'): Context {
    const context = this.store.update(id, input, actor);
    this.emit({
      type: 'context:updated',
      contextId: context.id,
      timestamp: new Date().toISOString(),
      metadata: { version: context.version },
    });

    // Auto-report if task scope and policy permits
    if (context.scope === 'task' && context.parentId) {
      const shouldReport = this.shouldAutoReport(context);
      if (shouldReport) {
        this.reportUpstream(context.id, actor);
      }
    }

    return context;
  }

  /**
   * Determine if auto-report should trigger
   */
  private shouldAutoReport(context: Context): boolean {
    switch (this.config.autoReportPolicy) {
      case 'auto':
        return true;
      case 'manual':
        return false;
      case 'on-threshold':
        return (context.content?.length ?? 0) >= this.config.autoReportThreshold;
    }
  }

  /**
   * Report context upstream to parent (create merge request)
   */
  reportUpstream(contextId: string, actor = 'user'): ContextMerge {
    const context = this.store.getById(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }

    if (!context.parentId) {
      throw new Error(`Context has no parent: ${contextId}`);
    }

    const idempotencyKey = `report-${contextId}-${context.version}`;
    const merge = this.store.createMerge(contextId, context.parentId, idempotencyKey);

    // Auto-evaluate merge policy
    const decision = this.evaluateMerge(merge.id);
    if (decision.autoApprove) {
      this.store.updateMergeStatus(merge.id, 'approved', decision.reason);
      this.store.applyMerge(merge.id, actor);
    } else if (decision.conflict) {
      this.store.updateMergeStatus(merge.id, 'conflict', decision.reason);
    } else {
      this.store.updateMergeStatus(merge.id, 'pending', decision.reason);
    }

    const finalMerge = this.store.getMerge(merge.id)!;

    this.emit({
      type: 'context:reported_upstream',
      contextId,
      targetId: context.parentId,
      timestamp: new Date().toISOString(),
      metadata: { mergeId: merge.id, status: finalMerge.status },
    });

    return finalMerge;
  }

  /**
   * Evaluate merge policy
   */
  private evaluateMerge(mergeId: string): { autoApprove: boolean; conflict: boolean; reason: string } {
    const merge = this.store.getMerge(mergeId);
    if (!merge) {
      throw new Error(`Merge not found: ${mergeId}`);
    }

    const source = this.store.getById(merge.sourceId);
    const target = this.store.getById(merge.targetId);

    if (!source || !target) {
      return { autoApprove: false, conflict: true, reason: 'Source or target not found' };
    }

    const sourceContent = source.content ?? '';
    const targetContent = target.content ?? '';

    // Check if target was updated after merge creation
    const targetUpdatedAfterMerge = new Date(target.updatedAt) > new Date(merge.createdAt);
    if (targetUpdatedAfterMerge) {
      return { autoApprove: false, conflict: true, reason: 'Target context updated after merge creation' };
    }

    // Simple heuristic: if source is longer and target hasn't changed, assume extension
    if (sourceContent.length >= targetContent.length) {
      if (sourceContent.includes(targetContent) || targetContent.length === 0) {
        return { autoApprove: true, conflict: false, reason: 'Source extends target (auto-approved)' };
      }
    }

    // Conservative default: require manual review
    return { autoApprove: false, conflict: false, reason: 'Manual review required' };
  }

  /**
   * Apply merge with event emission
   */
  applyMerge(mergeId: string, actor = 'user'): Context {
    const context = this.store.applyMerge(mergeId, actor);
    this.emit({
      type: 'context:merged',
      contextId: context.id,
      timestamp: new Date().toISOString(),
      metadata: { mergeId },
    });
    return context;
  }

  /**
   * Cascade report: walk up hierarchy (task→project→workspace)
   */
  cascadeReportUpstream(contextId: string, actor = 'user'): ContextMerge[] {
    const merges: ContextMerge[] = [];
    let currentId: string | null = contextId;

    while (currentId) {
      const context = this.store.getById(currentId);
      if (!context || !context.parentId) {
        break;
      }

      try {
        const merge = this.reportUpstream(currentId, actor);
        merges.push(merge);

        // If merge was auto-applied, continue to next level
        if (merge.status === 'applied') {
          currentId = context.parentId;
        } else {
          // Stop cascade if merge requires manual review
          break;
        }
      } catch (error) {
        console.error(`Failed to report ${currentId} upstream:`, error);
        break;
      }
    }

    return merges;
  }

  /**
   * Get pending merges for review
   */
  getPendingMerges(targetId: string): ContextMerge[] {
    return this.store.getMergesForTarget(targetId, 'pending');
  }

  /**
   * Get conflict merges for resolution
   */
  getConflictMerges(targetId: string): ContextMerge[] {
    return this.store.getMergesForTarget(targetId, 'conflict');
  }

  /**
   * Approve merge manually
   */
  approveMerge(mergeId: string, actor = 'user'): ContextMerge {
    return this.store.updateMergeStatus(mergeId, 'approved', 'Manually approved');
  }

  /**
   * Reject merge
   */
  rejectMerge(mergeId: string, reason: string): ContextMerge {
    return this.store.updateMergeStatus(mergeId, 'rejected', reason);
  }

  /**
   * Get context by ID (delegate to store)
   */
  getById(id: string): Context | null {
    return this.store.getById(id);
  }

  /**
   * Get context tree (delegate to store)
   */
  getTree(scope?: ContextScope) {
    return this.store.getTree(scope);
  }

  /**
   * Get ancestors (delegate to store)
   */
  getAncestors(id: string): Context[] {
    return this.store.getAncestors(id);
  }

  /**
   * Seed workspace (delegate to store)
   */
  seedWorkspace(workspacePath: string): Context {
    return this.store.seedWorkspace(workspacePath);
  }

  /**
   * Seed project (delegate to store)
   */
  seedProject(workspacePath: string, projectPath: string): Context {
    return this.store.seedProject(workspacePath, projectPath);
  }
}
