/**
 * Pattern Manager — manages learning patterns extracted from task history.
 *
 * Separated from MemoryStore (A4 fix) for single-responsibility:
 * - Pattern CRUD operations
 * - Confidence scoring and decay
 * - Trigger matching with SQL-level WHERE filtering (I2 fix)
 */

import type { LearningPattern } from '@olympus-dev/protocol';
import type Database from 'better-sqlite3';

export class PatternManager {
  private db: Database.Database | null;

  constructor(db: Database.Database | null) {
    this.db = db;
  }

  /**
   * Update the database reference (e.g., after re-initialization)
   */
  setDb(db: Database.Database | null): void {
    this.db = db;
  }

  /**
   * Save or update a learning pattern
   */
  save(pattern: LearningPattern): void {
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
   * Find matching patterns for a command.
   * I2 fix: uses SQL-level LIKE filter to avoid full table scan.
   */
  findMatching(command: string, minConfidence = 0.3): LearningPattern[] {
    if (!this.db) return [];

    // Extract keywords from command for SQL-level filtering
    const keywords = command
      .toLowerCase()
      .split(/[\s,;:.!?]+/)
      .filter(w => w.length > 2)
      .slice(0, 5); // Limit to 5 keywords for query efficiency

    if (keywords.length === 0) {
      return this.getByConfidence(minConfidence);
    }

    // Build a WHERE clause with LIKE conditions for each keyword
    const conditions = keywords.map(() => 'LOWER(trigger) LIKE ?');
    const params = keywords.map(k => `%${k}%`);

    const stmt = this.db.prepare(`
      SELECT * FROM learning_patterns
      WHERE confidence >= ?
        AND (${conditions.join(' OR ')})
      ORDER BY confidence DESC, usage_count DESC
      LIMIT 10
    `);

    return stmt.all(minConfidence, ...params).map(this.rowToPattern);
  }

  /**
   * Get patterns above a confidence threshold
   */
  getByConfidence(minConfidence = 0.3): LearningPattern[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM learning_patterns
      WHERE confidence >= ?
      ORDER BY confidence DESC, usage_count DESC
      LIMIT 10
    `);

    return stmt.all(minConfidence).map(this.rowToPattern);
  }

  /**
   * Get all patterns
   */
  getAll(): LearningPattern[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM learning_patterns ORDER BY confidence DESC');
    return stmt.all().map(this.rowToPattern);
  }

  /**
   * Delete a pattern by ID
   */
  delete(id: string): boolean {
    if (!this.db) return false;

    const result = this.db.prepare('DELETE FROM learning_patterns WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Get pattern count
   */
  getCount(): number {
    if (!this.db) return 0;

    const result = this.db.prepare('SELECT COUNT(*) as count FROM learning_patterns').get() as { count: number };
    return result.count;
  }

  /**
   * Increment usage count and update last_used timestamp
   */
  recordUsage(id: string): void {
    if (!this.db) return;

    this.db.prepare(`
      UPDATE learning_patterns
      SET usage_count = usage_count + 1, last_used = ?
      WHERE id = ?
    `).run(Date.now(), id);
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
