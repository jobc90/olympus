import { PtyWorker, type PtyWorkerOptions } from './pty-worker.js';
import type { RuntimeControlHostLike } from './runtime-control-host.js';
import type {
  TaskResult,
  TimeoutAwareResult,
  WorkerRuntimeLike,
} from './worker-runtime.js';

const MAX_OUTPUT_HISTORY_CHARS = 64_000;

export interface PtyWorkerHostLike extends RuntimeControlHostLike {
  start(): Promise<void>;
  executeTaskWithTimeout(prompt: string): Promise<TimeoutAwareResult>;
  monitorForCompletion(prompt: string): Promise<TaskResult>;
  sendInput(input: string, submit?: boolean): void;
  resize(cols: number, rows: number): void;
  readonly isProcessing: boolean;
}

export interface PtyWorkerHostOptions extends PtyWorkerOptions {
  worker?: WorkerRuntimeLike;
}

export class PtyWorkerHost implements PtyWorkerHostLike {
  private readonly worker: WorkerRuntimeLike;

  private outputHistory = '';

  constructor(options: PtyWorkerHostOptions) {
    const onData = (data: string) => {
      this.outputHistory += data;
      if (this.outputHistory.length > MAX_OUTPUT_HISTORY_CHARS) {
        this.outputHistory = this.outputHistory.slice(-MAX_OUTPUT_HISTORY_CHARS);
      }
      options.onData?.(data);
    };

    this.worker = options.worker ?? new PtyWorker({
      ...options,
      onData,
    });
  }

  async start(): Promise<void> {
    await this.worker.start();
  }

  async executeTaskWithTimeout(prompt: string): Promise<TimeoutAwareResult> {
    return this.worker.executeTaskWithTimeout(prompt);
  }

  async monitorForCompletion(prompt: string): Promise<TaskResult> {
    return this.worker.monitorForCompletion(prompt);
  }

  sendInput(input: string, submit = false): void {
    this.worker.sendInput(submit ? `${input}\r` : input);
  }

  sendRuntimeInput(input: string, submit?: boolean): void {
    this.sendInput(input, submit);
  }

  resize(cols: number, rows: number): void {
    this.worker.resize(cols, rows);
  }

  async resetSession(): Promise<void> {
    await this.stop();
    this.outputHistory = '';
    await this.start();
  }

  async captureTerminalSnapshot(lines = 200): Promise<string> {
    const allLines = this.outputHistory.split('\n');
    return allLines.slice(-Math.max(1, lines)).join('\n');
  }

  stop(): void | Promise<void> {
    return this.worker.destroy();
  }

  get isProcessing(): boolean {
    return this.worker.isProcessing;
  }
}
