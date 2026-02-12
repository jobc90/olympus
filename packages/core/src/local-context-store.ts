/**
 * LocalContextStore — SQLite 기반 워커 컨텍스트 저장소
 *
 * 프로젝트 레벨 DB: {project}/.olympus/context.db
 * 루트 레벨 DB:     {root}/.olympus/context.db
 *
 * better-sqlite3 dynamic import + graceful degradation
 */

import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  WorkerContextRecord,
  ProjectContextSnapshot,
  RootProjectEntry,
  LocalContextStoreConfig,
  ContextInjection,
} from '@olympus-dev/protocol';
import { DEFAULT_LOCAL_CONTEXT_CONFIG } from '@olympus-dev/protocol';

// ---------- Helpers ----------

function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (val == null || val === '') return fallback;
  try {
    return JSON.parse(String(val)) as T;
  } catch {
    return fallback;
  }
}

function safeJsonString(val: unknown): string {
  try {
    return JSON.stringify(val ?? []);
  } catch {
    return '[]';
  }
}

// ---------- Schema ----------

const PROJECT_SCHEMA = `
CREATE TABLE IF NOT EXISTS worker_contexts (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  task_id TEXT,
  prompt TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  files_changed TEXT,
  decisions TEXT,
  errors TEXT,
  dependencies TEXT,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  num_turns INTEGER DEFAULT 0,
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_context (
  id TEXT PRIMARY KEY DEFAULT 'main',
  project_path TEXT UNIQUE NOT NULL,
  summary TEXT,
  active_files TEXT,
  recent_decisions TEXT,
  known_issues TEXT,
  tech_context TEXT,
  total_tasks INTEGER DEFAULT 0,
  successful_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  last_worker_name TEXT,
  context_size_bytes INTEGER DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const PROJECT_FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS worker_contexts_fts USING fts5(
  prompt, summary, files_changed, decisions,
  content=worker_contexts,
  content_rowid=rowid
);
`;

const ROOT_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects_context (
  id TEXT PRIMARY KEY,
  project_path TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  summary TEXT,
  active_files TEXT,
  recent_decisions TEXT,
  known_issues TEXT,
  total_tasks INTEGER DEFAULT 0,
  successful_tasks INTEGER DEFAULT 0,
  last_activity_at TEXT,
  last_worker_name TEXT,
  status TEXT DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const ROOT_FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
  project_name, summary, recent_decisions,
  content=projects_context,
  content_rowid=rowid
);
`;

// ---------- LocalContextStore ----------

export class LocalContextStore {
  private db: Database.Database | null = null;
  private initialized = false;
  private isRoot: boolean;
  private basePath: string;
  private config: LocalContextStoreConfig;

  constructor(
    basePath: string,
    options?: { isRoot?: boolean; config?: Partial<LocalContextStoreConfig> },
  ) {
    this.basePath = basePath;
    this.isRoot = options?.isRoot ?? false;
    this.config = { ...DEFAULT_LOCAL_CONTEXT_CONFIG, ...options?.config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = join(this.basePath, '.olympus');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const dbPath = join(dir, 'context.db');

    try {
      const mod = await import('better-sqlite3');
      const SqliteDb = (mod as { default: typeof import('better-sqlite3') }).default;
      this.db = new SqliteDb(dbPath) as Database.Database;
      this.db.pragma('journal_mode = WAL');

      if (this.isRoot) {
        this.db.exec(ROOT_SCHEMA);
        try { this.db.exec(ROOT_FTS_SCHEMA); } catch { /* FTS5 not available */ }
      } else {
        this.db.exec(PROJECT_SCHEMA);
        try { this.db.exec(PROJECT_FTS_SCHEMA); } catch { /* FTS5 not available */ }
      }
    } catch {
      this.db = null;
    }

    this.initialized = true;
  }

  // --- 프로젝트 레벨 ---

  saveWorkerContext(record: WorkerContextRecord): void {
    if (!this.db) return;

    const rawText = record.rawText
      ? record.rawText.slice(0, this.config.maxRawTextLength)
      : null;

    this.db.prepare(`
      INSERT INTO worker_contexts (
        id, worker_id, worker_name, task_id, prompt, success,
        summary, files_changed, decisions, errors, dependencies,
        model, input_tokens, output_tokens, cost_usd, duration_ms, num_turns,
        raw_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.workerId,
      record.workerName,
      record.taskId ?? null,
      record.prompt,
      record.success ? 1 : 0,
      record.summary,
      safeJsonString(record.filesChanged),
      safeJsonString(record.decisions),
      safeJsonString(record.errors),
      safeJsonString(record.dependencies),
      record.model ?? null,
      record.inputTokens ?? 0,
      record.outputTokens ?? 0,
      record.costUsd ?? 0,
      record.durationMs ?? 0,
      record.numTurns ?? 0,
      rawText,
      record.createdAt,
    );

    this.pruneOldContexts();
  }

  getRecentWorkerContexts(limit = 20): WorkerContextRecord[] {
    if (!this.db) return [];

    const rows = this.db
      .prepare('SELECT * FROM worker_contexts ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];

    return rows.map(rowToWorkerContext);
  }

  updateProjectContext(): ProjectContextSnapshot | null {
    if (!this.db) return null;

    const workers = this.getRecentWorkerContexts(this.config.maxWorkerContexts);
    if (workers.length === 0) return null;

    // active_files: 최근 worker_contexts의 filesChanged 합산, 중복 제거, 최신순
    const fileSet = new Set<string>();
    const activeFiles: string[] = [];
    for (const w of workers) {
      for (const f of w.filesChanged) {
        if (!fileSet.has(f) && activeFiles.length < this.config.maxActiveFiles) {
          fileSet.add(f);
          activeFiles.push(f);
        }
      }
    }

    // recent_decisions
    const decisionSet = new Set<string>();
    const recentDecisions: string[] = [];
    for (const w of workers) {
      for (const d of w.decisions) {
        if (!decisionSet.has(d) && recentDecisions.length < this.config.maxRecentDecisions) {
          decisionSet.add(d);
          recentDecisions.push(d);
        }
      }
    }

    // known_issues: errors가 있는 최근 실패 작업에서 추출
    const knownIssues: string[] = [];
    for (const w of workers) {
      if (!w.success && w.errors.length > 0) {
        for (const e of w.errors) {
          if (!knownIssues.includes(e) && knownIssues.length < 20) {
            knownIssues.push(e);
          }
        }
      }
    }

    // summary: 최근 5개 worker의 summary 합산
    const summaryParts = workers
      .slice(0, 5)
      .filter((w) => w.summary)
      .map((w) => w.summary);
    const summary = summaryParts.join(' | ');

    const totalTasks = workers.length;
    const successfulTasks = workers.filter((w) => w.success).length;
    const failedTasks = totalTasks - successfulTasks;
    const lastWorkerName = workers[0]?.workerName ?? '';

    // context_size_bytes
    const contextJson = JSON.stringify({
      summary,
      activeFiles,
      recentDecisions,
      knownIssues,
    });
    let contextSizeBytes = Buffer.byteLength(contextJson, 'utf8');

    // maxContextSizeBytes 초과 시 오래된 것 제거
    if (contextSizeBytes > this.config.maxContextSizeBytes) {
      while (activeFiles.length > 10 && contextSizeBytes > this.config.maxContextSizeBytes) {
        activeFiles.pop();
        contextSizeBytes = Buffer.byteLength(
          JSON.stringify({ summary, activeFiles, recentDecisions, knownIssues }),
          'utf8',
        );
      }
      while (recentDecisions.length > 5 && contextSizeBytes > this.config.maxContextSizeBytes) {
        recentDecisions.pop();
        contextSizeBytes = Buffer.byteLength(
          JSON.stringify({ summary, activeFiles, recentDecisions, knownIssues }),
          'utf8',
        );
      }
    }

    // 기존 row 조회
    const existing = this.db
      .prepare('SELECT version FROM project_context WHERE id = ?')
      .get('main') as { version: number } | undefined;

    const version = (existing?.version ?? 0) + 1;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO project_context (
        id, project_path, summary, active_files, recent_decisions,
        known_issues, tech_context, total_tasks, successful_tasks, failed_tasks,
        last_worker_name, context_size_bytes, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        active_files = excluded.active_files,
        recent_decisions = excluded.recent_decisions,
        known_issues = excluded.known_issues,
        total_tasks = excluded.total_tasks,
        successful_tasks = excluded.successful_tasks,
        failed_tasks = excluded.failed_tasks,
        last_worker_name = excluded.last_worker_name,
        context_size_bytes = excluded.context_size_bytes,
        version = excluded.version,
        updated_at = excluded.updated_at
    `).run(
      'main',
      this.basePath,
      summary,
      safeJsonString(activeFiles),
      safeJsonString(recentDecisions),
      safeJsonString(knownIssues),
      '{}',
      totalTasks,
      successfulTasks,
      failedTasks,
      lastWorkerName,
      contextSizeBytes,
      version,
      now,
    );

    return {
      id: 'main',
      projectPath: this.basePath,
      summary,
      activeFiles,
      recentDecisions,
      knownIssues,
      techContext: {},
      totalTasks,
      successfulTasks,
      failedTasks,
      lastWorkerName,
      contextSizeBytes,
      version,
      updatedAt: now,
    };
  }

  getProjectContext(): ProjectContextSnapshot | null {
    if (!this.db) return null;

    const row = this.db
      .prepare('SELECT * FROM project_context LIMIT 1')
      .get() as Record<string, unknown> | undefined;

    if (!row) return null;
    return rowToProjectContext(row);
  }

  // --- 루트 레벨 ---

  upsertProjectEntry(
    entry: Omit<RootProjectEntry, 'id' | 'version' | 'updatedAt'>,
  ): void {
    if (!this.db) return;

    const existing = this.db
      .prepare('SELECT id, version FROM projects_context WHERE project_path = ?')
      .get(entry.projectPath) as { id: string; version: number } | undefined;

    const id = existing?.id ?? randomUUID();
    const version = (existing?.version ?? 0) + 1;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO projects_context (
        id, project_path, project_name, summary, active_files,
        recent_decisions, known_issues, total_tasks, successful_tasks,
        last_activity_at, last_worker_name, status, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_path) DO UPDATE SET
        project_name = excluded.project_name,
        summary = excluded.summary,
        active_files = excluded.active_files,
        recent_decisions = excluded.recent_decisions,
        known_issues = excluded.known_issues,
        total_tasks = excluded.total_tasks,
        successful_tasks = excluded.successful_tasks,
        last_activity_at = excluded.last_activity_at,
        last_worker_name = excluded.last_worker_name,
        status = excluded.status,
        version = excluded.version,
        updated_at = excluded.updated_at
    `).run(
      id,
      entry.projectPath,
      entry.projectName,
      entry.summary ?? '',
      safeJsonString(entry.activeFiles),
      safeJsonString(entry.recentDecisions),
      safeJsonString(entry.knownIssues),
      entry.totalTasks ?? 0,
      entry.successfulTasks ?? 0,
      entry.lastActivityAt ?? now,
      entry.lastWorkerName ?? '',
      entry.status ?? 'active',
      version,
      now,
    );
  }

  getAllProjects(): RootProjectEntry[] {
    if (!this.db) return [];

    const rows = this.db
      .prepare("SELECT * FROM projects_context WHERE status = 'active' ORDER BY updated_at DESC")
      .all() as Record<string, unknown>[];

    return rows.map(rowToRootProject);
  }

  // --- 컨텍스트 주입 ---

  buildContextInjection(options?: { maxTokens?: number }): ContextInjection {
    const ctx = this.getProjectContext();
    if (!ctx) {
      return {
        projectSummary: '',
        recentActivity: '',
        activeFiles: [],
        knownIssues: [],
        recentDecisions: [],
      };
    }

    let summary = ctx.summary;
    const recentWorkers = this.getRecentWorkerContexts(5);
    let recentActivity = recentWorkers
      .map((w) => `[${w.workerName}] ${w.success ? 'OK' : 'FAIL'}: ${w.summary.slice(0, 100)}`)
      .join('\n');

    // maxTokens 근사 제한 (1 token ~= 4 chars)
    if (options?.maxTokens) {
      const maxChars = options.maxTokens * 4;
      if (summary.length > maxChars / 2) {
        summary = summary.slice(0, maxChars / 2);
      }
      if (recentActivity.length > maxChars / 2) {
        recentActivity = recentActivity.slice(0, maxChars / 2);
      }
    }

    return {
      projectSummary: summary,
      recentActivity,
      activeFiles: ctx.activeFiles,
      knownIssues: ctx.knownIssues,
      recentDecisions: ctx.recentDecisions,
    };
  }

  // --- 크기 관리 ---

  pruneOldContexts(): number {
    if (!this.db) return 0;

    const count = this.db
      .prepare('SELECT COUNT(*) as cnt FROM worker_contexts')
      .get() as { cnt: number };

    if (count.cnt <= this.config.maxWorkerContexts) return 0;

    const toDelete = count.cnt - this.config.maxWorkerContexts;

    const result = this.db.prepare(`
      DELETE FROM worker_contexts WHERE id IN (
        SELECT id FROM worker_contexts ORDER BY created_at ASC LIMIT ?
      )
    `).run(toDelete);

    return result.changes;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ---------- LocalContextStoreManager ----------

export class LocalContextStoreManager {
  private stores = new Map<string, LocalContextStore>();

  async getProjectStore(projectPath: string): Promise<LocalContextStore> {
    const key = projectPath;
    let store = this.stores.get(key);
    if (!store) {
      store = new LocalContextStore(projectPath);
      await store.initialize();
      this.stores.set(key, store);
    }
    return store;
  }

  async getRootStore(rootPath: string): Promise<LocalContextStore> {
    const key = `root:${rootPath}`;
    let store = this.stores.get(key);
    if (!store) {
      store = new LocalContextStore(rootPath, { isRoot: true });
      await store.initialize();
      this.stores.set(key, store);
    }
    return store;
  }

  async propagateToRoot(projectPath: string, rootPath: string): Promise<void> {
    const projectStore = await this.getProjectStore(projectPath);
    const rootStore = await this.getRootStore(rootPath);

    const ctx = projectStore.getProjectContext();
    if (!ctx) return;

    rootStore.upsertProjectEntry({
      projectPath,
      projectName: basename(projectPath),
      summary: ctx.summary,
      activeFiles: ctx.activeFiles,
      recentDecisions: ctx.recentDecisions,
      knownIssues: ctx.knownIssues,
      totalTasks: ctx.totalTasks,
      successfulTasks: ctx.successfulTasks,
      lastActivityAt: ctx.updatedAt,
      lastWorkerName: ctx.lastWorkerName,
      status: 'active',
    });
  }

  closeAll(): void {
    for (const store of this.stores.values()) {
      store.close();
    }
    this.stores.clear();
  }
}

// ---------- Row converters ----------

function rowToWorkerContext(row: Record<string, unknown>): WorkerContextRecord {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    workerName: String(row.worker_name),
    taskId: row.task_id ? String(row.task_id) : undefined,
    prompt: String(row.prompt),
    success: Boolean(row.success),
    summary: String(row.summary ?? ''),
    filesChanged: safeJsonParse<string[]>(row.files_changed, []),
    decisions: safeJsonParse<string[]>(row.decisions, []),
    errors: safeJsonParse<string[]>(row.errors, []),
    dependencies: safeJsonParse<string[]>(row.dependencies, []),
    model: row.model ? String(row.model) : undefined,
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    durationMs: Number(row.duration_ms ?? 0),
    numTurns: Number(row.num_turns ?? 0),
    rawText: row.raw_text ? String(row.raw_text) : undefined,
    createdAt: String(row.created_at),
  };
}

function rowToProjectContext(row: Record<string, unknown>): ProjectContextSnapshot {
  return {
    id: String(row.id),
    projectPath: String(row.project_path),
    summary: String(row.summary ?? ''),
    activeFiles: safeJsonParse<string[]>(row.active_files, []),
    recentDecisions: safeJsonParse<string[]>(row.recent_decisions, []),
    knownIssues: safeJsonParse<string[]>(row.known_issues, []),
    techContext: safeJsonParse<Record<string, unknown>>(row.tech_context, {}),
    totalTasks: Number(row.total_tasks ?? 0),
    successfulTasks: Number(row.successful_tasks ?? 0),
    failedTasks: Number(row.failed_tasks ?? 0),
    lastWorkerName: String(row.last_worker_name ?? ''),
    contextSizeBytes: Number(row.context_size_bytes ?? 0),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at),
  };
}

function rowToRootProject(row: Record<string, unknown>): RootProjectEntry {
  return {
    id: String(row.id),
    projectPath: String(row.project_path),
    projectName: String(row.project_name),
    summary: String(row.summary ?? ''),
    activeFiles: safeJsonParse<string[]>(row.active_files, []),
    recentDecisions: safeJsonParse<string[]>(row.recent_decisions, []),
    knownIssues: safeJsonParse<string[]>(row.known_issues, []),
    totalTasks: Number(row.total_tasks ?? 0),
    successfulTasks: Number(row.successful_tasks ?? 0),
    lastActivityAt: String(row.last_activity_at ?? ''),
    lastWorkerName: String(row.last_worker_name ?? ''),
    status: (row.status === 'inactive' ? 'inactive' : 'active'),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at),
  };
}
