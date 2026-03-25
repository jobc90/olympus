import type { WorkerRuntimeHooks, WorkerRuntimeKind } from './worker-runtime.js';

export interface LocalPtyRuntimeBridgeLike {
  onLocalInput(line: string): Promise<void>;
}

interface WorkerRuntimeHooksBaseInput {
  queueWorkerStream: (chunk: string) => void;
  getRuntimeExitHandler: () => (() => Promise<void>) | null;
}

export interface TmuxWorkerRuntimeHooksInput extends WorkerRuntimeHooksBaseInput {
  runtimeKind: 'tmux';
}

export interface PtyWorkerRuntimeHooksInput extends WorkerRuntimeHooksBaseInput {
  runtimeKind: 'pty';
  localPtyTaskBridge: LocalPtyRuntimeBridgeLike;
}

export type WorkerRuntimeHooksInput =
  | TmuxWorkerRuntimeHooksInput
  | PtyWorkerRuntimeHooksInput;

export function runtimeOwnsTerminalForKind(
  runtimeKind: WorkerRuntimeKind,
): boolean {
  return runtimeKind === 'pty';
}

export function createWorkerRuntimeHooks(
  input: WorkerRuntimeHooksInput,
): WorkerRuntimeHooks {
  if (input.runtimeKind !== 'pty') {
    return {};
  }

  return {
    onData: (chunk: string) => {
      input.queueWorkerStream(chunk);
    },
    onReady: () => {},
    onExit: () => {
      void input.getRuntimeExitHandler()?.();
    },
    onLocalInput: async (line: string) => {
      await input.localPtyTaskBridge.onLocalInput(line);
    },
  };
}
