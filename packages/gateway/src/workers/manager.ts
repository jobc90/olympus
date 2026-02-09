import { EventEmitter } from 'node:events';
import type { WorkerTask, WorkerResult, WorkerConfig } from '@olympus-dev/protocol';
import { DEFAULT_WORKER_CONFIG } from '@olympus-dev/protocol';
import { ClaudeCliWorker } from './claude-worker.js';

/**
 * Worker Manager — manages a pool of Claude CLI worker processes.
 *
 * Enforces concurrent worker limits and provides lifecycle management.
 * Emits: 'worker:started', 'worker:output', 'worker:done'
 */
export class WorkerManager extends EventEmitter {
  private workers = new Map<string, ClaudeCliWorker>();
  private config: WorkerConfig;
  private maxConcurrent: number;

  constructor(options?: {
    config?: Partial<WorkerConfig>;
    maxConcurrent?: number;
  }) {
    super();
    this.config = { ...DEFAULT_WORKER_CONFIG, ...options?.config };
    this.maxConcurrent = options?.maxConcurrent ?? 3;
  }

  /**
   * Execute a worker task. Returns when the worker completes.
   */
  async execute(task: WorkerTask): Promise<WorkerResult> {
    // Check concurrent limit
    const activeCount = this.getActiveCount();
    if (activeCount >= this.maxConcurrent) {
      return {
        workerId: task.id,
        status: 'failed',
        exitCode: null,
        output: '',
        duration: 0,
        error: `동시 워커 한계 초과 (${this.maxConcurrent})`,
      };
    }

    const worker = new ClaudeCliWorker(task, this.config);
    this.workers.set(task.id, worker);

    // Forward events
    worker.on('output', (content: string) => {
      this.emit('worker:output', { workerId: task.id, content });
    });
    worker.on('error', (content: string) => {
      this.emit('worker:error', { workerId: task.id, content });
    });

    this.emit('worker:started', {
      workerId: task.id,
      projectPath: task.projectPath,
      workerType: task.type,
    });

    const result = await worker.start();

    this.emit('worker:done', { workerId: task.id, result });

    // Clean up after a delay to allow output queries
    setTimeout(() => {
      this.workers.delete(task.id);
    }, 60_000);

    return result;
  }

  /**
   * Terminate a specific worker
   */
  terminate(workerId: string): boolean {
    const worker = this.workers.get(workerId);
    if (!worker) return false;
    worker.terminate();
    return true;
  }

  /**
   * Terminate all active workers
   */
  terminateAll(): void {
    for (const [, worker] of this.workers) {
      worker.terminate();
    }
  }

  /**
   * Get worker info for all workers
   */
  listWorkers(): Array<{
    id: string;
    status: string;
    outputPreview: string;
  }> {
    return [...this.workers.entries()].map(([id, worker]) => ({
      id,
      status: worker.getStatus(),
      outputPreview: worker.getOutputPreview(),
    }));
  }

  /**
   * Get output for a specific worker
   */
  getWorkerOutput(workerId: string): string | null {
    const worker = this.workers.get(workerId);
    return worker ? worker.getOutput() : null;
  }

  /**
   * Count of currently running workers
   */
  getActiveCount(): number {
    let count = 0;
    for (const [, worker] of this.workers) {
      if (worker.getStatus() === 'running') count++;
    }
    return count;
  }
}
