import { describe, expect, it } from 'vitest';
import {
  resolveRuntimeSocketsRoot,
  resolveWorkerRuntimeKind,
  selectPendingTaskForWorker,
} from '../commands/start.js';

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

describe('resolveWorkerRuntimeKind', () => {
  it('defaults to tmux when runtime is omitted', () => {
    expect(resolveWorkerRuntimeKind(undefined)).toBe('tmux');
  });

  it('accepts explicit tmux and pty values', () => {
    expect(resolveWorkerRuntimeKind('tmux')).toBe('tmux');
    expect(resolveWorkerRuntimeKind('pty')).toBe('pty');
  });

  it('rejects unsupported runtime values', () => {
    expect(() => resolveWorkerRuntimeKind('ssh')).toThrow('Unsupported worker runtime');
  });
});

describe('resolveRuntimeSocketsRoot', () => {
  it('uses the explicit environment override when provided', () => {
    expect(resolveRuntimeSocketsRoot('/tmp/custom-runtime-sockets')).toBe('/tmp/custom-runtime-sockets');
  });

  it('falls back to the olympus runtime-sockets directory under the home directory', () => {
    expect(resolveRuntimeSocketsRoot(undefined, '/Users/jobc')).toBe('/Users/jobc/.olympus/runtime-sockets');
  });
});
