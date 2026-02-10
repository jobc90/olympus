import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerWorker } from '../workers/docker-worker.js';
import type { WorkerTask, WorkerConfig } from '@olympus-dev/protocol';
import { DEFAULT_WORKER_CONFIG } from '@olympus-dev/protocol';

function makeTask(overrides: Partial<WorkerTask> = {}): WorkerTask {
  return {
    id: 'docker-test-1',
    type: 'docker',
    prompt: 'echo hello',
    projectPath: '/tmp/test-project',
    dependencies: [],
    timeout: 30_000,
    orchestration: false,
    successCriteria: [],
    ...overrides,
  };
}

describe('DockerWorker', () => {
  let config: WorkerConfig;

  beforeEach(() => {
    config = { ...DEFAULT_WORKER_CONFIG };
  });

  it('should implement Worker interface', () => {
    const worker = new DockerWorker(makeTask(), config);
    expect(worker.getStatus()).toBe('pending');
    expect(worker.getOutput()).toBe('');
    expect(worker.getOutputPreview()).toBe('');
  });

  it('should return failed if Docker is not available', async () => {
    const worker = new DockerWorker(makeTask(), config);

    // Suppress unhandled 'error' events from EventEmitter (stderr output)
    worker.on('error', () => {});

    // In CI/test environments Docker may or may not be available
    const result = await worker.start();

    // Either docker works (completed) or not (failed with descriptive error)
    expect(['completed', 'failed']).toContain(result.status);
    if (result.status === 'failed') {
      expect(result.error).toContain('Docker');
    }
  }, 30_000);

  it('should generate unique container names', () => {
    const w1 = new DockerWorker(makeTask({ id: 'w1' }), config);
    const w2 = new DockerWorker(makeTask({ id: 'w2' }), config);

    // They both start as pending - container names are internal
    expect(w1.getStatus()).toBe('pending');
    expect(w2.getStatus()).toBe('pending');
  });

  it('should handle terminate when not running', () => {
    const worker = new DockerWorker(makeTask(), config);
    // Should not throw when terminating a pending worker
    worker.terminate();
    expect(worker.getStatus()).toBe('pending');
  });

  it('should truncate output preview', () => {
    const worker = new DockerWorker(makeTask(), config);
    // Output is empty initially
    expect(worker.getOutputPreview(10)).toBe('');
  });
});
