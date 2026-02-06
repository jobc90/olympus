/**
 * ContextStore - SQLite-backed Context OS Storage
 *
 * Provides persistent storage for hierarchical context with:
 * - Three-tier scopes: workspace → project → task
 * - Merge workflow for context synchronization
 * - Edge-based relationships (parent, reports_to, derived_from)
 * - Version history with optimistic locking
 * - Async operation tracking
 * - WAL mode for concurrent access
 */

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  Context,
  ContextScope,
  ContextStatus,
  CreateContextInput,
  UpdateContextInput,
  ContextVersionEntry,
  ContextMerge,
  ContextMergeStatus,
  ContextEdge,
  ContextEdgeType,
  ContextTreeNode,
  Operation,
  OperationStatus,
} from '@olympus-dev/protocol';
import { mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.olympus');
const MAX_VERSIONS_PER_CONTEXT = 100;

function ensureConfigDirSync(configDir: string = DEFAULT_CONFIG_DIR): string {
  mkdirSync(configDir, { recursive: true });
  return configDir;
}

// Database row types (internal only)
interface ContextRow {
  id: string;
  scope: string;
  path: string;
  parent_id: string | null;
  status: string;
  summary: string | null;
  content: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ContextEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  created_at: string;
}

interface ContextVersionRow {
  id: string;
  context_id: string;
  base_version: number;
  content: string;
  summary: string | null;
  reason: string | null;
  actor: string;
  created_at: string;
}

interface ContextMergeRow {
  id: string;
  source_id: string;
  target_id: string;
  status: string;
  diff: string | null;
  resolution: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

interface OperationRow {
  id: string;
  type: string;
  status: string;
  context_id: string;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Row to Protocol mappers
function rowToContext(row: ContextRow): Context {
  return {
    id: row.id,
    scope: row.scope as ContextScope,
    path: row.path,
    parentId: row.parent_id,
    status: row.status as ContextStatus,
    summary: row.summary,
    content: row.content,
    version: row.version,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToContextEdge(row: ContextEdgeRow): ContextEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    edgeType: row.edge_type as ContextEdgeType,
    createdAt: row.created_at,
  };
}

function rowToContextVersion(row: ContextVersionRow): ContextVersionEntry {
  return {
    id: row.id,
    contextId: row.context_id,
    baseVersion: row.base_version,
    content: row.content,
    summary: row.summary,
    reason: row.reason,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

function rowToContextMerge(row: ContextMergeRow): ContextMerge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    status: row.status as ContextMergeStatus,
    diff: row.diff,
    resolution: row.resolution,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToOperation(row: OperationRow): Operation {
  return {
    id: row.id,
    type: row.type as 'merge' | 'report_upstream',
    status: row.status as OperationStatus,
    contextId: row.context_id,
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ContextStore {
  private db: Database.Database;
  private static instance: ContextStore | null = null;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
    this.runMigrations();
  }

  /**
   * Get singleton instance
   */
  static getInstance(dbPath?: string): ContextStore {
    if (!ContextStore.instance) {
      const configDir = ensureConfigDirSync();
      const defaultPath = path.join(configDir, 'contexts.db');
      ContextStore.instance = new ContextStore(dbPath || defaultPath);
    }
    return ContextStore.instance;
  }

  /**
   * Create a new instance (for testing)
   */
  static create(dbPath: string): ContextStore {
    return new ContextStore(dbPath);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    if (ContextStore.instance === this) {
      ContextStore.instance = null;
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK(scope IN ('workspace','project','task')),
        path TEXT NOT NULL,
        parent_id TEXT REFERENCES contexts(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','deleted')),
        summary TEXT,
        content TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contexts_scope_path ON contexts(scope, path) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_contexts_parent ON contexts(parent_id);

      CREATE TABLE IF NOT EXISTS context_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL CHECK(edge_type IN ('parent','reports_to','derived_from')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(source_id, target_id, edge_type)
      );

      CREATE TABLE IF NOT EXISTS context_versions (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        base_version INTEGER NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        reason TEXT,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_context_versions_ctx ON context_versions(context_id, base_version);

      CREATE TABLE IF NOT EXISTS context_merges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected','applied','conflict')),
        diff TEXT,
        resolution TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('merge','report_upstream')),
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','canceled')),
        context_id TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  private runMigrations(): void {
    const currentVersion = this.db.pragma('user_version', { simple: true }) as number;

    // Future migrations can be added here
    // Example:
    // if (currentVersion < 1) {
    //   this.db.exec('ALTER TABLE contexts ADD COLUMN new_field TEXT;');
    //   this.db.pragma('user_version = 1');
    // }

    // Currently no migrations needed - schema is v0
  }

  /**
   * Create a new context
   */
  create(input: CreateContextInput, actor = 'user'): Context {
    const id = nanoid();
    const now = new Date().toISOString();

    const createTx = this.db.transaction(() => {
      if (input.scope === 'workspace' && input.parentId) {
        throw new Error('Workspace context cannot have a parent');
      }
      if ((input.scope === 'project' || input.scope === 'task') && !input.parentId) {
        throw new Error(`${input.scope} context requires parentId`);
      }

      // Validate parent exists if specified
      if (input.parentId) {
        const parent = this.getById(input.parentId);
        if (!parent) {
          throw new Error(`Parent context not found: ${input.parentId}`);
        }
        const expectedParentScope: Record<ContextScope, ContextScope | null> = {
          workspace: null,
          project: 'workspace',
          task: 'project',
        };
        const requiredScope = expectedParentScope[input.scope];
        if (requiredScope && parent.scope !== requiredScope) {
          throw new Error(`Invalid scope hierarchy: ${input.scope} must be child of ${requiredScope}`);
        }
      }

      // Check for duplicate path in same scope (unless deleted)
      const existing = this.getByPath(input.scope, input.path);
      if (existing) {
        throw new Error(`Context already exists: ${input.scope}:${input.path}`);
      }

      const stmt = this.db.prepare(`
        INSERT INTO contexts (id, scope, path, parent_id, status, summary, content, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, 1, ?, ?)
      `);

      stmt.run(
        id,
        input.scope,
        input.path,
        input.parentId ?? null,
        input.summary ?? null,
        input.content ?? null,
        now,
        now
      );

      // Record initial version if content provided
      if (input.content) {
        this.recordVersion(id, 1, input.content, input.summary ?? null, 'initial creation', actor);
      }

      // Create parent edge if parent specified
      if (input.parentId) {
        this.addEdge(input.parentId, id, 'parent');
      }
    });

    createTx();
    return this.getById(id)!;
  }

  /**
   * Get context by ID
   */
  getById(id: string): Context | null {
    const stmt = this.db.prepare('SELECT * FROM contexts WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as ContextRow | undefined;
    return row ? rowToContext(row) : null;
  }

  /**
   * Get all contexts (optionally filtered by scope and parent)
   */
  getAll(scope?: ContextScope, parentId?: string | null): Context[] {
    let query = 'SELECT * FROM contexts WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (scope) {
      query += ' AND scope = ?';
      params.push(scope);
    }

    if (parentId !== undefined) {
      query += ' AND parent_id IS ?';
      params.push(parentId);
    }

    query += ' ORDER BY created_at ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as ContextRow[];
    return rows.map(rowToContext);
  }

  /**
   * Get context by scope and path
   */
  getByPath(scope: ContextScope, path: string): Context | null {
    const stmt = this.db.prepare('SELECT * FROM contexts WHERE scope = ? AND path = ? AND deleted_at IS NULL');
    const row = stmt.get(scope, path) as ContextRow | undefined;
    return row ? rowToContext(row) : null;
  }

  /**
   * Update a context with optimistic locking
   */
  update(id: string, input: UpdateContextInput, actor = 'user'): Context {
    const context = this.getById(id);
    if (!context) {
      throw new Error(`Context not found: ${id}`);
    }

    // Optimistic locking check
    if (input.expectedVersion !== context.version) {
      throw new Error(
        `Version mismatch: expected ${input.expectedVersion}, current ${context.version}`
      );
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.summary !== undefined) {
      updates.push('summary = ?');
      values.push(input.summary);
    }

    if (input.content !== undefined) {
      updates.push('content = ?');
      values.push(input.content);
      // Record version if content changed
      if (input.content !== context.content) {
        this.recordVersion(id, context.version, input.content, input.summary ?? null, 'content update', actor);
      }
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
      if (input.status === 'deleted') {
        updates.push('deleted_at = ?');
        values.push(now);
      }
    }

    if (updates.length === 0) {
      return context;
    }

    updates.push('version = version + 1');
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE contexts SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.getById(id)!;
  }

  /**
   * Delete context (soft delete)
   */
  delete(id: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE contexts SET status = 'deleted', deleted_at = ?, version = version + 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(now, now, id);
  }

  /**
   * Get version history for a context
   */
  getVersionHistory(contextId: string, limit = 100): ContextVersionEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM context_versions
      WHERE context_id = ?
      ORDER BY base_version DESC
      LIMIT ?
    `);
    const rows = stmt.all(contextId, limit) as ContextVersionRow[];
    return rows.map(rowToContextVersion);
  }

  /**
   * Record a version entry (private)
   */
  private recordVersion(
    contextId: string,
    baseVersion: number,
    content: string,
    summary: string | null,
    reason: string | null,
    actor: string
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO context_versions (id, context_id, base_version, content, summary, reason, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(nanoid(), contextId, baseVersion, content, summary, reason, actor, now);

    // Prune old versions if exceeding max
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM context_versions WHERE context_id = ?');
    const { count } = countStmt.get(contextId) as { count: number };

    if (count > MAX_VERSIONS_PER_CONTEXT) {
      const deleteStmt = this.db.prepare(`
        DELETE FROM context_versions
        WHERE context_id = ? AND id NOT IN (
          SELECT id FROM context_versions
          WHERE context_id = ?
          ORDER BY base_version DESC
          LIMIT ?
        )
      `);
      deleteStmt.run(contextId, contextId, MAX_VERSIONS_PER_CONTEXT);
    }
  }

  /**
   * Add an edge between contexts
   */
  addEdge(sourceId: string, targetId: string, edgeType: ContextEdgeType): ContextEdge {
    const id = nanoid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO context_edges (id, source_id, target_id, edge_type, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, edge_type) DO NOTHING
    `);
    stmt.run(id, sourceId, targetId, edgeType, now);

    const getStmt = this.db.prepare('SELECT * FROM context_edges WHERE source_id = ? AND target_id = ? AND edge_type = ?');
    const row = getStmt.get(sourceId, targetId, edgeType) as ContextEdgeRow;
    return rowToContextEdge(row);
  }

  /**
   * Get edges for a context
   */
  getEdges(contextId: string, edgeType?: ContextEdgeType): ContextEdge[] {
    let query = 'SELECT * FROM context_edges WHERE source_id = ? OR target_id = ?';
    const params: unknown[] = [contextId, contextId];

    if (edgeType) {
      query += ' AND edge_type = ?';
      params.push(edgeType);
    }

    query += ' ORDER BY created_at ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as ContextEdgeRow[];
    return rows.map(rowToContextEdge);
  }

  /**
   * Get children contexts
   */
  getChildren(parentId: string | null): Context[] {
    return this.getAll(undefined, parentId);
  }

  /**
   * Create a merge request
   */
  createMerge(sourceId: string, targetId: string, idempotencyKey?: string): ContextMerge {
    const id = nanoid();
    const now = new Date().toISOString();

    // Validate source and target exist
    if (!this.getById(sourceId)) {
      throw new Error(`Source context not found: ${sourceId}`);
    }
    if (!this.getById(targetId)) {
      throw new Error(`Target context not found: ${targetId}`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO context_merges (id, source_id, target_id, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `);

    stmt.run(id, sourceId, targetId, idempotencyKey ?? null, now, now);
    return this.getMerge(id)!;
  }

  /**
   * Get merge by ID
   */
  getMerge(id: string): ContextMerge | null {
    const stmt = this.db.prepare('SELECT * FROM context_merges WHERE id = ?');
    const row = stmt.get(id) as ContextMergeRow | undefined;
    return row ? rowToContextMerge(row) : null;
  }

  /**
   * Get merges for a target context
   */
  getMergesForTarget(targetId: string, status?: ContextMergeStatus): ContextMerge[] {
    let query = 'SELECT * FROM context_merges WHERE target_id = ?';
    const params: unknown[] = [targetId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as ContextMergeRow[];
    return rows.map(rowToContextMerge);
  }

  /**
   * Update merge status
   */
  updateMergeStatus(id: string, status: ContextMergeStatus, resolution?: string): ContextMerge {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE context_merges
      SET status = ?, resolution = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(status, resolution ?? null, now, id);
    return this.getMerge(id)!;
  }

  /**
   * Apply a merge: update target content, set status to 'applied', record version
   */
  applyMerge(mergeId: string, actor = 'system'): Context {
    const merge = this.getMerge(mergeId);
    if (!merge) {
      throw new Error(`Merge not found: ${mergeId}`);
    }

    if (merge.status !== 'approved' && merge.status !== 'pending') {
      throw new Error(`Cannot apply merge with status: ${merge.status}`);
    }

    const source = this.getById(merge.sourceId);
    const target = this.getById(merge.targetId);

    if (!source || !target) {
      throw new Error('Source or target context not found');
    }

    const applyTx = this.db.transaction(() => {
      // Update target context with source content
      const now = new Date().toISOString();
      const updateStmt = this.db.prepare(`
        UPDATE contexts
        SET content = ?, summary = ?, version = version + 1, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(source.content, source.summary, now, target.id);

      // Record version with merge reference
      this.recordVersion(
        target.id,
        target.version,
        source.content ?? '',
        source.summary,
        `Applied merge from ${source.id}`,
        `merge:${mergeId}`
      );

      // Update merge status to applied
      this.updateMergeStatus(mergeId, 'applied', merge.resolution ?? undefined);
    });

    applyTx();
    return this.getById(target.id)!;
  }

  /**
   * Create an operation
   */
  createOperation(type: 'merge' | 'report_upstream', contextId: string): Operation {
    const id = nanoid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO operations (id, type, status, context_id, created_at, updated_at)
      VALUES (?, ?, 'queued', ?, ?, ?)
    `);
    stmt.run(id, type, contextId, now, now);
    return this.getOperation(id)!;
  }

  /**
   * Get operation by ID
   */
  getOperation(id: string): Operation | null {
    const stmt = this.db.prepare('SELECT * FROM operations WHERE id = ?');
    const row = stmt.get(id) as OperationRow | undefined;
    return row ? rowToOperation(row) : null;
  }

  /**
   * Update operation status
   */
  updateOperationStatus(id: string, status: OperationStatus, result?: string, error?: string): Operation {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE operations
      SET status = ?, result = ?, error = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(status, result ?? null, error ?? null, now, id);
    return this.getOperation(id)!;
  }

  /**
   * Get context tree (all scopes or filtered by scope)
   */
  getTree(scope?: ContextScope): ContextTreeNode[] {
    let query = 'SELECT * FROM contexts WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (scope) {
      query += ' AND scope = ?';
      params.push(scope);
    }

    query += ' ORDER BY scope ASC, created_at ASC';

    const stmt = this.db.prepare(query);
    const allContexts = stmt.all(...params) as ContextRow[];

    const contextMap = new Map<string, ContextTreeNode>();
    const roots: ContextTreeNode[] = [];

    // First pass: create all nodes
    for (const row of allContexts) {
      const context = rowToContext(row);
      contextMap.set(context.id, { ...context, children: [] });
    }

    // Second pass: build tree structure
    for (const row of allContexts) {
      const node = contextMap.get(row.id)!;
      if (row.parent_id) {
        const parent = contextMap.get(row.parent_id);
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
   * Get ancestors of a context
   */
  getAncestors(id: string): Context[] {
    const context = this.getById(id);
    if (!context || !context.parentId) return [];

    // Use recursive CTE for ancestor query
    const stmt = this.db.prepare(`
      WITH RECURSIVE ancestors AS (
        SELECT * FROM contexts WHERE id = ?
        UNION ALL
        SELECT c.* FROM contexts c
        INNER JOIN ancestors a ON c.id = a.parent_id
      )
      SELECT * FROM ancestors WHERE id != ? AND deleted_at IS NULL
      ORDER BY scope ASC
    `);

    const rows = stmt.all(context.parentId, id) as ContextRow[];
    return rows.map(rowToContext);
  }

  /**
   * Seed workspace context if not exists
   */
  seedWorkspace(workspacePath: string): Context {
    const existing = this.getByPath('workspace', workspacePath);
    if (existing) {
      return existing;
    }

    return this.create({
      scope: 'workspace',
      path: workspacePath,
      summary: `Workspace: ${workspacePath}`,
      content: `Root workspace context for ${workspacePath}`,
    }, 'system');
  }

  /**
   * Seed project context under workspace
   */
  seedProject(workspacePath: string, projectPath: string): Context {
    const workspace = this.seedWorkspace(workspacePath);

    const existing = this.getByPath('project', projectPath);
    if (existing) {
      return existing;
    }

    const project = this.create({
      scope: 'project',
      path: projectPath,
      parentId: workspace.id,
      summary: `Project: ${projectPath}`,
      content: `Project context for ${projectPath}`,
    }, 'system');

    // Edge is already created in create() method
    return project;
  }
}
