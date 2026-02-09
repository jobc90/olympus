import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  CompletedTask,
  LearningPattern,
  MemoryConfig,
} from '@olympus-dev/protocol';
import { DEFAULT_MEMORY_CONFIG } from '@olympus-dev/protocol';
import type Database from 'better-sqlite3';

/**
 * Memory Store — SQLite + FTS5 backed task history and learning patterns.
 *
 * Stores completed tasks, worker results, and learned patterns
 * for the agent to improve over time.
 *
 * Uses better-sqlite3 (lazy loaded) for synchronous SQLite access with WAL mode.
 */
export class MemoryStore {
  private db: Database.Database | null = null;
  private config: MemoryConfig;
  private initialized = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /**
   * Initialize the database (creates tables if needed)
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.initialized) return;

    // Resolve ~ to home directory
    const dbPath = this.config.dbPath.replace(/^~/, process.env.HOME || '/tmp');

    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      // Dynamic import for better-sqlite3 (optional dependency)
      const mod = await import('better-sqlite3');
      const SqliteDb = (mod as { default: typeof import('better-sqlite3') }).default;
      this.db = new SqliteDb(dbPath) as Database.Database;

      // WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.db.exec(`
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

        -- FTS5 for full-text search on tasks
        CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
          command,
          result,
          analysis,
          content=completed_tasks,
          content_rowid=rowid
        );

        -- Trigger to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON completed_tasks BEGIN
          INSERT INTO tasks_fts(rowid, command, result, analysis) VALUES (NEW.rowid, NEW.command, NEW.result, NEW.analysis);
        END;

        CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON completed_tasks BEGIN
          INSERT INTO tasks_fts(tasks_fts, rowid, command, result, analysis) VALUES ('delete', OLD.rowid, OLD.command, OLD.result, OLD.analysis);
        END;
      `);

      this.initialized = true;
    } catch {
      // better-sqlite3 not available — operate in memory-only mode
      this.db = null;
      this.initialized = true;
    }
  }

  /**
   * Save a completed task to history
   */
  saveTask(task: CompletedTask): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO completed_tasks (id, command, analysis, plan, result, success, duration, timestamp, project_path, worker_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.command,
      task.analysis,
      task.plan,
      task.result,
      task.success ? 1 : 0,
      task.duration,
      task.timestamp,
      task.projectPath,
      task.workerCount,
    );

    // Enforce max history
    this.pruneHistory();
  }

  /**
   * Get recent tasks
   */
  getRecentTasks(limit = 20, offset = 0): CompletedTask[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM completed_tasks ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `);

    return stmt.all(limit, offset).map(this.rowToTask);
  }

  /**
   * Search tasks using FTS5
   */
  searchTasks(query: string, limit = 10): CompletedTask[] {
    if (!this.db) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT ct.* FROM completed_tasks ct
        JOIN tasks_fts ON ct.rowid = tasks_fts.rowid
        WHERE tasks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      return stmt.all(query, limit).map(this.rowToTask);
    } catch {
      // FTS query error — fallback to LIKE search
      return this.likeTasks(query, limit);
    }
  }

  /**
   * Get total task count
   */
  getTaskCount(): number {
    if (!this.db) return 0;

    const result = this.db.prepare('SELECT COUNT(*) as count FROM completed_tasks').get() as { count: number };
    return result.count;
  }

  /**
   * Save or update a learning pattern
   */
  savePattern(pattern: LearningPattern): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO learning_patterns (id, trigger, action, confidence, usage_count, last_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.id,
      pattern.trigger,
      pattern.action,
      pattern.confidence,
      pattern.usageCount,
      pattern.lastUsed,
    );
  }

  /**
   * Find matching patterns for a command
   */
  findPatterns(command: string, minConfidence = 0.3): LearningPattern[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM learning_patterns
      WHERE confidence >= ?
      ORDER BY confidence DESC, usage_count DESC
      LIMIT 10
    `);

    const allPatterns = stmt.all(minConfidence) as Array<{
      id: string;
      trigger: string;
      action: string;
      confidence: number;
      usage_count: number;
      last_used: number;
    }>;

    // Filter by trigger match
    const lower = command.toLowerCase();
    return allPatterns
      .filter(p => lower.includes(p.trigger.toLowerCase()))
      .map(this.rowToPattern);
  }

  /**
   * Get all patterns
   */
  getPatterns(): LearningPattern[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM learning_patterns ORDER BY confidence DESC');
    return stmt.all().map(this.rowToPattern);
  }

  /**
   * Close the database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  // ── Private helpers ──────────────────────────

  private likeTasks(query: string, limit: number): CompletedTask[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM completed_tasks
      WHERE command LIKE ? OR result LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const pattern = `%${query}%`;
    return stmt.all(pattern, pattern, limit).map(this.rowToTask);
  }

  private pruneHistory(): void {
    if (!this.db) return;

    const count = this.getTaskCount();
    if (count > this.config.maxHistory) {
      const excess = count - this.config.maxHistory;
      this.db.prepare(`
        DELETE FROM completed_tasks
        WHERE id IN (
          SELECT id FROM completed_tasks ORDER BY timestamp ASC LIMIT ?
        )
      `).run(excess);
    }
  }

  private rowToTask(row: unknown): CompletedTask {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      command: r.command as string,
      analysis: r.analysis as string,
      plan: r.plan as string,
      result: r.result as string,
      success: r.success === 1,
      duration: r.duration as number,
      timestamp: r.timestamp as number,
      projectPath: r.project_path as string,
      workerCount: r.worker_count as number,
    };
  }

  private rowToPattern(row: unknown): LearningPattern {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      trigger: r.trigger as string,
      action: r.action as string,
      confidence: r.confidence as number,
      usageCount: r.usage_count as number,
      lastUsed: r.last_used as number,
    };
  }
}
