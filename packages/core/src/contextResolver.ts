/**
 * Context Resolver - Bidirectional Context Propagation
 *
 * Resolves task context by merging ancestor contexts (upward propagation)
 * and provides utilities for context management.
 */

import type { Task, TaskWithResolvedContext } from '@olympus-dev/protocol';
import { TaskStore } from './taskStore.js';

export interface ContextResolverOptions {
  maxAncestorLevels?: number;  // Max levels to merge (default: 3)
  maxContextLength?: number;   // Max chars for resolved context (default: 10000)
  separator?: string;          // Separator between context blocks
}

const DEFAULT_OPTIONS: Required<ContextResolverOptions> = {
  maxAncestorLevels: 3,
  maxContextLength: 10000,
  separator: '\n\n---\n\n',
};

export class ContextResolver {
  private store: TaskStore;
  private options: Required<ContextResolverOptions>;

  constructor(store: TaskStore, options: ContextResolverOptions = {}) {
    this.store = store;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Resolve full context for a task by merging ancestor contexts
   */
  resolve(taskId: string): TaskWithResolvedContext | null {
    return this.store.getWithContext(taskId, this.options.maxAncestorLevels);
  }

  /**
   * Build a prompt-ready context string for AI consumption
   */
  buildPromptContext(taskId: string): string | null {
    const resolved = this.resolve(taskId);
    if (!resolved) return null;

    const parts: string[] = [];

    // Add hierarchy breadcrumb
    if (resolved.ancestors.length > 0) {
      const breadcrumb = resolved.ancestors
        .map((a) => a.name)
        .concat(resolved.name)
        .join(' > ');
      parts.push(`# Task Hierarchy\n${breadcrumb}`);
    }

    // Add resolved context
    if (resolved.resolvedContext) {
      parts.push(`# Context\n${resolved.resolvedContext}`);
    }

    // Add current task info
    parts.push(`# Current Task\n**${resolved.name}**\nPath: ${resolved.path}\nStatus: ${resolved.status}`);

    const result = parts.join('\n\n');

    // Truncate if too long
    if (result.length > this.options.maxContextLength) {
      return result.slice(0, this.options.maxContextLength) + '\n\n[Context truncated...]';
    }

    return result;
  }

  /**
   * Update context and propagate changes
   * For now, only records version history; could add downward propagation
   */
  updateContext(taskId: string, newContext: string, changedBy = 'user'): Task {
    return this.store.update(taskId, { context: newContext }, changedBy);
  }

  /**
   * Get context diff between versions
   */
  getContextDiff(taskId: string, fromVersion?: number): {
    current: string | null;
    history: Array<{ context: string; changedAt: number; changedBy: string }>;
  } {
    const task = this.store.get(taskId);
    const history = this.store.getContextHistory(taskId);

    const filteredHistory = fromVersion
      ? history.filter((h) => h.changedAt > fromVersion)
      : history;

    return {
      current: task?.context ?? null,
      history: filteredHistory.map((h) => ({
        context: h.context,
        changedAt: h.changedAt,
        changedBy: h.changedBy,
      })),
    };
  }

  /**
   * Find all tasks that would be affected by a context change
   * (descendants that might inherit this context)
   */
  getAffectedTasks(taskId: string): Task[] {
    return this.store.getDescendants(taskId);
  }

  /**
   * Summarize context for a subtree
   * Useful for getting overview without full context
   */
  summarizeSubtree(taskId: string): {
    root: Task | null;
    childCount: number;
    maxDepth: number;
    contextLength: number;
  } {
    const root = this.store.get(taskId);
    if (!root) {
      return { root: null, childCount: 0, maxDepth: 0, contextLength: 0 };
    }

    const descendants = this.store.getDescendants(taskId);
    const maxDepth = descendants.reduce((max, d) => Math.max(max, d.depth), root.depth);
    const contextLength = descendants.reduce(
      (sum, d) => sum + (d.context?.length ?? 0),
      root.context?.length ?? 0
    );

    return {
      root,
      childCount: descendants.length,
      maxDepth: maxDepth - root.depth,
      contextLength,
    };
  }
}
