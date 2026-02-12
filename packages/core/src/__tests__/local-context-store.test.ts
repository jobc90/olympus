import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalContextStore, LocalContextStoreManager } from '../local-context-store.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';
import type { WorkerContextRecord } from '@olympus-dev/protocol';

function makeWorkerRecord(overrides?: Partial<WorkerContextRecord>): WorkerContextRecord {
  return {
    id: randomUUID(),
    workerId: 'worker-1',
    workerName: 'test-worker',
    prompt: 'Do something',
    success: true,
    summary: 'Did something',
    filesChanged: ['src/index.ts'],
    decisions: [],
    errors: [],
    dependencies: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LocalContextStore (project level)', () => {
  let store: LocalContextStore;
  let testDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'olympus-ctx-'));
    store = new LocalContextStore(testDir);
    await store.initialize();
  });

  afterEach(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should initialize without error', () => {
    // initialize already called in beforeEach
    expect(true).toBe(true);
  });

  describe('saveWorkerContext + getRecentWorkerContexts', () => {
    it('should save and retrieve worker context', () => {
      const rec = makeWorkerRecord();
      store.saveWorkerContext(rec);

      const results = store.getRecentWorkerContexts();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(rec.id);
      expect(results[0].workerName).toBe('test-worker');
      expect(results[0].filesChanged).toEqual(['src/index.ts']);
    });

    it('should return results in desc order', () => {
      const old = makeWorkerRecord({
        id: randomUUID(),
        createdAt: '2024-01-01T00:00:00.000Z',
        summary: 'old',
      });
      const recent = makeWorkerRecord({
        id: randomUUID(),
        createdAt: '2025-01-01T00:00:00.000Z',
        summary: 'recent',
      });
      store.saveWorkerContext(old);
      store.saveWorkerContext(recent);

      const results = store.getRecentWorkerContexts();
      expect(results[0].summary).toBe('recent');
      expect(results[1].summary).toBe('old');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        store.saveWorkerContext(makeWorkerRecord({ id: randomUUID() }));
      }
      const results = store.getRecentWorkerContexts(2);
      expect(results).toHaveLength(2);
    });

    it('should truncate rawText to maxRawTextLength', () => {
      const longText = 'A'.repeat(10000);
      store.saveWorkerContext(makeWorkerRecord({ rawText: longText }));
      const results = store.getRecentWorkerContexts();
      expect(results[0].rawText!.length).toBeLessThanOrEqual(8000);
    });
  });

  describe('updateProjectContext + getProjectContext', () => {
    it('should return null when no worker contexts', () => {
      const ctx = store.updateProjectContext();
      expect(ctx).toBeNull();
    });

    it('should aggregate worker contexts into project snapshot', () => {
      store.saveWorkerContext(
        makeWorkerRecord({
          filesChanged: ['src/a.ts', 'src/b.ts'],
          decisions: ['결정: use SQLite'],
          summary: 'First task done',
        }),
      );
      store.saveWorkerContext(
        makeWorkerRecord({
          id: randomUUID(),
          success: false,
          filesChanged: ['src/c.ts'],
          errors: ['Error: not found'],
          summary: 'Second task failed',
        }),
      );

      const ctx = store.updateProjectContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.totalTasks).toBe(2);
      expect(ctx!.successfulTasks).toBe(1);
      expect(ctx!.failedTasks).toBe(1);
      expect(ctx!.activeFiles).toContain('src/c.ts');
      expect(ctx!.activeFiles).toContain('src/a.ts');
      expect(ctx!.knownIssues).toContain('Error: not found');
      expect(ctx!.version).toBe(1);
    });

    it('should increment version on subsequent updates', () => {
      store.saveWorkerContext(makeWorkerRecord());
      store.updateProjectContext();
      store.saveWorkerContext(makeWorkerRecord({ id: randomUUID() }));
      const ctx = store.updateProjectContext();
      expect(ctx!.version).toBe(2);
    });

    it('should persist and be readable via getProjectContext', () => {
      store.saveWorkerContext(makeWorkerRecord({ summary: 'persisted' }));
      store.updateProjectContext();

      const ctx = store.getProjectContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.summary).toContain('persisted');
    });
  });

  describe('pruneOldContexts', () => {
    it('should prune when exceeding maxWorkerContexts', async () => {
      const smallStore = new LocalContextStore(testDir, {
        config: { maxWorkerContexts: 3 },
      });
      await smallStore.initialize();

      for (let i = 0; i < 5; i++) {
        smallStore.saveWorkerContext(
          makeWorkerRecord({
            id: randomUUID(),
            createdAt: new Date(Date.now() + i * 1000).toISOString(),
          }),
        );
      }

      const remaining = smallStore.getRecentWorkerContexts(100);
      expect(remaining.length).toBeLessThanOrEqual(3);
      smallStore.close();
    });
  });

  describe('buildContextInjection', () => {
    it('should return empty injection when no context', () => {
      const inj = store.buildContextInjection();
      expect(inj.projectSummary).toBe('');
      expect(inj.activeFiles).toEqual([]);
    });

    it('should build injection from project context', () => {
      store.saveWorkerContext(
        makeWorkerRecord({
          summary: 'Built the store',
          filesChanged: ['src/store.ts'],
        }),
      );
      store.updateProjectContext();

      const inj = store.buildContextInjection();
      expect(inj.projectSummary).toContain('Built the store');
      expect(inj.activeFiles).toContain('src/store.ts');
    });
  });
});

describe('LocalContextStore (root level)', () => {
  let store: LocalContextStore;
  let testDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'olympus-root-'));
    store = new LocalContextStore(testDir, { isRoot: true });
    await store.initialize();
  });

  afterEach(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should upsert and retrieve project entries', () => {
    store.upsertProjectEntry({
      projectPath: '/projects/foo',
      projectName: 'foo',
      summary: 'Foo project',
      activeFiles: ['src/main.ts'],
      recentDecisions: [],
      knownIssues: [],
      totalTasks: 5,
      successfulTasks: 4,
      lastActivityAt: new Date().toISOString(),
      lastWorkerName: 'worker-1',
      status: 'active',
    });

    const projects = store.getAllProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].projectName).toBe('foo');
    expect(projects[0].totalTasks).toBe(5);
  });

  it('should update existing project entry on upsert', () => {
    store.upsertProjectEntry({
      projectPath: '/projects/bar',
      projectName: 'bar',
      summary: 'v1',
      activeFiles: [],
      recentDecisions: [],
      knownIssues: [],
      totalTasks: 1,
      successfulTasks: 1,
      lastActivityAt: new Date().toISOString(),
      lastWorkerName: 'w1',
      status: 'active',
    });

    store.upsertProjectEntry({
      projectPath: '/projects/bar',
      projectName: 'bar',
      summary: 'v2',
      activeFiles: [],
      recentDecisions: [],
      knownIssues: [],
      totalTasks: 3,
      successfulTasks: 2,
      lastActivityAt: new Date().toISOString(),
      lastWorkerName: 'w2',
      status: 'active',
    });

    const projects = store.getAllProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].summary).toBe('v2');
    expect(projects[0].version).toBe(2);
  });
});

describe('LocalContextStoreManager', () => {
  let manager: LocalContextStoreManager;
  let projectDir: string;
  let rootDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'olympus-mgr-proj-'));
    rootDir = mkdtempSync(join(tmpdir(), 'olympus-mgr-root-'));
    manager = new LocalContextStoreManager();
  });

  afterEach(() => {
    manager.closeAll();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('should cache and reuse project stores', async () => {
    const s1 = await manager.getProjectStore(projectDir);
    const s2 = await manager.getProjectStore(projectDir);
    expect(s1).toBe(s2);
  });

  it('should cache and reuse root stores', async () => {
    const s1 = await manager.getRootStore(rootDir);
    const s2 = await manager.getRootStore(rootDir);
    expect(s1).toBe(s2);
  });

  it('should propagate project context to root', async () => {
    const projectStore = await manager.getProjectStore(projectDir);
    projectStore.saveWorkerContext(
      makeWorkerRecord({ summary: 'Propagated task' }),
    );
    projectStore.updateProjectContext();

    await manager.propagateToRoot(projectDir, rootDir);

    const rootStore = await manager.getRootStore(rootDir);
    const projects = rootStore.getAllProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].summary).toContain('Propagated task');
  });
});

describe('LocalContextStore graceful degradation', () => {
  it('should return empty results when db is null', async () => {
    // Create store but don't use a real path where DB could work
    // Instead, test the public API when no DB is available
    const store = new LocalContextStore('/tmp/nonexistent-dir-test');
    // Skip initialize to simulate DB unavailable
    // Access public methods that check for null db
    expect(store.getRecentWorkerContexts()).toEqual([]);
    expect(store.getProjectContext()).toBeNull();
    expect(store.pruneOldContexts()).toBe(0);
    expect(store.getAllProjects()).toEqual([]);
    store.close();
  });
});
