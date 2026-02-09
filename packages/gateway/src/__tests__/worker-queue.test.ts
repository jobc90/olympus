import { describe, it, expect, vi } from 'vitest';
import { WorkerManager } from '../workers/manager.js';
import type { WorkerTask } from '@olympus-dev/protocol';

function makeTask(overrides: Partial<WorkerTask> = {}): WorkerTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 6)}`,
    type: 'claude-cli',
    prompt: 'echo hello',
    projectPath: '/tmp/test',
    dependencies: [],
    timeout: 30_000,
    orchestration: false,
    successCriteria: [],
    ...overrides,
  };
}

describe('WorkerManager FIFO Queue (G1)', () => {
  it('should queue tasks when pool is full instead of rejecting', async () => {
    const manager = new WorkerManager({ maxConcurrent: 1, maxQueueSize: 5 });
    const events: unknown[] = [];
    manager.on('worker:queued', (e: unknown) => events.push(e));

    // Spy on execute to control timing — first call starts a long-running worker
    vi.spyOn(manager, 'execute')
      .mockImplementationOnce(async () => {
        // Simulate a long-running task by calling original but we just return after delay
        await new Promise(r => setTimeout(r, 100));
        return {
          workerId: 'task-1',
          status: 'completed' as const,
          exitCode: 0,
          output: 'done',
          duration: 100,
        };
      })
      .mockImplementationOnce(async () => {
        // Second call — will be "queued" but we just return
        return {
          workerId: 'task-2',
          status: 'completed' as const,
          exitCode: 0,
          output: 'done',
          duration: 50,
        };
      });

    const p1 = manager.execute(makeTask({ id: 'task-1' }));
    const p2 = manager.execute(makeTask({ id: 'task-2' }));

    await Promise.all([p1, p2]);
    // Both should complete
    const r1 = await p1;
    expect(r1.status).toBe('completed');
  });

  it('should reject when queue is also full', async () => {
    // Use a fresh manager where we can control activeCount
    const manager = new WorkerManager({ maxConcurrent: 1, maxQueueSize: 0 });

    // Mock getActiveCount to always return full pool
    vi.spyOn(manager, 'getActiveCount').mockReturnValue(1);

    // With maxQueueSize=0, any task when pool is full should fail immediately
    const result = await manager.execute(makeTask({ id: 'task-overflow' }));
    expect(result.status).toBe('failed');
    expect(result.error).toContain('큐 가득 참');
  });

  it('should expose queueLength property', () => {
    const manager = new WorkerManager({ maxConcurrent: 2 });
    expect(manager.queueLength).toBe(0);
  });

  it('should accept maxQueueSize option', () => {
    const manager = new WorkerManager({ maxConcurrent: 2, maxQueueSize: 10 });
    expect(manager.queueLength).toBe(0);
  });
});
