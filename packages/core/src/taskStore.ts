/**
 * TaskStore - SQLite-backed Hierarchical Task Storage
 *
 * Provides persistent storage for task hierarchy with:
 * - Materialized path for efficient tree queries
 * - Optimistic locking for concurrent updates
 * - Context version history
 * - WAL mode for concurrent access
 */

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  Task,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  TaskWithResolvedContext,
  ContextVersion,
  TaskTreeNode,
} from '@olympus-dev/protocol';
import { mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.olympus');

function ensureConfigDirSync(configDir: string = DEFAULT_CONFIG_DIR): string {
  mkdirSync(configDir, { recursive: true });
  return configDir;
}

// Database row types
interface TaskRow {
  id: string;
  parent_id: string | null;
  path: string;
  depth: number;
  sibling_order: number;
  name: string;
  context: string | null;
  metadata: string | null;
  status: string;
  version: number;
  created_at: number;
  updated_at: number;
}

interface ContextVersionRow {
  id: string;
  task_id: string;
  context: string;
  changed_at: number;
  changed_by: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    path: row.path,
    depth: row.depth,
    siblingOrder: row.sibling_order,
    name: row.name,
    context: row.context,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    status: row.status as TaskStatus,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TaskStore {
  private db: Database.Database;
  private static instance: TaskStore | null = null;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
  }

  /**
   * Get singleton instance
   */
  static getInstance(dbPath?: string): TaskStore {
    if (!TaskStore.instance) {
      const configDir = ensureConfigDirSync();
      const defaultPath = path.join(configDir, 'tasks.db');
      TaskStore.instance = new TaskStore(dbPath || defaultPath);
    }
    return TaskStore.instance;
  }

  /**
   * Create a new instance (for testing)
   */
  static create(dbPath: string): TaskStore {
    return new TaskStore(dbPath);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    if (TaskStore.instance === this) {
      TaskStore.instance = null;
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        path TEXT NOT NULL UNIQUE,
        depth INTEGER NOT NULL,
        sibling_order INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        context TEXT,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_path ON tasks(path);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_order ON tasks(parent_id, sibling_order);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      CREATE TABLE IF NOT EXISTS task_context_versions (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        context TEXT NOT NULL,
        changed_at INTEGER NOT NULL,
        changed_by TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_context_task ON task_context_versions(task_id);
    `);
  }

  /**
   * Create a new task
   */
  create(input: CreateTaskInput, changedBy = 'user'): Task {
    const id = nanoid();
    const now = Date.now();

    // Wrap entire create in transaction to prevent race conditions
    const createTx = this.db.transaction(() => {
      let parentPath = '';
      let depth = 0;

      if (input.parentId) {
        const parent = this.get(input.parentId);
        if (!parent) {
          throw new Error(`Parent task not found: ${input.parentId}`);
        }
        parentPath = parent.path;
        depth = parent.depth + 1;
      }

      // Calculate sibling order (append at end) - safe within transaction
      const maxOrderStmt = this.db.prepare(`
        SELECT MAX(sibling_order) as max_order FROM tasks
        WHERE parent_id IS ?
      `);
      const maxOrderResult = maxOrderStmt.get(input.parentId ?? null) as { max_order: number | null };
      const siblingOrder = (maxOrderResult?.max_order ?? -1) + 1;

      const taskPath = parentPath ? `${parentPath}/${id}` : `/${id}`;

      const stmt = this.db.prepare(`
        INSERT INTO tasks (id, parent_id, path, depth, sibling_order, name, context, metadata, status, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)
      `);

      stmt.run(
        id,
        input.parentId ?? null,
        taskPath,
        depth,
        siblingOrder,
        input.name,
        input.context ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        now
      );

      // Record initial context version if context provided
      if (input.context) {
        this.recordContextVersion(id, input.context, changedBy);
      }
    });

    createTx();
    return this.get(id)!;
  }

  /**
   * Get task by ID
   */
  get(id: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  /**
   * Get task with resolved context (merged from ancestors)
   */
  getWithContext(id: string, maxAncestorLevels = 3): TaskWithResolvedContext | null {
    const task = this.get(id);
    if (!task) return null;

    // Get ancestors using path
    const ancestors = this.getAncestors(id, maxAncestorLevels);

    // Merge context: ancestors first (oldest to newest), then current task
    const contextParts: string[] = [];
    for (const ancestor of ancestors.reverse()) {
      if (ancestor.context) {
        contextParts.push(`[${ancestor.name}]\n${ancestor.context}`);
      }
    }
    if (task.context) {
      contextParts.push(`[${task.name}]\n${task.context}`);
    }

    return {
      ...task,
      resolvedContext: contextParts.join('\n\n---\n\n'),
      ancestors: ancestors.map(a => ({ id: a.id, name: a.name, context: a.context })),
    };
  }

  /**
   * Get ancestors of a task
   */
  getAncestors(id: string, maxLevels?: number): Task[] {
    const task = this.get(id);
    if (!task || !task.parentId) return [];

    // Use recursive CTE for ancestor query
    // Validate maxLevels to prevent SQL injection
    const safeMaxLevels = maxLevels ? Math.min(Math.max(Math.floor(maxLevels), 1), 100) : null;
    const limitClause = safeMaxLevels ? `LIMIT ${safeMaxLevels}` : '';
    const stmt = this.db.prepare(`
      WITH RECURSIVE ancestors AS (
        SELECT * FROM tasks WHERE id = ?
        UNION ALL
        SELECT t.* FROM tasks t
        INNER JOIN ancestors a ON t.id = a.parent_id
      )
      SELECT * FROM ancestors WHERE id != ?
      ORDER BY depth DESC
      ${limitClause}
    `);

    const rows = stmt.all(task.parentId, id) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * Get children of a task
   */
  getChildren(parentId: string | null): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE parent_id IS ? AND status != 'deleted'
      ORDER BY sibling_order ASC
    `);
    const rows = stmt.all(parentId ?? null) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * Get descendants of a task (full subtree)
   */
  getDescendants(id: string): Task[] {
    const task = this.get(id);
    if (!task) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE path LIKE ? AND id != ? AND status != 'deleted'
      ORDER BY path ASC
    `);
    const rows = stmt.all(`${task.path}/%`, id) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * Get root tasks (no parent)
   */
  getRoots(): Task[] {
    return this.getChildren(null);
  }

  /**
   * Get full task tree
   */
  getTree(): TaskTreeNode[] {
    const allTasks = this.db.prepare(`
      SELECT * FROM tasks WHERE status != 'deleted' ORDER BY depth ASC, sibling_order ASC
    `).all() as TaskRow[];

    const taskMap = new Map<string, TaskTreeNode>();
    const roots: TaskTreeNode[] = [];

    // First pass: create all nodes
    for (const row of allTasks) {
      const task = rowToTask(row);
      taskMap.set(task.id, { ...task, children: [] });
    }

    // Second pass: build tree structure
    for (const row of allTasks) {
      const node = taskMap.get(row.id)!;
      if (row.parent_id) {
        const parent = taskMap.get(row.parent_id);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Update a task
   */
  update(id: string, input: UpdateTaskInput, changedBy = 'user'): Task {
    const task = this.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const now = Date.now();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }

    if (input.context !== undefined) {
      updates.push('context = ?');
      values.push(input.context);
      // Record context version
      if (input.context !== task.context) {
        this.recordContextVersion(id, input.context, changedBy);
      }
    }

    if (input.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(input.metadata ? JSON.stringify(input.metadata) : null);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }

    if (input.siblingOrder !== undefined) {
      updates.push('sibling_order = ?');
      values.push(input.siblingOrder);
    }

    // Handle reparenting
    if (input.parentId !== undefined && input.parentId !== task.parentId) {
      this.reparent(id, input.parentId);
      return this.get(id)!;
    }

    if (updates.length === 0) {
      return task;
    }

    updates.push('version = version + 1');
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tasks SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.get(id)!;
  }

  /**
   * Move task to new parent (reparent)
   */
  private reparent(id: string, newParentId: string | null): void {
    const task = this.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    // Prevent circular reference
    if (newParentId) {
      const descendants = this.getDescendants(id);
      if (descendants.some(d => d.id === newParentId)) {
        throw new Error('Cannot move task to its own descendant');
      }
    }

    let newPath: string;
    let newDepth: number;

    if (newParentId) {
      const parent = this.get(newParentId);
      if (!parent) {
        throw new Error(`New parent not found: ${newParentId}`);
      }
      newPath = `${parent.path}/${id}`;
      newDepth = parent.depth + 1;
    } else {
      newPath = `/${id}`;
      newDepth = 0;
    }

    const oldPath = task.path;
    const depthDiff = newDepth - task.depth;

    // Update task and all descendants in a transaction
    this.db.transaction(() => {
      // Update the task itself
      const updateStmt = this.db.prepare(`
        UPDATE tasks
        SET parent_id = ?, path = ?, depth = ?, version = version + 1, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(newParentId, newPath, newDepth, Date.now(), id);

      // Update all descendants
      const updateDescendantsStmt = this.db.prepare(`
        UPDATE tasks
        SET path = ? || substr(path, ?), depth = depth + ?, version = version + 1, updated_at = ?
        WHERE path LIKE ? AND id != ?
      `);
      updateDescendantsStmt.run(
        newPath,
        oldPath.length + 1,
        depthDiff,
        Date.now(),
        `${oldPath}/%`,
        id
      );
    })();
  }

  /**
   * Delete task (soft delete)
   */
  delete(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET status = 'deleted', version = version + 1, updated_at = ?
      WHERE id = ? OR path LIKE ?
    `);
    const task = this.get(id);
    if (task) {
      stmt.run(Date.now(), id, `${task.path}/%`);
    }
  }

  /**
   * Hard delete (permanent)
   */
  hardDelete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Record context version
   */
  private recordContextVersion(taskId: string, context: string, changedBy: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO task_context_versions (id, task_id, context, changed_at, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(nanoid(), taskId, context, Date.now(), changedBy);
  }

  /**
   * Get context history for a task
   */
  getContextHistory(taskId: string): ContextVersion[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_context_versions
      WHERE task_id = ?
      ORDER BY changed_at DESC
    `);
    const rows = stmt.all(taskId) as ContextVersionRow[];
    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      context: row.context,
      changedAt: row.changed_at,
      changedBy: row.changed_by,
    }));
  }

  /**
   * Search tasks by name
   */
  search(query: string, status: TaskStatus = 'active'): Task[] {
    // Escape LIKE wildcards to prevent unintended matches
    const escapedQuery = query.replace(/[%_]/g, (char) => `\\${char}`);
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE name LIKE ? ESCAPE '\\' AND status = ?
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all(`%${escapedQuery}%`, status) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * Get statistics
   */
  getStats(): { total: number; active: number; archived: number; maxDepth: number } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
        MAX(depth) as max_depth
      FROM tasks WHERE status != 'deleted'
    `).get() as { total: number; active: number; archived: number; max_depth: number };

    return {
      total: stats.total,
      active: stats.active,
      archived: stats.archived,
      maxDepth: stats.max_depth ?? 0,
    };
  }
}
