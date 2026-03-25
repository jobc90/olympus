import type { FinalReportArtifact, StartAckArtifact } from '@olympus-dev/protocol';
import type { RuntimeControlHostLike } from './runtime-control-host.js';
export type {
  NativeTerminalLaunchInput,
  NativeTerminalLaunchResult,
  NativeTerminalLauncherLike,
} from './worker-host/native-terminal-launcher.js';
export type {
  TmuxSessionAdapterLike,
  TmuxSessionCaptureInput,
  TmuxSessionInput,
  TmuxSessionStartInput,
} from './worker-host/tmux-session-adapter.js';
export type {
  TmuxLayoutManagerLike,
  TmuxWorkerTarget,
  ReserveTmuxTargetInput,
} from './worker-host/tmux-layout-manager.js';
import type { TmuxLayoutManagerLike, TmuxWorkerTarget } from './worker-host/tmux-layout-manager.js';
import type { TmuxSessionAdapterLike } from './worker-host/tmux-session-adapter.js';
import type {
  NativeTerminalLaunchInput,
  NativeTerminalLaunchResult,
  NativeTerminalLauncherLike,
} from './worker-host/native-terminal-launcher.js';

export interface WorkerInstruction {
  taskId: string;
  projectId: string;
  title: string;
  instructionVersion: string;
  instructionPath: string;
  projectMirrorPath: string;
  launcherPrompt: string;
  verification: string[];
  workerMode?: 'resident' | 'ephemeral';
}

export interface WorkerArtifactEmitter {
  emitStartAck(ack: StartAckArtifact): void | Promise<void>;
  emitFinalReport(report: FinalReportArtifact): void | Promise<void>;
}

export interface BootResidentSessionInput {
  projectPath: string;
  trustMode: boolean;
}

export interface WorkerHostLike extends RuntimeControlHostLike {
  bootResidentSession(input: BootResidentSessionInput): Promise<TmuxWorkerTarget>;
  assignInstruction(instruction: WorkerInstruction): Promise<WorkerAssignmentResult>;
  sendLocalInput(input: string, submit?: boolean): void;
  sendRemoteInput(input: string, submit?: boolean): void;
  getCurrentTarget(): TmuxWorkerTarget | null;
}

export interface WorkerHostOptions {
  projectId: string;
  workerId: string;
  instructionDirectory: string;
  layoutManager: TmuxLayoutManagerLike;
  sessionAdapter: TmuxSessionAdapterLike;
  launcher: NativeTerminalLauncherLike;
  artifacts: WorkerArtifactEmitter;
}

export interface WorkerAssignmentResult {
  accepted: boolean;
}

export class WorkerHost implements WorkerHostLike {
  private currentInstruction: WorkerInstruction | null = null;

  private currentTarget: TmuxWorkerTarget | null = null;

  private finalReport: FinalReportArtifact | null = null;

  constructor(private readonly options: WorkerHostOptions) {}

  async bootResidentSession(input: BootResidentSessionInput): Promise<TmuxWorkerTarget> {
    if (this.currentTarget) {
      return this.currentTarget;
    }

    this.currentTarget = await this.options.layoutManager.reserveTarget({
      projectId: this.options.projectId,
      workerId: this.options.workerId,
      mode: 'resident',
      projectPath: input.projectPath,
      command: input.trustMode
        ? ['claude', '--dangerously-skip-permissions']
        : ['claude'],
    });

    await this.options.launcher.launch({
      projectId: this.options.projectId,
      workerId: this.options.workerId,
      sessionName: this.currentTarget.sessionName,
      paneId: this.currentTarget.paneId,
    });

    return this.currentTarget;
  }

  async assignInstruction(instruction: WorkerInstruction): Promise<WorkerAssignmentResult> {
    this.currentInstruction = instruction;
    this.finalReport = null;
    if (!this.currentTarget) {
      this.currentTarget = await this.options.layoutManager.reserveTarget({
        projectId: this.options.projectId,
        workerId: this.options.workerId,
        mode: instruction.workerMode ?? 'resident',
      });

      await this.options.launcher.launch({
        projectId: this.options.projectId,
        workerId: this.options.workerId,
        sessionName: this.currentTarget.sessionName,
        paneId: this.currentTarget.paneId,
      });
    }

    await this.options.sessionAdapter.startSession({
      target: this.currentTarget,
      instructionPath: instruction.instructionPath,
      launcherPrompt: instruction.launcherPrompt,
    });

    await this.options.artifacts.emitStartAck({
      task_id: instruction.taskId,
      project_id: instruction.projectId,
      worker_id: this.options.workerId,
      instruction_version: instruction.instructionVersion,
      accepted: true,
      understood_goal: instruction.title,
      execution_plan_summary: [
        `Execute instruction at ${instruction.instructionPath} via tmux ${this.currentTarget.sessionName} ${this.currentTarget.paneId}`,
      ],
      verification_scope: instruction.verification,
      blocking_preconditions: [],
      timestamp: new Date().toISOString(),
    });

    return { accepted: true };
  }

  sendLocalInput(input: string, submit?: boolean): void {
    if (!this.currentTarget) return;
    void this.options.sessionAdapter.sendInput({
      target: this.currentTarget,
      text: input,
      source: 'local',
      ...(submit !== undefined ? { submit } : {}),
    });
  }

  sendRemoteInput(input: string, submit?: boolean): void {
    if (!this.currentTarget) return;
    void this.options.sessionAdapter.sendInput({
      target: this.currentTarget,
      text: input,
      source: 'remote',
      ...(submit !== undefined ? { submit } : {}),
    });
  }

  sendRuntimeInput(input: string, submit?: boolean): void {
    this.sendRemoteInput(input, submit);
  }

  resetSession(): void {
    if (!this.currentTarget) return;
    void this.options.sessionAdapter.resetSession(this.currentTarget);
  }

  captureTerminalSnapshot(lines = 200): Promise<string> {
    if (!this.currentTarget) return Promise.resolve('');
    return Promise.resolve(this.options.sessionAdapter.capturePane({
      target: this.currentTarget,
      lines,
    }));
  }

  async recordFinalReport(report: FinalReportArtifact): Promise<void> {
    this.finalReport = report;
    await this.options.artifacts.emitFinalReport(report);
  }

  async stop(): Promise<void> {
    if (this.currentTarget) {
      await this.options.sessionAdapter.stopSession(this.currentTarget);
      await this.options.layoutManager.releaseTarget(this.currentTarget);
    }
    this.currentInstruction = null;
    this.currentTarget = null;
  }

  getCurrentInstruction(): WorkerInstruction | null {
    return this.currentInstruction;
  }

  getFinalReport(): FinalReportArtifact | null {
    return this.finalReport;
  }

  getCurrentTarget(): TmuxWorkerTarget | null {
    return this.currentTarget;
  }

  get instructionDirectory(): string {
    return this.options.instructionDirectory;
  }
}
