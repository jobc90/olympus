import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { nanoid } from 'nanoid';
import os from 'os';
import path from 'path';
import {
  assertTaskStatusTransition,
  type CreateTaskAuthorityTaskInput,
  type TaskArtifactKind,
  type TaskAuthorityStatus,
  type TaskAuthorityTask,
  type TaskDependencyEdge,
  type TaskExecutionLock,
  type TaskPreemptionEvent,
  type TaskQueueEntry,
} from '@olympus-dev/protocol';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.olympus');

function ensureConfigDirSync(configDir: string = DEFAULT_CONFIG_DIR): string {
  mkdirSync(configDir, { recursive: true });
  return configDir;
}

interface TaskRow {
  id: string;
  display_label: string;
  title: string;
  kind: 'parent' | 'project';
  status: TaskAuthorityStatus;
  project_id: string | null;
  parent_task_id: string | null;
  assigned_worker_id: string | null;
  priority: number;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

interface QueueRow {
  id: string;
  project_id: string;
  task_id: string;
  priority: number;
  inserted_at: number;
  assigned_at: number | null;
  assigned_worker_id: string | null;
}

interface PreemptionRow {
  id: string;
  project_id: string;
  preempted_task_id: string;
  replacement_task_id: string;
  actor: string;
  reason: string;
  created_at: number;
}

interface ArtifactRow {
  id: string;
  task_id: string;
  project_id: string;
  artifact_kind: TaskArtifactKind;
  storage_scope: 'central' | 'local';
  file_path: string;
  created_at: number;
}

export interface RegisterTaskArtifactInput {
  taskId: string;
  projectId: string;
  artifactKind: TaskArtifactKind;
  storageScope: 'central' | 'local';
  filePath: string;
}

export interface RegisteredTaskArtifact extends RegisterTaskArtifactInput {
  id: string;
  createdAt: number;
}

export interface SoftPreemptTaskInput {
  projectId: string;
  activeTaskId: string;
  replacementTaskId: string;
  actor: string;
  reason: string;
  assignedWorkerId?: string | null;
}

function rowToTask(row: TaskRow): TaskAuthorityTask {
  return {
    id: row.id,
    displayLabel: row.display_label,
    title: row.title,
    kind: row.kind,
    status: row.status,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    assignedWorkerId: row.assigned_worker_id,
    priority: row.priority,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToQueueEntry(row: QueueRow): TaskQueueEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    priority: row.priority,
    insertedAt: row.inserted_at,
    assignedAt: row.assigned_at,
    assignedWorkerId: row.assigned_worker_id,
  };
}

function rowToPreemptionEvent(row: PreemptionRow): TaskPreemptionEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    preemptedTaskId: row.preempted_task_id,
    replacementTaskId: row.replacement_task_id,
    actor: row.actor,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function rowToArtifact(row: ArtifactRow): RegisteredTaskArtifact {
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    artifactKind: row.artifact_kind,
    storageScope: row.storage_scope,
    filePath: row.file_path,
    createdAt: row.created_at,
  };
}

export class TaskAuthorityStore {
  private db: Database.Database;
  private static instance: TaskAuthorityStore | null = null;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  static getInstance(dbPath?: string): TaskAuthorityStore {
    if (!TaskAuthorityStore.instance) {
      const configDir = ensureConfigDirSync();
      const defaultPath = path.join(configDir, 'task-authority.db');
      TaskAuthorityStore.instance = new TaskAuthorityStore(dbPath || defaultPath);
    }
    return TaskAuthorityStore.instance;
  }

  static create(dbPath: string): TaskAuthorityStore {
    return new TaskAuthorityStore(dbPath);
  }

  close(): void {
    this.db.close();
    if (TaskAuthorityStore.instance === this) {
      TaskAuthorityStore.instance = null;
    }
  }

  private runMigrations(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version >= 1) return;

    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS task_authority_tasks (
          id TEXT PRIMARY KEY,
          display_label TEXT NOT NULL,
          title TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('parent', 'project')),
          status TEXT NOT NULL CHECK(status IN ('draft', 'ready', 'assigned', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled')),
          project_id TEXT,
          parent_task_id TEXT REFERENCES task_authority_tasks(id) ON DELETE SET NULL,
          assigned_worker_id TEXT,
          priority INTEGER NOT NULL DEFAULT 0,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_authority_tasks_project_status
        ON task_authority_tasks(project_id, status);

        CREATE TABLE IF NOT EXISTS task_authority_dependencies (
          id TEXT PRIMARY KEY,
          from_task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          to_task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('depends_on', 'blocks')),
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_authority_queue (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          priority INTEGER NOT NULL,
          inserted_at INTEGER NOT NULL,
          assigned_at INTEGER,
          assigned_worker_id TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_task_authority_queue_project_order
        ON task_authority_queue(project_id, assigned_at, priority DESC, inserted_at ASC);

        CREATE TABLE IF NOT EXISTS task_authority_locks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          released_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS task_authority_preemptions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          preempted_task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          replacement_task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          actor TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_authority_artifacts (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES task_authority_tasks(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,
          artifact_kind TEXT NOT NULL,
          storage_scope TEXT NOT NULL CHECK(storage_scope IN ('central', 'local')),
          file_path TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_authority_artifacts_task
        ON task_authority_artifacts(task_id, artifact_kind, storage_scope);
      `);
      this.db.pragma('user_version = 1');
    })();
  }

  createTask(input: CreateTaskAuthorityTaskInput): TaskAuthorityTask {
    const now = Date.now();
    const id = input.id ?? nanoid();

    this.db.prepare(`
      INSERT INTO task_authority_tasks (
        id, display_label, title, kind, status, project_id, parent_task_id,
        assigned_worker_id, priority, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, NULL, ?, ?, ?, ?)
    `).run(
      id,
      input.displayLabel,
      input.title,
      input.kind,
      input.projectId ?? null,
      input.parentTaskId ?? null,
      input.priority ?? 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now,
    );

    return this.getTask(id)!;
  }

  getTask(id: string): TaskAuthorityTask | null {
    const row = this.db.prepare('SELECT * FROM task_authority_tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  listTasks(projectId?: string): TaskAuthorityTask[] {
    const rows = projectId
      ? this.db.prepare(`
        SELECT * FROM task_authority_tasks
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `).all(projectId) as TaskRow[]
      : this.db.prepare(`
        SELECT * FROM task_authority_tasks
        ORDER BY updated_at DESC, created_at DESC
      `).all() as TaskRow[];

    return rows.map(rowToTask);
  }

  transitionTask(
    taskId: string,
    nextStatus: TaskAuthorityStatus,
    options: { assignedWorkerId?: string | null } = {},
  ): TaskAuthorityTask {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    assertTaskStatusTransition(task.status, nextStatus);
    const now = Date.now();
    const assignedWorkerId =
      options.assignedWorkerId !== undefined ? options.assignedWorkerId : task.assignedWorkerId;

    this.db.prepare(`
      UPDATE task_authority_tasks
      SET status = ?, assigned_worker_id = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, assignedWorkerId ?? null, now, taskId);

    return this.getTask(taskId)!;
  }

  createDependency(fromTaskId: string, toTaskId: string, type: 'depends_on' | 'blocks' = 'depends_on'): TaskDependencyEdge {
    const edge: TaskDependencyEdge = {
      id: nanoid(),
      fromTaskId,
      toTaskId,
      type,
      createdAt: Date.now(),
    };
    this.db.prepare(`
      INSERT INTO task_authority_dependencies (id, from_task_id, to_task_id, type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(edge.id, edge.fromTaskId, edge.toTaskId, edge.type, edge.createdAt);
    return edge;
  }

  enqueueTask(taskId: string): TaskQueueEntry {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.projectId) throw new Error(`Project task required for queueing: ${taskId}`);

    const entry: TaskQueueEntry = {
      id: nanoid(),
      projectId: task.projectId,
      taskId: task.id,
      priority: task.priority,
      insertedAt: Date.now(),
      assignedAt: null,
      assignedWorkerId: null,
    };

    this.db.prepare(`
      INSERT INTO task_authority_queue (
        id, project_id, task_id, priority, inserted_at, assigned_at, assigned_worker_id
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
    `).run(entry.id, entry.projectId, entry.taskId, entry.priority, entry.insertedAt);

    return entry;
  }

  claimNextQueuedTask(projectId: string, workerId: string): TaskQueueEntry | null {
    const claimTx = this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT * FROM task_authority_queue
        WHERE project_id = ? AND assigned_at IS NULL
        ORDER BY priority DESC, inserted_at ASC
        LIMIT 1
      `).get(projectId) as QueueRow | undefined;

      if (!row) return null;

      const task = this.getTask(row.task_id);
      if (!task) {
        throw new Error(`Task not found for queue entry: ${row.task_id}`);
      }

      const assignedAt = Date.now();
      this.db.prepare(`
        UPDATE task_authority_queue
        SET assigned_at = ?, assigned_worker_id = ?
        WHERE id = ?
      `).run(assignedAt, workerId, row.id);

      if (task.status === 'ready') {
        this.transitionTask(task.id, 'assigned', { assignedWorkerId: workerId });
      }

      const updatedRow = this.db.prepare('SELECT * FROM task_authority_queue WHERE id = ?').get(row.id) as QueueRow;
      return rowToQueueEntry(updatedRow);
    });

    return claimTx();
  }

  acquireProjectLock(projectId: string, taskId: string, reason: string): TaskExecutionLock {
    const lock: TaskExecutionLock = {
      id: nanoid(),
      projectId,
      taskId,
      reason,
      createdAt: Date.now(),
      releasedAt: null,
    };
    this.db.prepare(`
      INSERT INTO task_authority_locks (id, project_id, task_id, reason, created_at, released_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(lock.id, lock.projectId, lock.taskId, lock.reason, lock.createdAt);
    return lock;
  }

  releaseProjectLocks(projectId: string): void {
    this.db.prepare(`
      UPDATE task_authority_locks
      SET released_at = ?
      WHERE project_id = ? AND released_at IS NULL
    `).run(Date.now(), projectId);
  }

  softPreemptTask(input: SoftPreemptTaskInput): TaskPreemptionEvent {
    const tx = this.db.transaction(() => {
      const activeTask = this.getTask(input.activeTaskId);
      const replacementTask = this.getTask(input.replacementTaskId);
      if (!activeTask || !replacementTask) {
        throw new Error('Preemption tasks must exist');
      }

      this.transitionTask(activeTask.id, 'blocked');
      this.transitionTask(replacementTask.id, 'assigned', {
        assignedWorkerId: input.assignedWorkerId ?? null,
      });

      const event: TaskPreemptionEvent = {
        id: nanoid(),
        projectId: input.projectId,
        preemptedTaskId: input.activeTaskId,
        replacementTaskId: input.replacementTaskId,
        actor: input.actor,
        reason: input.reason,
        createdAt: Date.now(),
      };

      this.db.prepare(`
        INSERT INTO task_authority_preemptions (
          id, project_id, preempted_task_id, replacement_task_id, actor, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.projectId,
        event.preemptedTaskId,
        event.replacementTaskId,
        event.actor,
        event.reason,
        event.createdAt,
      );

      return event;
    });

    return tx();
  }

  listPreemptionEvents(projectId: string): TaskPreemptionEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM task_authority_preemptions
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(projectId) as PreemptionRow[];
    return rows.map(rowToPreemptionEvent);
  }

  registerArtifact(input: RegisterTaskArtifactInput): RegisteredTaskArtifact {
    const artifact: RegisteredTaskArtifact = {
      id: nanoid(),
      ...input,
      createdAt: Date.now(),
    };
    this.db.prepare(`
      INSERT INTO task_authority_artifacts (
        id, task_id, project_id, artifact_kind, storage_scope, file_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      artifact.id,
      artifact.taskId,
      artifact.projectId,
      artifact.artifactKind,
      artifact.storageScope,
      artifact.filePath,
      artifact.createdAt,
    );
    return artifact;
  }

  listArtifacts(taskId: string): RegisteredTaskArtifact[] {
    const rows = this.db.prepare(`
      SELECT * FROM task_authority_artifacts
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId) as ArtifactRow[];
    return rows.map(rowToArtifact);
  }
}
