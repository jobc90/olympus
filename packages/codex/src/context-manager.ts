import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import type {
  ProjectMetadata,
  ProjectContext,
  GlobalSearchResult,
} from './types.js';
import type { CompletedTask, LearningPattern } from '@olympus-dev/protocol';
import type Database from 'better-sqlite3';

/**
 * ContextManager — 프로젝트 컨텍스트 통합 관리
 *
 * DB 전략: Shard + Global Index
 * - global.db: 프로젝트 메타데이터, FTS5 검색 인덱스
 * - projects/{name}/memory.db: 프로젝트별 task/pattern 저장 (기존 MemoryStore 스키마)
 *
 * 설계 원칙:
 * - better-sqlite3 optional dependency (동적 import)
 * - DB 접근 실패 시에도 graceful degradation
 * - 프로젝트당 타임아웃 200ms (글로벌 검색 시)
 */
export class ContextManager {
  private globalDb: Database.Database | null = null;
  private projectDbs: Map<string, Database.Database> = new Map();
  private projectMeta: Map<string, ProjectMetadata> = new Map();
  private initialized = false;

  constructor(private config: { globalDbPath?: string } = {}) {}

  /**
   * 초기화 — global.db 생성 + 스키마 적용
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dbPath = (this.config.globalDbPath ?? '~/.olympus/global.db')
      .replace(/^~/, homedir());

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      const mod = await import('better-sqlite3');
      const SqliteDb = (mod as { default: typeof import('better-sqlite3') }).default;
      this.globalDb = new SqliteDb(dbPath) as Database.Database;
      this.globalDb.pragma('journal_mode = WAL');
      this.initGlobalSchema();
    } catch {
      console.warn('[ContextManager] better-sqlite3 not available — operating without persistence');
      this.globalDb = null;
    }

    this.initialized = true;
  }

  /**
   * 프로젝트 등록
   */
  async registerProject(meta: ProjectMetadata): Promise<void> {
    this.projectMeta.set(meta.path, meta);

    const projectDir = join(homedir(), '.olympus', 'projects', meta.name);
    if (!existsSync(projectDir)) {
      mkdirSync(projectDir, { recursive: true });
    }

    // Open project memory.db
    try {
      const mod = await import('better-sqlite3');
      const SqliteDb = (mod as { default: typeof import('better-sqlite3') }).default;
      const dbPath = join(projectDir, 'memory.db');
      const db = new SqliteDb(dbPath) as Database.Database;
      db.pragma('journal_mode = WAL');
      this.initProjectSchema(db);
      this.projectDbs.set(meta.path, db);
    } catch {
      // No DB access — operate without persistence
    }

    // Register in global.db
    if (this.globalDb) {
      this.globalDb.prepare(`
        INSERT OR REPLACE INTO projects (id, name, path, tech_stack, aliases, last_activity, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(
        meta.name,
        meta.name,
        meta.path,
        JSON.stringify(meta.techStack),
        JSON.stringify(meta.aliases),
        Date.now(),
      );

      // Index CLAUDE.md if present
      if (meta.claudeMdPath && existsSync(meta.claudeMdPath)) {
        try {
          const content = readFileSync(meta.claudeMdPath, 'utf-8');
          this.indexProjectContent(meta.name, content);
        } catch { /* file read error — skip */ }
      }
    }
  }

  /**
   * 전역 검색 — 모든 프로젝트 DB를 병렬 쿼리
   */
  async globalSearch(query: string, limit = 20): Promise<GlobalSearchResult[]> {
    const results: GlobalSearchResult[] = [];

    // Step 1: global.db FTS5 검색
    if (this.globalDb) {
      try {
        const globalResults = this.globalDb.prepare(`
          SELECT p.name, p.path, psi.content, rank
          FROM project_search_index psi
          JOIN project_fts ON psi.rowid = project_fts.rowid
          JOIN projects p ON p.id = psi.project_id
          WHERE project_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(query, limit) as Array<{ name: string; path: string; content: string; rank: number }>;

        for (const row of globalResults) {
          results.push({
            projectName: row.name,
            projectPath: row.path,
            matchType: 'instruction',
            content: row.content?.slice(0, 200) ?? '',
            score: Math.abs(row.rank ?? 0),
            timestamp: Date.now(),
          });
        }
      } catch { /* FTS query error — skip */ }
    }

    // Step 2: Per-project memory.db FTS5 (parallel with timeout)
    const projectSearches = [...this.projectDbs.entries()].map(
      ([path, db]) => this.searchProjectWithTimeout(path, db, query, 200)
    );

    const settled = await Promise.allSettled(projectSearches);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      }
    }

    // Step 3: Sort by score, deduplicate
    return results
      .sort((a, b) => b.score - a.score)
      .filter((r, i, arr) => arr.findIndex(x => x.content === r.content) === i)
      .slice(0, limit);
  }

  /**
   * 프로젝트 컨텍스트 조회
   */
  async getProjectContext(projectPath: string): Promise<ProjectContext> {
    const meta = this.projectMeta.get(projectPath);
    const db = this.projectDbs.get(projectPath);

    const recentTasks = db ? this.getRecentTasks(db, 20) : [];
    const patterns = db ? this.getPatterns(db) : [];

    let instructions: string | undefined;
    if (meta?.claudeMdPath && existsSync(meta.claudeMdPath)) {
      try {
        instructions = readFileSync(meta.claudeMdPath, 'utf-8');
      } catch { /* read error */ }
    }

    return {
      path: projectPath,
      name: meta?.name ?? basename(projectPath),
      lastUpdated: recentTasks[0]?.timestamp ?? 0,
      recentTasks,
      learningPatterns: patterns,
      techStack: meta?.techStack ?? [],
      activeIssues: [],
      projectInstructions: instructions,
      taskCount: db ? this.getTaskCount(db) : 0,
      patternCount: db ? this.getPatternCount(db) : 0,
    };
  }

  /**
   * 모든 프로젝트 메타데이터
   */
  async getAllProjects(): Promise<ProjectMetadata[]> {
    return [...this.projectMeta.values()];
  }

  /**
   * 프로젝트별 task 저장
   */
  saveTask(projectPath: string, task: CompletedTask): void {
    const db = this.projectDbs.get(projectPath);
    if (!db) return;

    db.prepare(`
      INSERT OR REPLACE INTO completed_tasks (id, command, analysis, plan, result, success, duration, timestamp, project_path, worker_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.command, task.analysis, task.plan, task.result,
      task.success ? 1 : 0, task.duration, task.timestamp,
      task.projectPath, task.workerCount,
    );
  }

  /**
   * DB 정리
   */
  close(): void {
    for (const [, db] of this.projectDbs) {
      try { db.close(); } catch { /* ignore */ }
    }
    this.projectDbs.clear();
    if (this.globalDb) {
      try { this.globalDb.close(); } catch { /* ignore */ }
      this.globalDb = null;
    }
    this.initialized = false;
  }

  // ── Private helpers ──

  private async searchProjectWithTimeout(
    path: string, db: Database.Database, query: string, timeoutMs: number
  ): Promise<GlobalSearchResult[]> {
    return Promise.race([
      Promise.resolve(this.searchProject(path, db, query)),
      new Promise<GlobalSearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
  }

  private searchProject(
    path: string, db: Database.Database, query: string
  ): GlobalSearchResult[] {
    const meta = this.projectMeta.get(path);
    try {
      const tasks = db.prepare(`
        SELECT ct.* FROM completed_tasks ct
        JOIN tasks_fts ON ct.rowid = tasks_fts.rowid
        WHERE tasks_fts MATCH ?
        ORDER BY rank LIMIT 5
      `).all(query) as Array<Record<string, unknown>>;

      return tasks.map(t => ({
        projectName: meta?.name ?? basename(path),
        projectPath: path,
        matchType: 'task' as const,
        content: `${t.command} → ${t.result}`,
        score: (t.success as number) === 1 ? 2 : 1,
        timestamp: t.timestamp as number,
      }));
    } catch {
      // FTS query error — fallback to LIKE
      try {
        const pattern = `%${query}%`;
        const tasks = db.prepare(`
          SELECT * FROM completed_tasks
          WHERE command LIKE ? OR result LIKE ?
          ORDER BY timestamp DESC LIMIT 5
        `).all(pattern, pattern) as Array<Record<string, unknown>>;

        return tasks.map(t => ({
          projectName: meta?.name ?? basename(path),
          projectPath: path,
          matchType: 'task' as const,
          content: `${t.command} → ${t.result}`,
          score: (t.success as number) === 1 ? 2 : 1,
          timestamp: t.timestamp as number,
        }));
      } catch {
        return [];
      }
    }
  }

  private getRecentTasks(db: Database.Database, limit: number): CompletedTask[] {
    try {
      const rows = db.prepare(
        'SELECT * FROM completed_tasks ORDER BY timestamp DESC LIMIT ?'
      ).all(limit) as Array<Record<string, unknown>>;
      return rows.map(this.rowToTask);
    } catch { return []; }
  }

  private getPatterns(db: Database.Database): LearningPattern[] {
    try {
      const rows = db.prepare(
        'SELECT * FROM learning_patterns ORDER BY usage_count DESC'
      ).all() as Array<Record<string, unknown>>;
      return rows.map(r => ({
        id: r.id as string,
        trigger: r.trigger as string,
        action: r.action as string,
        confidence: r.confidence as number,
        usageCount: r.usage_count as number,
        lastUsed: r.last_used as number,
      }));
    } catch { return []; }
  }

  private getTaskCount(db: Database.Database): number {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM completed_tasks').get() as { count: number };
      return result.count;
    } catch { return 0; }
  }

  private getPatternCount(db: Database.Database): number {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM learning_patterns').get() as { count: number };
      return result.count;
    } catch { return 0; }
  }

  private indexProjectContent(projectId: string, content: string): void {
    if (!this.globalDb) return;
    this.globalDb.prepare(`
      INSERT OR REPLACE INTO project_search_index (project_id, content, updated_at)
      VALUES (?, ?, ?)
    `).run(projectId, content, Date.now());
  }

  private initGlobalSchema(): void {
    if (!this.globalDb) return;
    this.globalDb.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT UNIQUE NOT NULL,
        tech_stack TEXT,
        aliases TEXT,
        last_activity INTEGER,
        status TEXT DEFAULT 'active',
        created_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS project_search_index (
        project_id TEXT REFERENCES projects(id),
        content TEXT,
        updated_at INTEGER
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS project_fts USING fts5(
        content,
        content=project_search_index,
        content_rowid=rowid
      );

      CREATE TRIGGER IF NOT EXISTS psi_fts_insert AFTER INSERT ON project_search_index BEGIN
        INSERT INTO project_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS psi_fts_delete AFTER DELETE ON project_search_index BEGIN
        INSERT INTO project_fts(project_fts, rowid, content) VALUES ('delete', OLD.rowid, OLD.content);
      END;

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        tmux_session TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        created_at INTEGER,
        last_activity INTEGER
      );
    `);
  }

  private initProjectSchema(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS completed_tasks (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        analysis TEXT,
        plan TEXT,
        result TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        project_path TEXT,
        worker_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS learning_patterns (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        action TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
        command, result, analysis,
        content=completed_tasks,
        content_rowid=rowid
      );

      CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON completed_tasks BEGIN
        INSERT INTO tasks_fts(rowid, command, result, analysis)
        VALUES (NEW.rowid, NEW.command, NEW.result, NEW.analysis);
      END;

      CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON completed_tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, command, result, analysis)
        VALUES ('delete', OLD.rowid, OLD.command, OLD.result, OLD.analysis);
      END;

      CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON completed_tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, command, result, analysis)
        VALUES ('delete', OLD.rowid, OLD.command, OLD.result, OLD.analysis);
        INSERT INTO tasks_fts(rowid, command, result, analysis)
        VALUES (NEW.rowid, NEW.command, NEW.result, NEW.analysis);
      END;
    `);
  }

  private rowToTask(row: Record<string, unknown>): CompletedTask {
    return {
      id: row.id as string,
      command: row.command as string,
      analysis: row.analysis as string,
      plan: row.plan as string,
      result: row.result as string,
      success: row.success === 1,
      duration: row.duration as number,
      timestamp: row.timestamp as number,
      projectPath: row.project_path as string,
      workerCount: row.worker_count as number,
    };
  }
}
