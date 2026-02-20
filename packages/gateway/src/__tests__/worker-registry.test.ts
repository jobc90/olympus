import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerRegistry } from '../worker-registry.js';
import type { CliRunResult } from '@olympus-dev/protocol';

const makeResult = (success = true): CliRunResult => ({
  success,
  text: 'done',
  sessionId: 'sess-1',
  model: 'claude-3-5-sonnet',
  usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
  cost: 0.01,
  durationMs: 1000,
  numTurns: 1,
});

describe('WorkerRegistry', () => {
  let registry: WorkerRegistry;

  beforeEach(() => {
    registry = new WorkerRegistry();
  });

  afterEach(() => {
    registry.dispose();
  });

  // ── register ──

  describe('register', () => {
    it('returns worker with id, name, projectPath, status=idle', () => {
      const worker = registry.register({ projectPath: '/home/user/my-project', pid: 1234 });
      expect(worker.id).toBeDefined();
      expect(worker.name).toBe('my-project');
      expect(worker.projectPath).toBe('/home/user/my-project');
      expect(worker.pid).toBe(1234);
      expect(worker.status).toBe('idle');
      expect(worker.registeredAt).toBeGreaterThan(0);
      expect(worker.lastHeartbeat).toBeGreaterThan(0);
    });

    it('uses basename of projectPath as default name', () => {
      const worker = registry.register({ projectPath: '/foo/bar/baz', pid: 1 });
      expect(worker.name).toBe('baz');
    });

    it('uses provided name when given', () => {
      const worker = registry.register({ name: 'custom', projectPath: '/foo/bar', pid: 1 });
      expect(worker.name).toBe('custom');
    });

    it('deduplicates names for same project path', () => {
      const w1 = registry.register({ projectPath: '/home/user/olympus', pid: 1 });
      const w2 = registry.register({ projectPath: '/home/user/olympus', pid: 2 });
      const w3 = registry.register({ projectPath: '/home/user/olympus', pid: 3 });
      expect(w1.name).toBe('olympus');
      expect(w2.name).toBe('olympus-2');
      expect(w3.name).toBe('olympus-3');
    });

    it('deduplicates explicit names too', () => {
      const w1 = registry.register({ name: 'my-worker', projectPath: '/a', pid: 1 });
      const w2 = registry.register({ name: 'my-worker', projectPath: '/b', pid: 2 });
      expect(w1.name).toBe('my-worker');
      expect(w2.name).toBe('my-worker-2');
    });

    it('reuses name after worker unregistered', () => {
      const w1 = registry.register({ projectPath: '/home/user/olympus', pid: 1 });
      registry.unregister(w1.id);
      const w2 = registry.register({ projectPath: '/home/user/olympus', pid: 2 });
      expect(w2.name).toBe('olympus');
    });
  });

  // ── unregister ──

  describe('unregister', () => {
    it('returns true for existing worker', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      expect(registry.unregister(worker.id)).toBe(true);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('returns false for unknown id', () => {
      expect(registry.unregister('unknown-id')).toBe(false);
    });
  });

  // ── heartbeat ──

  describe('heartbeat', () => {
    it('updates lastHeartbeat', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      const original = worker.lastHeartbeat;
      // Advance slightly
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      registry.heartbeat(worker.id);
      const updated = registry.getAll()[0];
      expect(updated.lastHeartbeat).toBeGreaterThan(original);
      vi.useRealTimers();
    });

    it('returns false for unknown worker', () => {
      expect(registry.heartbeat('nope')).toBe(false);
    });

    it('self-heals busy worker without task id to idle on heartbeat', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      registry.markBusy(worker.id, 'task-1', 'do something');

      const mutable = registry.getAll()[0];
      mutable.currentTaskId = undefined;
      mutable.currentTaskPrompt = undefined;

      registry.heartbeat(worker.id);

      const healed = registry.getAll()[0];
      expect(healed.status).toBe('idle');
      expect(healed.currentTaskId).toBeUndefined();
    });
  });

  // ── no heartbeat auto-removal ──

  describe('no heartbeat auto-removal', () => {
    it('workers are never auto-removed by heartbeat timeout', () => {
      vi.useFakeTimers();
      const reg = new WorkerRegistry();
      reg.register({ projectPath: '/p', pid: 1 });
      expect(reg.getAll()).toHaveLength(1);

      // Advance well past any previous timeout (5 minutes) — worker should remain
      vi.advanceTimersByTime(300_000);
      expect(reg.getAll()).toHaveLength(1);

      reg.dispose();
      vi.useRealTimers();
    });

    it('workers are only removed by explicit unregister', () => {
      const reg = new WorkerRegistry();
      const worker = reg.register({ projectPath: '/p', pid: 1 });
      expect(reg.getAll()).toHaveLength(1);

      reg.unregister(worker.id);
      expect(reg.getAll()).toHaveLength(0);

      reg.dispose();
    });
  });

  // ── findByProject ──

  describe('findByProject', () => {
    it('matches by name (case-insensitive)', () => {
      registry.register({ name: 'MyProject', projectPath: '/some/path', pid: 1 });
      expect(registry.findByProject('myproject')).not.toBeNull();
      expect(registry.findByProject('MYPROJECT')).not.toBeNull();
    });

    it('matches by path substring', () => {
      registry.register({ projectPath: '/home/user/olympus', pid: 1 });
      expect(registry.findByProject('olympus')).not.toBeNull();
    });

    it('returns null for no match', () => {
      registry.register({ projectPath: '/foo', pid: 1 });
      expect(registry.findByProject('bar')).toBeNull();
    });

    it('finds deduplicated worker by suffixed name', () => {
      registry.register({ projectPath: '/home/user/olympus', pid: 1 });
      const w2 = registry.register({ projectPath: '/home/user/olympus', pid: 2 });
      const found = registry.findByProject('olympus-2');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(w2.id);
    });
  });

  // ── markBusy / markIdle ──

  describe('markBusy / markIdle', () => {
    it('transitions status correctly', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      expect(worker.status).toBe('idle');

      registry.markBusy(worker.id, 'task-1', 'do something');
      const busy = registry.getAll()[0];
      expect(busy.status).toBe('busy');
      expect(busy.currentTaskId).toBe('task-1');
      expect(busy.currentTaskPrompt).toBe('do something');

      registry.markIdle(worker.id);
      const idle = registry.getAll()[0];
      expect(idle.status).toBe('idle');
      expect(idle.currentTaskId).toBeUndefined();
    });
  });

  // ── createTask / completeTask ──

  describe('createTask / completeTask', () => {
    it('creates task and marks worker busy', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      const task = registry.createTask(worker.id, 'fix bug');

      expect(task.taskId).toBeDefined();
      expect(task.workerId).toBe(worker.id);
      expect(task.workerName).toBe('p');
      expect(task.prompt).toBe('fix bug');
      expect(task.status).toBe('running');

      const w = registry.getAll()[0];
      expect(w.status).toBe('busy');
    });

    it('completes task and marks worker idle', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      const task = registry.createTask(worker.id, 'fix bug');
      const result = makeResult();

      registry.completeTask(task.taskId, result);

      const completed = registry.getTask(task.taskId);
      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeGreaterThan(0);
      expect(completed?.result).toEqual(result);

      const w = registry.getAll()[0];
      expect(w.status).toBe('idle');
    });

    it('marks failed task correctly', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      const task = registry.createTask(worker.id, 'fail');
      registry.completeTask(task.taskId, makeResult(false));

      const completed = registry.getTask(task.taskId);
      expect(completed?.status).toBe('failed');
    });

    it('self-heals stale busy state when current task is already completed', () => {
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      const task = registry.createTask(worker.id, 'fix bug');
      registry.completeTask(task.taskId, makeResult(true));

      const mutable = registry.getAll()[0];
      mutable.status = 'busy';
      mutable.currentTaskId = task.taskId;
      mutable.currentTaskPrompt = 'stale prompt';

      const healed = registry.getAll()[0];
      expect(healed.status).toBe('idle');
      expect(healed.currentTaskId).toBeUndefined();
      expect(healed.currentTaskPrompt).toBeUndefined();
    });
  });

  // ── getActiveTasks ──

  describe('getActiveTasks', () => {
    it('returns only running tasks', () => {
      const w1 = registry.register({ projectPath: '/a', pid: 1 });
      const w2 = registry.register({ projectPath: '/b', pid: 2 });
      registry.createTask(w1.id, 'task 1');
      const task2 = registry.createTask(w2.id, 'task 2');
      registry.completeTask(task2.taskId, makeResult());

      const active = registry.getActiveTasks();
      expect(active).toHaveLength(1);
      expect(active[0].prompt).toBe('task 1');
    });
  });

  // ── getIdle ──

  describe('getIdle', () => {
    it('returns only idle workers', () => {
      const w1 = registry.register({ projectPath: '/a', pid: 1 });
      registry.register({ projectPath: '/b', pid: 2 });
      registry.markBusy(w1.id, 't', 'p');
      expect(registry.getIdle()).toHaveLength(1);
    });
  });

  // ── events ──

  describe('events', () => {
    it('emits worker:registered on register', () => {
      const handler = vi.fn();
      registry.on('worker:registered', handler);
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      expect(handler).toHaveBeenCalledWith(worker);
    });

    it('emits worker:unregistered on unregister', () => {
      const handler = vi.fn();
      registry.on('worker:unregistered', handler);
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      registry.unregister(worker.id);
      expect(handler).toHaveBeenCalledWith(worker);
    });

    it('emits task:completed on completeTask', () => {
      const handler = vi.fn();
      registry.on('task:completed', handler);
      const worker = registry.register({ projectPath: '/p', pid: 1 });
      const task = registry.createTask(worker.id, 'do');
      registry.completeTask(task.taskId, makeResult());
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].taskId).toBe(task.taskId);
    });
  });
});
