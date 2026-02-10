/**
 * CLI Session Store — SQLite 기반 CLI 세션 ID 영속화
 *
 * Claude CLI의 --session-id / --resume 기능을 활용하기 위해
 * 세션 ID와 메타데이터를 저장한다.
 *
 * better-sqlite3 dynamic import (MemoryStore 패턴 동일)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type Database from 'better-sqlite3';
import type { CliSessionRecord, CliProvider } from '@olympus-dev/protocol';

export class CliSessionStore {
  private db: Database.Database | null = null;
  private initialized = false;

  constructor(private dbPath: string = '~/.olympus/cli-sessions.db') {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const resolvedPath = this.dbPath.replace(/^~/, process.env.HOME || '/tmp');
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      const mod = await import('better-sqlite3');
      const SqliteDb = (mod as { default: typeof import('better-sqlite3') }).default;
      this.db = new SqliteDb(resolvedPath) as Database.Database;
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cli_sessions (
          key TEXT PRIMARY KEY,
          provider TEXT NOT NULL DEFAULT 'claude',
          cli_session_id TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT '',
          last_prompt TEXT NOT NULL DEFAULT '',
          last_response TEXT NOT NULL DEFAULT '',
          total_input_tokens INTEGER NOT NULL DEFAULT 0,
          total_output_tokens INTEGER NOT NULL DEFAULT 0,
          total_cost_usd REAL NOT NULL DEFAULT 0,
          turn_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      this.initialized = true;
    } catch {
      // better-sqlite3 not available — operate without persistence
      this.db = null;
      this.initialized = true;
    }
  }

  save(record: CliSessionRecord): void {
    if (!this.db) return;

    this.db.prepare(`
      INSERT INTO cli_sessions (
        key, provider, cli_session_id, model, last_prompt, last_response,
        total_input_tokens, total_output_tokens, total_cost_usd, turn_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        cli_session_id = excluded.cli_session_id,
        model = excluded.model,
        last_prompt = excluded.last_prompt,
        last_response = excluded.last_response,
        total_input_tokens = total_input_tokens + excluded.total_input_tokens,
        total_output_tokens = total_output_tokens + excluded.total_output_tokens,
        total_cost_usd = total_cost_usd + excluded.total_cost_usd,
        turn_count = turn_count + excluded.turn_count,
        updated_at = excluded.updated_at
    `).run(
      record.key,
      record.provider,
      record.cliSessionId,
      record.model,
      record.lastPrompt,
      record.lastResponse,
      record.totalInputTokens,
      record.totalOutputTokens,
      record.totalCostUsd,
      record.turnCount,
      record.createdAt,
      record.updatedAt,
    );
  }

  get(key: string): CliSessionRecord | null {
    if (!this.db) return null;

    const row = this.db.prepare(
      'SELECT * FROM cli_sessions WHERE key = ?',
    ).get(key) as Record<string, unknown> | undefined;

    return row ? this.rowToRecord(row) : null;
  }

  getByCliSessionId(cliSessionId: string): CliSessionRecord | null {
    if (!this.db) return null;

    const row = this.db.prepare(
      'SELECT * FROM cli_sessions WHERE cli_session_id = ?',
    ).get(cliSessionId) as Record<string, unknown> | undefined;

    return row ? this.rowToRecord(row) : null;
  }

  list(provider?: CliProvider, limit = 50): CliSessionRecord[] {
    if (!this.db) return [];

    let sql = 'SELECT * FROM cli_sessions';
    const params: unknown[] = [];

    if (provider) {
      sql += ' WHERE provider = ?';
      params.push(provider);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToRecord(row));
  }

  delete(key: string): boolean {
    if (!this.db) return false;

    const result = this.db.prepare(
      'DELETE FROM cli_sessions WHERE key = ?',
    ).run(key);

    return result.changes > 0;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private rowToRecord(row: Record<string, unknown>): CliSessionRecord {
    return {
      key: String(row.key),
      provider: String(row.provider) as CliProvider,
      cliSessionId: String(row.cli_session_id),
      model: String(row.model),
      lastPrompt: String(row.last_prompt),
      lastResponse: String(row.last_response),
      totalInputTokens: Number(row.total_input_tokens),
      totalOutputTokens: Number(row.total_output_tokens),
      totalCostUsd: Number(row.total_cost_usd),
      turnCount: Number(row.turn_count),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
