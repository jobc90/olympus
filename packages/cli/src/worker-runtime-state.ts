import { runtimeOwnsTerminalForKind } from './worker-runtime-hooks.js';
import type { WorkerRuntimeKind } from './worker-runtime.js';

export interface WorkerRuntimeState {
  markStarted(): void;
  beginShutdown(): void;
  isRuntimeOwningTerminal(): boolean;
  isShuttingDown(): boolean;
  getRuntimeExitHandler(): (() => Promise<void>) | null;
  setRuntimeExitHandler(handler: () => Promise<void>): void;
}

export function createWorkerRuntimeState(runtimeKind: WorkerRuntimeKind): WorkerRuntimeState {
  let runtimeOwnsTerminal = false;
  let runtimeExitHandler: (() => Promise<void>) | null = null;
  let shuttingDown = false;

  return {
    markStarted(): void {
      runtimeOwnsTerminal = runtimeOwnsTerminalForKind(runtimeKind);
    },
    beginShutdown(): void {
      shuttingDown = true;
    },
    isRuntimeOwningTerminal(): boolean {
      return runtimeOwnsTerminal;
    },
    isShuttingDown(): boolean {
      return shuttingDown;
    },
    getRuntimeExitHandler(): (() => Promise<void>) | null {
      return runtimeExitHandler;
    },
    setRuntimeExitHandler(handler: () => Promise<void>): void {
      runtimeExitHandler = handler;
    },
  };
}
