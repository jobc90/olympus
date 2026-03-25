import { basename, join } from 'node:path';
import type { TaskResult, WorkerRuntimeLike } from './worker-runtime.js';
import { TmuxTaskRunner, type TmuxTaskRunnerOptions } from './tmux-task-runner.js';
import { detectIdlePromptWithRelaxedFallback } from './pty-worker.js';
import {
  createRuntimeControlError,
  createRuntimeControlSuccess,
  type AssignInstructionCommandPayload,
  type CaptureTerminalSnapshotCommandPayload,
  type RuntimeControlRequest,
  type RuntimeControlResponse,
  type SendInputCommandPayload,
  type SoftPreemptCommandPayload,
} from '@olympus-dev/protocol';
import type {
  NativeTerminalLauncherLike,
  TmuxLayoutManagerLike,
  TmuxSessionAdapterLike,
  TmuxWorkerTarget,
  WorkerArtifactEmitter,
  WorkerHostLike,
} from './worker-host.js';
import { WorkerHost } from './worker-host.js';
import { NativeTerminalLauncher } from './worker-host/native-terminal-launcher.js';
import { TmuxLayoutManager } from './worker-host/tmux-layout-manager.js';
import {
  createRuntimeSocketPath,
  RuntimeSocketServer,
} from './worker-host/runtime-socket.js';
import { TmuxSessionAdapter } from './worker-host/tmux-session-adapter.js';

export interface TimeoutAwareTaskResult {
  result: TaskResult;
}

export interface TmuxWorkerRuntimeOptions {
  projectPath: string;
  workerName?: string;
  trustMode: boolean;
  socketsRoot?: string;
  host?: WorkerHostLike;
  layoutManager?: TmuxLayoutManagerLike;
  sessionAdapter?: TmuxSessionAdapterLike;
  launcher?: NativeTerminalLauncherLike;
  taskRunnerOptions?: TmuxTaskRunnerOptions;
  readyPollIntervalMs?: number;
  readyTimeoutMs?: number;
}

const DEFAULT_READY_POLL_INTERVAL_MS = 500;
const DEFAULT_READY_TIMEOUT_MS = 30_000;

function isTrustPrompt(snapshot: string): boolean {
  return /Yes,\s*I trust this folder/i.test(snapshot)
    || /Enter to confirm\s*·\s*Esc to cancel/i.test(snapshot)
    || /Quick safety check:/i.test(snapshot);
}

export class TmuxWorkerRuntime implements WorkerRuntimeLike {
  private readonly layoutManager: TmuxLayoutManagerLike;

  private readonly sessionAdapter: TmuxSessionAdapterLike;

  private readonly launcher: NativeTerminalLauncherLike;

  private readonly taskRunner: TmuxTaskRunner;

  private readonly host: WorkerHostLike;

  private target: TmuxWorkerTarget | null = null;

  private runtimeSocketServer: RuntimeSocketServer | null = null;

  private runtimeSocketPath: string | null = null;

  private inputLocked = false;

  private activeTaskId: string | null = null;

  constructor(private readonly options: TmuxWorkerRuntimeOptions) {
    this.layoutManager = options.layoutManager ?? new TmuxLayoutManager();
    this.sessionAdapter = options.sessionAdapter ?? new TmuxSessionAdapter();
    this.launcher = options.launcher ?? new NativeTerminalLauncher();
    this.taskRunner = new TmuxTaskRunner(
      this.sessionAdapter,
      options.taskRunnerOptions,
    );
    const noopArtifacts: WorkerArtifactEmitter = {
      emitStartAck: async () => {},
      emitFinalReport: async () => {},
    };
    this.host = options.host ?? new WorkerHost({
      projectId: basename(this.options.projectPath),
      workerId: this.options.workerName ?? basename(this.options.projectPath),
      instructionDirectory: join(this.options.projectPath, '.olympus', 'runtime'),
      layoutManager: this.layoutManager,
      sessionAdapter: this.sessionAdapter,
      launcher: this.launcher,
      artifacts: noopArtifacts,
    });
  }

  async start(): Promise<void> {
    this.target = await this.host.bootResidentSession({
      projectPath: this.options.projectPath,
      trustMode: this.options.trustMode,
    });
    await this.waitForReadyPrompt();

    if (this.options.socketsRoot) {
      this.runtimeSocketPath = createRuntimeSocketPath({
        socketsRoot: this.options.socketsRoot,
        projectId: this.target.projectId,
        workerId: this.target.workerId,
      });
      this.runtimeSocketServer = new RuntimeSocketServer({
        socketPath: this.runtimeSocketPath,
        handler: (request) => this.handleRuntimeControl(request),
      });
      await this.runtimeSocketServer.start();
    }
  }

  async executeTaskWithTimeout(prompt: string): Promise<TimeoutAwareTaskResult> {
    return {
      result: await this.executeTask(prompt),
    };
  }

  async executeTask(prompt: string): Promise<TaskResult> {
    const target = this.requireTarget();
    return this.taskRunner.executeTask({
      target,
      prompt,
      source: 'remote',
    });
  }

  async monitorForCompletion(prompt: string): Promise<TaskResult> {
    const target = this.requireTarget();
    return this.taskRunner.monitorForCompletion({
      target,
      prompt,
    });
  }

  sendInput(input: string): void {
    if (!this.target || this.inputLocked) return;
    this.host.sendRuntimeInput(input);
  }

  resize(_cols: number, _rows: number): void {
    // tmux manages pane size independently from the dashboard.
  }

  async destroy(): Promise<void> {
    if (this.runtimeSocketServer) {
      await this.runtimeSocketServer.stop();
      this.runtimeSocketServer = null;
    }
    this.runtimeSocketPath = null;
    this.target = null;
    await this.host.stop();
  }

  get isProcessing(): boolean {
    return this.taskRunner.processing;
  }

  getCurrentTarget(): TmuxWorkerTarget | null {
    return this.target;
  }

  getRuntimeSocketPath(): string | null {
    return this.runtimeSocketPath;
  }

  private async waitForReadyPrompt(): Promise<void> {
    const startedAt = Date.now();
    let trustConfirmed = false;
    while (Date.now() - startedAt < (this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS)) {
      const snapshot = await this.host.captureTerminalSnapshot(80);
      if (this.options.trustMode && snapshot && isTrustPrompt(snapshot) && !trustConfirmed) {
        await this.sessionAdapter.sendInput({
          target: this.requireTarget(),
          text: '',
          source: 'local',
          submit: true,
        });
        trustConfirmed = true;
      }

      if (snapshot && !isTrustPrompt(snapshot) && detectIdlePromptWithRelaxedFallback(snapshot)) {
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, this.options.readyPollIntervalMs ?? DEFAULT_READY_POLL_INTERVAL_MS);
      });
    }

    throw new Error('tmux worker runtime did not reach an interactive idle prompt in time');
  }

  private requireTarget(): TmuxWorkerTarget {
    if (!this.target) {
      throw new Error('tmux worker runtime has not been started');
    }
    return this.target;
  }

  private async handleRuntimeControl(
    request: RuntimeControlRequest,
  ): Promise<RuntimeControlResponse> {
    const target = this.requireTarget();

    switch (request.command) {
      case 'assign_instruction': {
        const payload = request.payload as AssignInstructionCommandPayload;
        this.activeTaskId = payload.task_id;
        await this.host.assignInstruction({
          taskId: payload.task_id,
          projectId: payload.project_id,
          title: payload.title,
          instructionVersion: payload.instruction_version,
          instructionPath: payload.instruction_path,
          projectMirrorPath: payload.project_mirror_path,
          launcherPrompt: payload.launcher_prompt,
          verification: payload.verification,
          workerMode: payload.worker_mode,
        });
        return createRuntimeControlSuccess({
          request_id: request.request_id,
          worker_id: request.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: `assigned:${payload.task_id}`,
          },
        });
      }

      case 'soft_preempt': {
        const payload = request.payload as SoftPreemptCommandPayload;
        this.inputLocked = true;
        if (payload.replacement_task_id) {
          this.activeTaskId = payload.replacement_task_id;
        }
        this.host.resetSession();
        this.taskRunner.cancelActiveTask('task preempted by runtime control');
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

      case 'get_state':
        return this.createStateResponse(request);

      case 'lock_input':
        this.inputLocked = true;
        return this.createStateResponse(request);

      case 'unlock_input':
        this.inputLocked = false;
        return this.createStateResponse(request);

      case 'reset_session':
        this.host.resetSession();
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

      default:
        return createRuntimeControlError({
          request_id: request.request_id,
          worker_id: request.worker_id,
          code: 'UNSUPPORTED_COMMAND',
          message: `Unsupported runtime control command: ${String(request.command)}`,
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
        active_task_id: this.activeTaskId ?? undefined,
      },
    });
  }
}
