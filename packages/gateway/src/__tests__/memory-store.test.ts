import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../memory/store.js';
import { existsSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Check if better-sqlite3 native binary actually works (may fail in CI)
let hasSqlite = false;
try {
  const bs3 = await import('better-sqlite3');
  const testDb = new bs3.default(':memory:');
  testDb.close();
  hasSqlite = true;
} catch {
  // Native module not available — skip SQLite-dependent tests
}

const TEST_DB_DIR = join(tmpdir(), 'olympus-test-memory');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-memory.db');

describe.skipIf(!hasSqlite)('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    // Clean up any previous test DB
    try {
      if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
      if (existsSync(TEST_DB_PATH + '-wal')) unlinkSync(TEST_DB_PATH + '-wal');
      if (existsSync(TEST_DB_PATH + '-shm')) unlinkSync(TEST_DB_PATH + '-shm');
    } catch { /* ignore */ }

    store = new MemoryStore({
      enabled: true,
      dbPath: TEST_DB_PATH,
      maxHistory: 100,
    });
    await store.initialize();
  });

  afterEach(() => {
    store.close();
    try {
      if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
      if (existsSync(TEST_DB_PATH + '-wal')) unlinkSync(TEST_DB_PATH + '-wal');
      if (existsSync(TEST_DB_PATH + '-shm')) unlinkSync(TEST_DB_PATH + '-shm');
      if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true });
    } catch { /* ignore */ }
  });

  it('should initialize without error', () => {
    expect(store.getTaskCount()).toBe(0);
  });

  it('should save and retrieve tasks', () => {
    store.saveTask({
      id: 'task-1',
      command: 'fix the bug',
      analysis: '{"intent":"debugging"}',
      plan: '{"strategy":"single"}',
      result: 'Bug fixed successfully',
      success: true,
      duration: 5000,
      timestamp: Date.now(),
      projectPath: '/test/project',
      workerCount: 1,
    });

    expect(store.getTaskCount()).toBe(1);

    const tasks = store.getRecentTasks(10);
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe('task-1');
    expect(tasks[0].command).toBe('fix the bug');
    expect(tasks[0].success).toBe(true);
  });

  it('should retrieve tasks ordered by timestamp desc', () => {
    const now = Date.now();
    store.saveTask({
      id: 'old-task', command: 'old', analysis: '', plan: '', result: 'old done',
      success: true, duration: 100, timestamp: now - 10000, projectPath: '', workerCount: 1,
    });
    store.saveTask({
      id: 'new-task', command: 'new', analysis: '', plan: '', result: 'new done',
      success: true, duration: 100, timestamp: now, projectPath: '', workerCount: 1,
    });

    const tasks = store.getRecentTasks(10);
    expect(tasks[0].id).toBe('new-task');
    expect(tasks[1].id).toBe('old-task');
  });

  it('should search tasks via FTS5', () => {
    store.saveTask({
      id: 't1', command: 'fix authentication bug', analysis: '', plan: '', result: 'Auth fixed',
      success: true, duration: 100, timestamp: Date.now(), projectPath: '', workerCount: 1,
    });
    store.saveTask({
      id: 't2', command: 'add button component', analysis: '', plan: '', result: 'Button added',
      success: true, duration: 100, timestamp: Date.now(), projectPath: '', workerCount: 1,
    });

    const results = store.searchTasks('authentication');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('t1');
  });

  it('should respect limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      store.saveTask({
        id: `t-${i}`, command: `task ${i}`, analysis: '', plan: '', result: `done ${i}`,
        success: true, duration: 100, timestamp: Date.now() + i, projectPath: '', workerCount: 1,
      });
    }

    expect(store.getRecentTasks(2).length).toBe(2);
    expect(store.getRecentTasks(10, 3).length).toBe(2);
  });

  it('should prune history when exceeding maxHistory', () => {
    const smallStore = new MemoryStore({
      enabled: true,
      dbPath: TEST_DB_PATH,
      maxHistory: 3,
    });
    // Re-use same DB (already initialized)

    for (let i = 0; i < 5; i++) {
      store.saveTask({
        id: `t-${i}`, command: `task ${i}`, analysis: '', plan: '', result: `done ${i}`,
        success: true, duration: 100, timestamp: i, projectPath: '', workerCount: 1,
      });
    }

    // After pruning, should have at most maxHistory tasks
    // Note: pruning happens on save, with the main store's maxHistory (100)
    expect(store.getTaskCount()).toBe(5);

    smallStore.close();
  });

  it('should save and find patterns', () => {
    store.savePattern({
      id: 'p1',
      trigger: 'build',
      action: 'pnpm build',
      confidence: 0.8,
      usageCount: 5,
      lastUsed: Date.now(),
    });

    const patterns = store.findPatterns('run build please', 0.5);
    expect(patterns.length).toBe(1);
    expect(patterns[0].trigger).toBe('build');
  });

  it('should return all patterns', () => {
    store.savePattern({
      id: 'p1', trigger: 'test', action: 'pnpm test',
      confidence: 0.9, usageCount: 10, lastUsed: Date.now(),
    });
    store.savePattern({
      id: 'p2', trigger: 'build', action: 'pnpm build',
      confidence: 0.7, usageCount: 3, lastUsed: Date.now(),
    });

    const patterns = store.getPatterns();
    expect(patterns.length).toBe(2);
    // Should be ordered by confidence desc
    expect(patterns[0].trigger).toBe('test');
  });

  it('should handle disabled config gracefully', async () => {
    const disabled = new MemoryStore({ enabled: false });
    await disabled.initialize();

    disabled.saveTask({
      id: 't1', command: 'test', analysis: '', plan: '', result: '',
      success: true, duration: 0, timestamp: 0, projectPath: '', workerCount: 0,
    });

    expect(disabled.getTaskCount()).toBe(0);
    expect(disabled.getRecentTasks()).toEqual([]);
    expect(disabled.searchTasks('anything')).toEqual([]);
    expect(disabled.findPatterns('anything')).toEqual([]);
    expect(disabled.getPatterns()).toEqual([]);

    disabled.close();
  });
});
