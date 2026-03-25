import type { WorkerGatewaySession } from './worker-gateway-session.js';
import type { WorkerRuntimeLike } from './worker-runtime.js';

export interface WorkerControlPlaneCleanupPort {
  deregisterWorker(workerId: string): Promise<void>;
}

export interface ProcessSignalHost {
  on(event: NodeJS.Signals, listener: () => void): void;
  off(event: NodeJS.Signals, listener: () => void): void;
  exit(code?: number): never;
}

export interface WorkerRuntimeLifecycleOptions {
  runtime: WorkerRuntimeLike;
  gatewaySession: WorkerGatewaySession;
  controlPlaneClient: WorkerControlPlaneCleanupPort;
  workerId: string;
  runtimeKind: 'tmux' | 'pty';
  logBrief: (message: string) => void;
  onStarted?: () => void;
  onShutdownStart?: () => void;
  processHost?: ProcessSignalHost;
  startTimeoutMs?: number;
}

const DEFAULT_START_TIMEOUT_MS = 120_000;
const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];

export class WorkerRuntimeLifecycle {
  private readonly processHost: ProcessSignalHost;

  private readonly startTimeoutMs: number;

  private shuttingDown = false;

  private signalsInstalled = false;

  private readonly signalHandlers = new Map<NodeJS.Signals, () => void>();

  constructor(private readonly options: WorkerRuntimeLifecycleOptions) {
    this.processHost = options.processHost ?? process;
    this.startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  }

  createRuntimeExitHandler(): () => Promise<void> {
    return async () => {
      await this.shutdown('Ctrl+C');
    };
  }

  async start(): Promise<void> {
    await Promise.race([
      this.options.runtime.start(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${this.options.runtimeKind} init timeout (120s) — Claude CLI not ready`));
        }, this.startTimeoutMs);
      }),
    ]);

    this.options.onStarted?.();
    await this.options.gatewaySession.start();
  }

  installSignalHandlers(): void {
    if (this.signalsInstalled) return;

    for (const signal of SIGNALS) {
      const handler = () => {
        return this.shutdown(signal);
      };
      this.signalHandlers.set(signal, handler);
      this.processHost.on(signal, handler);
    }
    this.signalsInstalled = true;
  }

  async handleStartFailure(error: Error): Promise<never> {
    await this.options.controlPlaneClient.deregisterWorker(this.options.workerId).catch(() => {});
    this.options.logBrief('');
    this.options.logBrief(`  ❌ ${this.options.runtimeKind} 시작 실패: ${error.message}`);
    this.options.logBrief('');
    this.options.logBrief('  해결 방법:');
    this.options.logBrief('  1. claude 명령어가 설치되어 있는지 확인: which claude');
    if (this.options.runtimeKind === 'pty') {
      this.options.logBrief('  2. node-pty가 설치되어 있는지 확인: ls node_modules/node-pty');
      this.options.logBrief('  3. Claude CLI를 직접 실행해 정상 동작하는지 확인: claude');
    } else {
      this.options.logBrief('  2. tmux가 설치되어 있는지 확인: which tmux');
      this.options.logBrief('  3. Claude CLI를 직접 실행해 정상 동작하는지 확인: claude');
    }
    this.options.logBrief('');
    this.processHost.exit(1);
  }

  async shutdown(_signal: string): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.options.onShutdownStart?.();

    if (this.signalsInstalled) {
      for (const [signal, handler] of this.signalHandlers) {
        this.processHost.off(signal, handler);
      }
      this.signalHandlers.clear();
      this.signalsInstalled = false;
    }

    await this.options.gatewaySession.stop();
    await Promise.resolve(this.options.runtime.destroy());
    this.options.logBrief('');
    this.options.logBrief('Shutting down...');

    try {
      await this.options.controlPlaneClient.deregisterWorker(this.options.workerId);
    } catch {
      // Best-effort worker cleanup on shutdown.
    }
    this.processHost.exit(0);
  }
}
