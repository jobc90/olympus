import { basename } from 'node:path';
import type { PtyWorkerOptions } from './pty-worker.js';
import { PtyWorkerHost, type PtyWorkerHostLike } from './pty-worker-host.js';
import {
  createRuntimeControlError,
  createRuntimeControlSuccess,
  type CaptureTerminalSnapshotCommandPayload,
  type RuntimeControlRequest,
  type RuntimeControlResponse,
  type SendInputCommandPayload,
  type SoftPreemptCommandPayload,
} from '@olympus-dev/protocol';
import {
  createRuntimeSocketPath,
  RuntimeSocketServer,
} from './worker-host/runtime-socket.js';
import type { TaskResult, TimeoutAwareResult, WorkerRuntimeLike } from './worker-runtime.js';

export interface PtyWorkerRuntimeOptions extends PtyWorkerOptions {
  host?: PtyWorkerHostLike;
  worker?: WorkerRuntimeLike;
  workerName?: string;
  socketsRoot?: string;
}

export class PtyWorkerRuntime implements WorkerRuntimeLike {
  private readonly host: PtyWorkerHostLike;

  private runtimeSocketServer: RuntimeSocketServer | null = null;

  private runtimeSocketPath: string | null = null;

  private inputLocked = false;

  private activeTaskId: string | null = null;

  constructor(options: PtyWorkerRuntimeOptions) {
    this.options = options;
    this.host = options.host ?? new PtyWorkerHost(options);
  }

  private readonly options: PtyWorkerRuntimeOptions;

  async start(): Promise<void> {
    await this.host.start();

    if (this.options.socketsRoot) {
      this.runtimeSocketPath = createRuntimeSocketPath({
        socketsRoot: this.options.socketsRoot,
        projectId: basename(this.options.projectPath),
        workerId: this.options.workerName ?? 'pty-worker',
      });
      this.runtimeSocketServer = new RuntimeSocketServer({
        socketPath: this.runtimeSocketPath,
        handler: (request) => this.handleRuntimeControl(request),
      });
      await this.runtimeSocketServer.start();
    }
  }

  async executeTaskWithTimeout(prompt: string): Promise<TimeoutAwareResult> {
    return this.host.executeTaskWithTimeout(prompt);
  }

  async monitorForCompletion(prompt: string): Promise<TaskResult> {
    return this.host.monitorForCompletion(prompt);
  }

  sendInput(input: string): void {
    if (this.inputLocked) return;
    this.host.sendRuntimeInput(input);
  }

  resize(cols: number, rows: number): void {
    this.host.resize(cols, rows);
  }

  destroy(): void | Promise<void> {
    return (async () => {
      if (this.runtimeSocketServer) {
        await this.runtimeSocketServer.stop();
        this.runtimeSocketServer = null;
      }
      this.runtimeSocketPath = null;
      await this.host.stop();
    })();
  }

  get isProcessing(): boolean {
    return this.host.isProcessing;
  }

  getRuntimeSocketPath(): string | null {
    return this.runtimeSocketPath;
  }

  private async handleRuntimeControl(
    request: RuntimeControlRequest,
  ): Promise<RuntimeControlResponse> {
    switch (request.command) {
      case 'soft_preempt': {
        const payload = request.payload as SoftPreemptCommandPayload;
        this.inputLocked = true;
        this.activeTaskId = payload.replacement_task_id ?? payload.task_id;
        return createRuntimeControlSuccess({
          request_id: request.request_id,
          worker_id: request.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: `preempted:${payload.task_id}`,
          },
        });
      }

      case 'get_state':
        return this.createStateResponse(request);

      case 'send_input': {
        if (this.inputLocked) {
          return createRuntimeControlError({
            request_id: request.request_id,
            worker_id: request.worker_id,
            code: 'INVALID_REQUEST',
            message: 'Worker input is currently locked',
          });
        }

        const payload = request.payload as SendInputCommandPayload;
        this.host.sendRuntimeInput(payload.text, payload.submit);
        return createRuntimeControlSuccess({
          request_id: request.request_id,
          worker_id: request.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: `input_forwarded:${payload.text.length}`,
          },
        });
      }

      case 'lock_input':
        this.inputLocked = true;
        return this.createStateResponse(request);

      case 'unlock_input':
        this.inputLocked = false;
        return this.createStateResponse(request);

      case 'reset_session':
        await this.host.resetSession();
        return createRuntimeControlSuccess({
          request_id: request.request_id,
          worker_id: request.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: 'session_reset',
          },
        });

      case 'capture_terminal_snapshot': {
        const payload = request.payload as CaptureTerminalSnapshotCommandPayload;
        const lines = payload.lines ?? 200;
        const snapshot = await this.host.captureTerminalSnapshot(lines);
        return createRuntimeControlSuccess({
          request_id: request.request_id,
          worker_id: request.worker_id,
          result: {
            type: 'terminal_snapshot',
            snapshot,
            lines,
          },
        });
      }

      case 'assign_instruction':
        return createRuntimeControlError({
          request_id: request.request_id,
          worker_id: request.worker_id,
          code: 'UNSUPPORTED_COMMAND',
          message: 'PTY runtime does not support instruction-file assignment',
        });

      default:
        return createRuntimeControlError({
          request_id: request.request_id,
          worker_id: request.worker_id,
          code: 'UNSUPPORTED_COMMAND',
          message: `Unsupported runtime command: ${request.command satisfies never}`,
        });
    }
  }

  private createStateResponse(request: RuntimeControlRequest): RuntimeControlResponse {
    return createRuntimeControlSuccess({
      request_id: request.request_id,
      worker_id: request.worker_id,
      result: {
        type: 'state',
        input_locked: this.inputLocked,
        ...(this.activeTaskId ? { active_task_id: this.activeTaskId } : {}),
      },
    });
  }
}
