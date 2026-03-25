export interface TaskResult {
  success: boolean;
  text: string;
  durationMs: number;
}

export interface TimeoutAwareResult {
  result: TaskResult;
  finalResult?: Promise<TaskResult>;
}

export interface WorkerRuntimeLike {
  start(): Promise<void>;
  executeTaskWithTimeout(prompt: string): Promise<TimeoutAwareResult>;
  monitorForCompletion(prompt: string): Promise<TaskResult>;
  sendInput(input: string): void;
  resize(cols: number, rows: number): void;
  destroy(): void | Promise<void>;
  readonly isProcessing: boolean;
}

export type WorkerRuntimeKind = 'tmux' | 'pty';

export interface WorkerRuntimeHooks {
  onData?: (data: string) => void;
  onReady?: () => void;
  onExit?: () => void;
  onLocalInput?: (line: string) => void | Promise<void>;
}

export interface CreateWorkerRuntimeInput extends WorkerRuntimeHooks {
  runtimeKind: WorkerRuntimeKind;
  projectPath: string;
  workerName?: string;
  trustMode: boolean;
  socketsRoot?: string;
}

export interface CreateWorkerRuntimeProfile {
  runtimeKind: WorkerRuntimeKind;
  projectPath: string;
  workerName?: string;
  trustMode: boolean;
  socketsRoot?: string;
  hooks?: WorkerRuntimeHooks;
}

export interface CreateWorkerRuntimeDeps {
  loadTmuxWorkerRuntime: () => Promise<{
    TmuxWorkerRuntime: new (options: {
      projectPath: string;
      workerName?: string;
      trustMode: boolean;
      socketsRoot?: string;
    }) => WorkerRuntimeLike;
  }>;
  loadPtyWorkerRuntime: () => Promise<{
    PtyWorkerRuntime: new (options: {
      projectPath: string;
      trustMode: boolean;
      workerName?: string;
      socketsRoot?: string;
      onData?: (data: string) => void;
      onReady?: () => void;
      onExit?: () => void;
      onLocalInput?: (line: string) => void | Promise<void>;
    }) => WorkerRuntimeLike;
  }>;
}

const defaultDeps: CreateWorkerRuntimeDeps = {
  loadTmuxWorkerRuntime: async () => import('./tmux-worker-runtime.js'),
  loadPtyWorkerRuntime: async () => import('./pty-worker-runtime.js'),
};

export function buildCreateWorkerRuntimeInput(
  profile: CreateWorkerRuntimeProfile,
): CreateWorkerRuntimeInput {
  const input: CreateWorkerRuntimeInput = {
    runtimeKind: profile.runtimeKind,
    projectPath: profile.projectPath,
    workerName: profile.workerName,
    trustMode: profile.trustMode,
    socketsRoot: profile.socketsRoot,
  };

  if (profile.runtimeKind === 'pty' && profile.hooks) {
    Object.assign(input, profile.hooks);
  }

  return input;
}

export async function createWorkerRuntime(
  profile: CreateWorkerRuntimeProfile,
  deps: CreateWorkerRuntimeDeps = defaultDeps,
): Promise<WorkerRuntimeLike> {
  const input = buildCreateWorkerRuntimeInput(profile);

  if (input.runtimeKind === 'tmux') {
    const { TmuxWorkerRuntime } = await deps.loadTmuxWorkerRuntime();
    return new TmuxWorkerRuntime({
      projectPath: input.projectPath,
      workerName: input.workerName,
      trustMode: input.trustMode,
      socketsRoot: input.socketsRoot,
    });
  }

  const { PtyWorkerRuntime } = await deps.loadPtyWorkerRuntime();
  return new PtyWorkerRuntime({
    projectPath: input.projectPath,
    workerName: input.workerName,
    trustMode: input.trustMode,
    socketsRoot: input.socketsRoot,
    onData: input.onData,
    onReady: input.onReady,
    onExit: input.onExit,
    onLocalInput: input.onLocalInput,
  });
}
