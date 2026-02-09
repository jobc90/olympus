import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import type { WorkerTask, WorkerResult, WorkerConfig } from '@olympus-dev/protocol';
import { DEFAULT_WORKER_CONFIG } from '@olympus-dev/protocol';
import { ClaudeCliWorker } from './claude-worker.js';
import { ApiWorker } from './api-worker.js';
import { TmuxWorker } from './tmux-worker.js';
import { DockerWorker } from './docker-worker.js';
import type { Worker } from './types.js';

/**
 * Pending item in the worker queue
 */
interface QueuedWorkerTask {
  task: WorkerTask;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  queuedAt: number;
}

/**
 * Worker Manager — manages a pool of worker processes.
 *
 * Factory pattern: creates the appropriate worker based on task.type:
 * - 'claude-cli' (default): spawns Claude CLI as child process
 * - 'claude-api': calls Claude API directly (streaming)
 * - 'tmux': runs Claude CLI inside a tmux session
 * - 'docker': runs inside a Docker container
 *
 * G1: FIFO queue — when concurrent limit is reached, tasks are queued
 * instead of immediately rejected.
 *
 * Enforces concurrent worker limits and provides lifecycle management.
 * Emits: 'worker:started', 'worker:output', 'worker:done', 'worker:error', 'worker:queued'
 */
export class WorkerManager extends EventEmitter {
  private workers = new Map<string, Worker>();
  private config: WorkerConfig;
  private maxConcurrent: number;
  private apiKey?: string;
  private apiModel?: string;
  private queue: QueuedWorkerTask[] = [];
  private maxQueueSize: number;

  constructor(options?: {
    config?: Partial<WorkerConfig>;
    maxConcurrent?: number;
    maxQueueSize?: number;
    apiKey?: string;
    apiModel?: string;
  }) {
    super();
    this.config = { ...DEFAULT_WORKER_CONFIG, ...options?.config };
    this.maxConcurrent = options?.maxConcurrent ?? 3;
    this.maxQueueSize = options?.maxQueueSize ?? 20;
    this.apiKey = options?.apiKey;
    this.apiModel = options?.apiModel;
  }

  /**
   * Execute a worker task. If the pool is full, the task is queued.
   * Returns when the worker completes (may wait in queue first).
   */
  async execute(task: WorkerTask): Promise<WorkerResult> {
    // Check concurrent limit — queue if full
    const activeCount = this.getActiveCount();
    if (activeCount >= this.maxConcurrent) {
      // G1: Queue the task instead of failing immediately
      if (this.queue.length >= this.maxQueueSize) {
        return {
          workerId: task.id,
          status: 'failed',
          exitCode: null,
          output: '',
          duration: 0,
          error: `워커 큐 가득 참 (${this.maxQueueSize})`,
        };
      }

      return new Promise<WorkerResult>((resolve, reject) => {
        this.queue.push({ task, resolve, reject, queuedAt: Date.now() });
        this.emit('worker:queued', {
          workerId: task.id,
          position: this.queue.length,
          queueSize: this.queue.length,
        });
      });
    }

    return this.executeImmediate(task);
  }

  /**
   * Get current queue length
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Execute a task immediately (no queue check)
   */
  private async executeImmediate(task: WorkerTask): Promise<WorkerResult> {
    const worker = this.createWorker(task);
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

    // H2: Write worker output to log file
    this.writeWorkerLog(task.id, result);

    // Clean up after a delay to allow output queries
    setTimeout(() => {
      this.workers.delete(task.id);
    }, 60_000);

    // G1: Drain queue — start next queued task if slot is available
    this.drainQueue();

    return result;
  }

  /**
   * H2: Write worker output to log file for debugging/auditing.
   */
  private writeWorkerLog(workerId: string, result: WorkerResult): void {
    try {
      const logDir = this.config.logDir.replace(/^~/, process.env.HOME || '/tmp');
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logFile = `${logDir}/${workerId}.log`;
      const header = `[${new Date().toISOString()}] Worker: ${workerId} Status: ${result.status} Exit: ${result.exitCode} Duration: ${result.duration}ms\n`;
      const body = result.output ? `${result.output}\n` : '';
      const error = result.error ? `[ERROR] ${result.error}\n` : '';

      appendFileSync(logFile, header + body + error);
    } catch {
      // Log writing is best-effort
    }
  }

  /**
   * Process the next queued task if a worker slot is available
   */
  private drainQueue(): void {
    if (this.queue.length === 0) return;
    if (this.getActiveCount() >= this.maxConcurrent) return;

    const next = this.queue.shift();
    if (!next) return;

    this.executeImmediate(next.task).then(next.resolve).catch(next.reject);
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

  /**
   * Factory — create the appropriate worker based on task.type.
   */
  private createWorker(task: WorkerTask): Worker {
    switch (task.type) {
      case 'claude-api':
        return new ApiWorker(task, this.config, this.apiKey, this.apiModel);
      case 'tmux':
        return new TmuxWorker(task, this.config);
      case 'docker':
        return new DockerWorker(task, this.config);
      case 'claude-cli':
      default:
        return new ClaudeCliWorker(task, this.config);
    }
  }
}
