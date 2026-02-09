import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerManager } from '../workers/manager.js';

describe('WorkerManager', () => {
  let manager: WorkerManager;

  beforeEach(() => {
    manager = new WorkerManager({ maxConcurrent: 2 });
  });

  it('should start with 0 active workers', () => {
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should list no workers initially', () => {
    expect(manager.listWorkers()).toEqual([]);
  });

  it('should return null for unknown worker output', () => {
    expect(manager.getWorkerOutput('nonexistent')).toBeNull();
  });

  it('should return false when terminating unknown worker', () => {
    expect(manager.terminate('nonexistent')).toBe(false);
  });

  it('should reject when concurrent limit exceeded', async () => {
    // Mock execute to be slow
    const slowManager = new WorkerManager({ maxConcurrent: 0 });

    const result = await slowManager.execute({
      id: 'w1',
      type: 'claude-cli',
      prompt: 'test',
      projectPath: '/tmp',
      dependencies: [],
      timeout: 1000,
      orchestration: false,
      successCriteria: [],
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('동시 워커 한계 초과');
  });

  it('should emit worker:started event', async () => {
    const startedEvents: unknown[] = [];
    manager.on('worker:started', (e) => startedEvents.push(e));

    // This will fail to spawn (claude binary not available in test)
    // but should still emit worker:started
    await manager.execute({
      id: 'test-worker',
      type: 'claude-cli',
      prompt: 'test prompt',
      projectPath: '/tmp',
      dependencies: [],
      timeout: 5000,
      orchestration: false,
      successCriteria: [],
    });

    expect(startedEvents.length).toBe(1);
    expect((startedEvents[0] as { workerId: string }).workerId).toBe('test-worker');
  });

  it('should terminateAll without error', () => {
    // Should not throw even with no workers
    expect(() => manager.terminateAll()).not.toThrow();
  });
});
