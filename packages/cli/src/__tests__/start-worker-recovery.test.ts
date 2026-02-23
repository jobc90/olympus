import { describe, expect, it } from 'vitest';
import { selectPendingTaskForWorker } from '../commands/start.js';

describe('selectPendingTaskForWorker', () => {
  it('selects running task for the target worker', () => {
    const task = selectPendingTaskForWorker([
      { taskId: 't1', workerId: 'w1', workerName: 'a', prompt: 'x', status: 'running' },
    ], 'w1', new Set());
    expect(task?.taskId).toBe('t1');
  });

  it('skips tasks from other workers', () => {
    const task = selectPendingTaskForWorker([
      { taskId: 't1', workerId: 'w2', workerName: 'b', prompt: 'x', status: 'running' },
    ], 'w1', new Set());
    expect(task).toBeNull();
  });

  it('skips already handled tasks', () => {
    const task = selectPendingTaskForWorker([
      { taskId: 't1', workerId: 'w1', workerName: 'a', prompt: 'x', status: 'running' },
    ], 'w1', new Set(['t1']));
    expect(task).toBeNull();
  });

  it('skips completed and failed tasks', () => {
    const task = selectPendingTaskForWorker([
      { taskId: 't1', workerId: 'w1', workerName: 'a', prompt: 'x', status: 'completed' },
      { taskId: 't2', workerId: 'w1', workerName: 'a', prompt: 'x', status: 'failed' },
    ], 'w1', new Set());
    expect(task).toBeNull();
  });

  it('accepts timeout tasks for recovery', () => {
    const task = selectPendingTaskForWorker([
      { taskId: 't1', workerId: 'w1', workerName: 'a', prompt: 'x', status: 'timeout' },
    ], 'w1', new Set());
    expect(task?.taskId).toBe('t1');
  });
});
