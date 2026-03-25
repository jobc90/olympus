import type { WorkerRuntimeLike } from './worker-runtime.js';

export interface TaskPayload {
  taskId: string;
  workerId: string;
  workerName: string;
  prompt: string;
  provider?: string;
  dangerouslySkipPermissions?: boolean;
  projectPath?: string;
  source?: string;
}

export interface WorkerInputPayload {
  workerId: string;
  input: string;
}

export interface WorkerResizePayload {
  workerId: string;
  cols: number;
  rows: number;
}

export interface WorkerTaskSnapshot {
  taskId: string;
  workerId: string;
  workerName: string;
  prompt: string;
  status: 'running' | 'timeout' | 'completed' | 'failed';
}

export interface ReportTaskResultInput {
  success: boolean;
  text?: string;
  error?: string;
  durationMs: number;
  truncated?: boolean;
  originalLength?: number;
}

export interface WorkerTaskOrchestratorOptions {
  workerId: string;
  projectPath: string;
  runtime: WorkerRuntimeLike;
  handledTaskIds: Set<string>;
  isRuntimeOwningTerminal: () => boolean;
  reportResult: (taskId: string, result: ReportTaskResultInput) => Promise<void>;
  logDiagnostic?: (message: string) => void;
}

const TEXT_LIMIT = 50_000;

export function selectPendingTaskForWorker(
  tasks: WorkerTaskSnapshot[],
  workerId: string,
  handledTaskIds: Set<string>,
): WorkerTaskSnapshot | null {
  for (const task of tasks) {
    if (task.workerId !== workerId) continue;
    if (task.status !== 'running' && task.status !== 'timeout') continue;
    if (handledTaskIds.has(task.taskId)) continue;
    return task;
  }
  return null;
}

export class WorkerTaskOrchestrator {
  constructor(private readonly options: WorkerTaskOrchestratorOptions) {}

  private get runtimeOwnsTerminal(): boolean {
    return this.options.isRuntimeOwningTerminal();
  }

  async handleAssignedTask(task: TaskPayload): Promise<void> {
    if (this.options.runtime.isProcessing) {
      if (!this.runtimeOwnsTerminal) {
        this.options.logDiagnostic?.('⚠ 이미 작업 진행 중');
      }
      return;
    }

    if (task.source === 'terminal') {
      this.options.handledTaskIds.add(task.taskId);
      this.options.runtime.monitorForCompletion(task.prompt)
        .then((result) => this.options.reportResult(task.taskId, this.buildSuccessResult(result)))
        .catch((error: Error) => this.options.reportResult(task.taskId, {
          success: false,
          error: error.message,
          durationMs: 0,
        }));
      return;
    }

    if (task.source === 'local-pty') {
      this.options.handledTaskIds.add(task.taskId);
      return;
    }

    await this.executeTask(task);
  }

  async recoverPendingTask(tasks: WorkerTaskSnapshot[]): Promise<void> {
    if (this.options.runtime.isProcessing) return;

    const pending = selectPendingTaskForWorker(
      tasks,
      this.options.workerId,
      this.options.handledTaskIds,
    );
    if (!pending) return;

    if (!this.runtimeOwnsTerminal) {
      this.options.logDiagnostic?.(`[worker] 누락된 작업 복구: ${pending.taskId.slice(0, 8)} (${pending.workerName})`);
    }

    await this.executeTask({
      taskId: pending.taskId,
      workerId: pending.workerId,
      workerName: pending.workerName,
      prompt: pending.prompt,
      projectPath: this.options.projectPath,
    });
  }

  forwardInput(payload: WorkerInputPayload): void {
    if (typeof payload.input === 'string' && payload.input.length > 0) {
      this.options.runtime.sendInput(payload.input);
    }
  }

  forwardResize(payload: WorkerResizePayload): void {
    this.options.runtime.resize(payload.cols, payload.rows);
  }

  private async executeTask(task: TaskPayload): Promise<void> {
    if (this.options.handledTaskIds.has(task.taskId)) {
      return;
    }
    this.options.handledTaskIds.add(task.taskId);

    try {
      const { result } = await this.options.runtime.executeTaskWithTimeout(task.prompt);
      await this.options.reportResult(task.taskId, this.buildSuccessResult(result));
    } catch (error) {
      if (!this.runtimeOwnsTerminal) {
        this.options.logDiagnostic?.(`[worker] 작업 실행 실패: ${(error as Error).message}`);
      }
      await this.options.reportResult(task.taskId, {
        success: false,
        error: (error as Error).message,
        durationMs: 0,
      });
    }
  }

  private buildSuccessResult(result: { success: boolean; text: string; durationMs: number }): ReportTaskResultInput {
    const truncated = result.text.length > TEXT_LIMIT;
    return {
      success: result.success,
      text: result.text.slice(0, TEXT_LIMIT),
      truncated,
      originalLength: truncated ? result.text.length : undefined,
      durationMs: result.durationMs,
    };
  }
}
