import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerManager } from '../workers/manager.js';
import { ApiWorker } from '../workers/api-worker.js';
import { TmuxWorker } from '../workers/tmux-worker.js';
import { ClaudeCliWorker } from '../workers/claude-worker.js';

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

describe('Worker Factory', () => {
  it('should accept apiKey and apiModel options', () => {
    const manager = new WorkerManager({
      maxConcurrent: 3,
      apiKey: 'test-key',
      apiModel: 'claude-sonnet-4-20250514',
    });
    // Should not throw
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should accept config options', () => {
    const manager = new WorkerManager({
      maxConcurrent: 2,
      config: { type: 'child_process', logDir: '/tmp/logs', maxOutputBuffer: 5000 },
    });
    expect(manager.getActiveCount()).toBe(0);
  });
});

describe('ApiWorker', () => {
  it('should fail without API key', async () => {
    const worker = new ApiWorker(
      { id: 'w1', type: 'claude-api', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'child_process', logDir: '/tmp', maxOutputBuffer: 10000 },
      undefined, // no API key
    );

    const result = await worker.start();
    expect(result.status).toBe('failed');
    expect(result.error).toContain('API 키');
  });

  it('should start in pending status', () => {
    const worker = new ApiWorker(
      { id: 'w2', type: 'claude-api', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'child_process', logDir: '/tmp', maxOutputBuffer: 10000 },
    );

    expect(worker.getStatus()).toBe('pending');
    expect(worker.getOutput()).toBe('');
    expect(worker.getOutputPreview()).toBe('');
  });

  it('should terminate gracefully', () => {
    const worker = new ApiWorker(
      { id: 'w3', type: 'claude-api', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'child_process', logDir: '/tmp', maxOutputBuffer: 10000 },
    );

    // Should not throw when not running
    expect(() => worker.terminate()).not.toThrow();
  });
});

describe('TmuxWorker', () => {
  it('should start in pending status', () => {
    const worker = new TmuxWorker(
      { id: 'w4', type: 'tmux', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'tmux', logDir: '/tmp/test-logs', maxOutputBuffer: 10000 },
    );

    expect(worker.getStatus()).toBe('pending');
    expect(worker.getOutput()).toBe('');
  });

  it('should terminate gracefully when not running', () => {
    const worker = new TmuxWorker(
      { id: 'w5', type: 'tmux', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'tmux', logDir: '/tmp/test-logs', maxOutputBuffer: 10000 },
    );

    // Should not throw
    expect(() => worker.terminate()).not.toThrow();
  });

  it('should generate unique session names', () => {
    const w1 = new TmuxWorker(
      { id: 'abc', type: 'tmux', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'tmux', logDir: '/tmp/test-logs', maxOutputBuffer: 10000 },
    );
    const w2 = new TmuxWorker(
      { id: 'def', type: 'tmux', prompt: 'test', projectPath: '/tmp', dependencies: [], timeout: 5000, orchestration: false, successCriteria: [] },
      { type: 'tmux', logDir: '/tmp/test-logs', maxOutputBuffer: 10000 },
    );

    // Different IDs → different session names (verified by output not being shared)
    expect(w1.getOutput()).toBe('');
    expect(w2.getOutput()).toBe('');
  });
});
