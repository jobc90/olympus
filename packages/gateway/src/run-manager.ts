import { randomUUID } from 'node:crypto';
import { OlympusBus } from '@olympus-dev/core';
import type { TaskPayload, RunStatus } from '@olympus-dev/protocol';

export interface RunOptions {
  prompt: string;
  context?: string;
  agents?: ('gemini' | 'codex' | 'gpt')[];
  usePro?: boolean;
  timeout?: number;
}

export interface RunInstance {
  id: string;
  bus: OlympusBus;
  abortController: AbortController;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  prompt: string;
  options: RunOptions;
  tasks: Map<string, TaskPayload>;
  phase: number;
  phaseName: string;
}

export interface RunManagerOptions {
  maxConcurrentRuns?: number;
  onEvent?: (runId: string, event: { type: string; payload: unknown }) => void;
}

/**
 * RunManager - Manages run instances and their lifecycle
 */
export class RunManager {
  private runs = new Map<string, RunInstance>();
  private maxConcurrentRuns: number;
  private onEvent?: (runId: string, event: { type: string; payload: unknown }) => void;

  constructor(options: RunManagerOptions = {}) {
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? 5;
    this.onEvent = options.onEvent;
  }

  /**
   * Create a new run instance
   */
  createRun(options: RunOptions): RunInstance {
    // Check concurrent run limit
    const activeRuns = [...this.runs.values()].filter((r) => r.status === 'running');
    if (activeRuns.length >= this.maxConcurrentRuns) {
      throw new Error(`Maximum concurrent runs (${this.maxConcurrentRuns}) exceeded`);
    }

    const runId = randomUUID().slice(0, 8);
    const bus = OlympusBus.create(runId);
    const controller = new AbortController();

    const instance: RunInstance = {
      id: runId,
      bus,
      abortController: controller,
      status: 'running',
      createdAt: Date.now(),
      prompt: options.prompt,
      options,
      tasks: new Map(),
      phase: -1,
      phaseName: 'idle',
    };

    // Subscribe to bus events and forward to onEvent callback
    this.subscribeToBusEvents(instance);

    this.runs.set(runId, instance);
    return instance;
  }

  /**
   * Get a run by ID
   */
  getRun(runId: string): RunInstance | undefined {
    return this.runs.get(runId);
  }

  /**
   * List all runs
   */
  listRuns(): RunInstance[] {
    return [...this.runs.values()];
  }

  /**
   * List active (running) runs only
   */
  listActiveRuns(): RunInstance[] {
    return [...this.runs.values()].filter((r) => r.status === 'running');
  }

  /**
   * Cancel a run by ID
   */
  cancelRun(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'running') {
      return false;
    }

    run.abortController.abort();
    run.status = 'cancelled';
    run.bus.emitLog('info', 'Run cancelled by user', 'run-manager');
    return true;
  }

  /**
   * Cancel all running runs
   */
  cancelAllRuns(): string[] {
    const cancelled: string[] = [];
    for (const [runId, run] of this.runs) {
      if (run.status === 'running') {
        run.abortController.abort();
        run.status = 'cancelled';
        run.bus.emitLog('info', 'Run cancelled by user', 'run-manager');
        cancelled.push(runId);
      }
    }
    return cancelled;
  }

  /**
   * Mark a run as completed
   */
  completeRun(runId: string, success: boolean): void {
    const run = this.runs.get(runId);
    if (!run) return;

    run.status = success ? 'completed' : 'failed';
  }

  /**
   * Get run status for protocol
   */
  getRunStatus(runId: string): RunStatus | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;

    return {
      runId: run.id,
      status: run.status,
      prompt: run.prompt,
      createdAt: run.createdAt,
      phase: run.phase,
      phaseName: run.phaseName,
      tasks: [...run.tasks.values()],
    };
  }

  /**
   * Get all run statuses
   */
  getAllRunStatuses(): RunStatus[] {
    return [...this.runs.values()].map((run) => ({
      runId: run.id,
      status: run.status,
      prompt: run.prompt,
      createdAt: run.createdAt,
      phase: run.phase,
      phaseName: run.phaseName,
      tasks: [...run.tasks.values()],
    }));
  }

  /**
   * Clean up old completed runs (keep last N)
   */
  cleanup(keepLast: number = 10): void {
    const completed = [...this.runs.entries()]
      .filter(([, r]) => r.status !== 'running')
      .sort((a, b) => b[1].createdAt - a[1].createdAt);

    // Remove runs beyond keepLast
    for (let i = keepLast; i < completed.length; i++) {
      const [runId, run] = completed[i];
      run.bus.dispose();
      this.runs.delete(runId);
    }
  }

  /**
   * Subscribe to bus events and forward them
   */
  private subscribeToBusEvents(run: RunInstance): void {
    const forward = (type: string) => {
      run.bus.on(type as keyof typeof run.bus, (payload: unknown) => {
        // Update internal state
        if (type === 'phase:change') {
          const p = payload as { phase: number; phaseName: string };
          run.phase = p.phase;
          run.phaseName = p.phaseName;
        }
        if (type === 'task:update') {
          const t = payload as TaskPayload;
          run.tasks.set(t.taskId, t);
        }

        // Forward to callback
        this.onEvent?.(run.id, { type, payload });
      });
    };

    forward('phase:change');
    forward('agent:start');
    forward('agent:chunk');
    forward('agent:complete');
    forward('agent:error');
    forward('task:update');
    forward('log');
  }
}
