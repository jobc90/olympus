import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let hasSqlite = false;
type TaskAuthorityStoreType =
  Awaited<typeof import('../task-authority-store.js')>['TaskAuthorityStore'];
type TaskArtifactStoreType =
  Awaited<typeof import('../task-artifact-store.js')>['TaskArtifactStore'];
const storeModulePromise = import('../task-authority-store.js');
const artifactModulePromise = import('../task-artifact-store.js');

try {
  const bs3 = await import('better-sqlite3');
  const testDb = new bs3.default(':memory:');
  testDb.close();
  hasSqlite = true;
} catch {
  hasSqlite = false;
}

describe.skipIf(!hasSqlite)('TaskAuthorityStore', () => {
  let TaskAuthorityStore: TaskAuthorityStoreType;
  let TaskArtifactStore: TaskArtifactStoreType;
  let testDir: string;
  let dbPath: string;
  let controlRoot: string;
  let projectRoot: string;
  let store: ReturnType<TaskAuthorityStoreType['create']>;
  let artifactStore: InstanceType<TaskArtifactStoreType>;

  beforeEach(async () => {
    // Module load must fail the test if the implementation does not exist.
    TaskAuthorityStore = (await storeModulePromise).TaskAuthorityStore;
    TaskArtifactStore = (await artifactModulePromise).TaskArtifactStore;
    testDir = mkdtempSync(join(tmpdir(), 'olympus-task-authority-'));
    dbPath = join(testDir, 'task-authority.db');
    controlRoot = join(testDir, 'control');
    projectRoot = join(testDir, 'workspace', 'server');
    store = TaskAuthorityStore.create(dbPath);
    artifactStore = new TaskArtifactStore(controlRoot);
  });

  afterEach(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates tasks and enforces valid transitions', () => {
    const parentTask = store.createTask({
      displayLabel: 'AUTH-ROLLUP-001',
      title: 'Auth rollout',
      kind: 'parent',
    });

    const projectTask = store.createTask({
      displayLabel: 'server-auth-001',
      title: 'Implement auth server changes',
      kind: 'project',
      parentTaskId: parentTask.id,
      projectId: 'server',
    });

    expect(projectTask.status).toBe('draft');

    expect(() => store.transitionTask(projectTask.id, 'completed')).toThrow(
      'Invalid task status transition: draft -> completed',
    );

    store.transitionTask(projectTask.id, 'ready');
    store.transitionTask(projectTask.id, 'assigned', { assignedWorkerId: 'worker-server-default' });
    const inProgress = store.transitionTask(projectTask.id, 'in_progress');
    const completed = store.transitionTask(projectTask.id, 'completed');

    expect(inProgress.assignedWorkerId).toBe('worker-server-default');
    expect(completed.status).toBe('completed');
  });

  it('assigns the highest-priority queued task to a worker', () => {
    const low = store.createTask({
      displayLabel: 'server-low',
      title: 'Low priority',
      kind: 'project',
      projectId: 'server',
      priority: 10,
    });
    const high = store.createTask({
      displayLabel: 'server-high',
      title: 'High priority',
      kind: 'project',
      projectId: 'server',
      priority: 100,
    });

    store.transitionTask(low.id, 'ready');
    store.transitionTask(high.id, 'ready');
    store.enqueueTask(low.id);
    store.enqueueTask(high.id);

    const claimed = store.claimNextQueuedTask('server', 'worker-server-default');
    expect(claimed?.taskId).toBe(high.id);

    const claimedTask = store.getTask(high.id);
    expect(claimedTask?.status).toBe('assigned');
    expect(claimedTask?.assignedWorkerId).toBe('worker-server-default');
  });

  it('lists authority tasks for the whole store or a specific project', () => {
    const serverTask = store.createTask({
      displayLabel: 'server-auth',
      title: 'Server auth work',
      kind: 'project',
      projectId: 'server',
    });
    const webTask = store.createTask({
      displayLabel: 'web-auth',
      title: 'Web auth work',
      kind: 'project',
      projectId: 'web',
    });

    store.transitionTask(serverTask.id, 'ready');
    store.transitionTask(webTask.id, 'ready');

    expect(store.listTasks().map((task) => task.id)).toEqual(
      expect.arrayContaining([serverTask.id, webTask.id]),
    );
    expect(store.listTasks('server').map((task) => task.id)).toEqual([serverTask.id]);
  });

  it('records soft preemption by blocking the active task and assigning the replacement', () => {
    const active = store.createTask({
      displayLabel: 'server-active',
      title: 'Current task',
      kind: 'project',
      projectId: 'server',
    });
    const urgent = store.createTask({
      displayLabel: 'server-urgent',
      title: 'Urgent task',
      kind: 'project',
      projectId: 'server',
    });

    store.transitionTask(active.id, 'ready');
    store.transitionTask(active.id, 'assigned', { assignedWorkerId: 'worker-server-default' });
    store.transitionTask(active.id, 'in_progress');
    store.transitionTask(urgent.id, 'ready');

    const event = store.softPreemptTask({
      projectId: 'server',
      activeTaskId: active.id,
      replacementTaskId: urgent.id,
      actor: 'codex',
      reason: 'urgent interrupt',
      assignedWorkerId: 'worker-server-default',
    });

    expect(event.preemptedTaskId).toBe(active.id);
    expect(store.getTask(active.id)?.status).toBe('blocked');
    expect(store.getTask(urgent.id)?.status).toBe('assigned');
    expect(store.listPreemptionEvents('server')).toHaveLength(1);
  });

  it('registers artifacts and mirrors files into central and local locations', () => {
    const task = store.createTask({
      displayLabel: 'server-artifacts',
      title: 'Write artifacts',
      kind: 'project',
      projectId: 'server',
    });

    const written = artifactStore.writeMirroredArtifact({
      projectId: 'server',
      projectRoot,
      taskId: task.id,
      artifactKind: 'instruction',
      content: '# instruction',
    });

    store.registerArtifact({
      taskId: task.id,
      projectId: 'server',
      artifactKind: 'instruction',
      storageScope: 'central',
      filePath: written.centralPath,
    });
    store.registerArtifact({
      taskId: task.id,
      projectId: 'server',
      artifactKind: 'instruction',
      storageScope: 'local',
      filePath: written.localPath,
    });

    expect(readFileSync(written.centralPath, 'utf8')).toBe('# instruction');
    expect(readFileSync(written.localPath, 'utf8')).toBe('# instruction');
    expect(store.listArtifacts(task.id)).toHaveLength(2);
  });
});
