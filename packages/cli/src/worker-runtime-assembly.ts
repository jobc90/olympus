import { WorkerRuntimeLifecycle, type WorkerRuntimeLifecycleOptions } from './worker-runtime-lifecycle.js';
import {
  WorkerTaskOrchestrator,
  type ReportTaskResultInput,
  type TaskPayload,
  type WorkerInputPayload,
  type WorkerResizePayload,
  type WorkerTaskSnapshot,
} from './worker-task-orchestrator.js';
import { WorkerGatewaySession, type WorkerGatewaySessionOptions } from './worker-gateway-session.js';
import {
  createWorkerRuntime,
  type WorkerRuntimeKind,
  type WorkerRuntimeLike,
} from './worker-runtime.js';
import { createWorkerRuntimeBridge } from './worker-runtime-bridge.js';
import type { WorkerRuntimeState } from './worker-runtime-state.js';
import type { WorkerControlPlaneCleanupPort } from './worker-runtime-lifecycle.js';

export interface CreateWorkerRuntimeAssemblyInput {
  workerId: string;
  workerName: string;
  projectPath: string;
  runtimeKind: WorkerRuntimeKind;
  runtimeSocketsRoot: string;
  gatewayUrl: string;
  apiKey: string;
  forceTrust: boolean;
  handledTaskIds: Set<string>;
  controlPlaneClient: WorkerControlPlaneCleanupPort;
  runtimeState: WorkerRuntimeState;
  logBrief: (message: string) => void;
}

export interface WorkerGatewaySessionLike {
  reportResult(taskId: string, result: ReportTaskResultInput): Promise<void>;
  queueWorkerStream(chunk: string): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface WorkerTaskOrchestratorLike {
  handleAssignedTask(task: TaskPayload): Promise<void>;
  forwardInput(payload: WorkerInputPayload): void;
  forwardResize(payload: WorkerResizePayload): void;
  recoverPendingTask(tasks: WorkerTaskSnapshot[]): Promise<void>;
}

export interface WorkerRuntimeLifecycleLike {
  start(): Promise<void>;
  handleStartFailure(error: Error): Promise<never>;
  installSignalHandlers(): void;
  createRuntimeExitHandler(): () => Promise<void>;
}

export interface WorkerRuntimeAssembly {
  gatewaySession: WorkerGatewaySessionLike;
  runtime: WorkerRuntimeLike;
  taskOrchestrator: WorkerTaskOrchestratorLike;
  runtimeLifecycle: WorkerRuntimeLifecycleLike;
}

export interface CreateWorkerRuntimeAssemblyDeps {
  createGatewaySession: (options: WorkerGatewaySessionOptions) => WorkerGatewaySessionLike;
  createWorkerRuntime: typeof createWorkerRuntime;
  createWorkerRuntimeBridge: typeof createWorkerRuntimeBridge;
  createTaskOrchestrator: (options: ConstructorParameters<typeof WorkerTaskOrchestrator>[0]) => WorkerTaskOrchestratorLike;
  createRuntimeLifecycle: (options: WorkerRuntimeLifecycleOptions) => WorkerRuntimeLifecycleLike;
}

const defaultDeps: CreateWorkerRuntimeAssemblyDeps = {
  createGatewaySession: (options) => new WorkerGatewaySession(options),
  createWorkerRuntime,
  createWorkerRuntimeBridge,
  createTaskOrchestrator: (options) => new WorkerTaskOrchestrator(options),
  createRuntimeLifecycle: (options) => new WorkerRuntimeLifecycle(options),
};

export async function createWorkerRuntimeAssembly(
  input: CreateWorkerRuntimeAssemblyInput,
  deps: CreateWorkerRuntimeAssemblyDeps = defaultDeps,
): Promise<WorkerRuntimeAssembly> {
  let taskOrchestrator: WorkerTaskOrchestratorLike | null = null;
  let runtime!: WorkerRuntimeLike;

  const gatewaySession = deps.createGatewaySession({
    gatewayUrl: input.gatewayUrl,
    apiKey: input.apiKey,
    workerId: input.workerId,
    onAssignedTask: (task: TaskPayload) => {
      void taskOrchestrator?.handleAssignedTask(task);
    },
    onInput: (payload: WorkerInputPayload) => {
      taskOrchestrator?.forwardInput(payload);
    },
    onResize: (payload: WorkerResizePayload) => {
      taskOrchestrator?.forwardResize(payload);
    },
    onRecoverPendingTasks: async (tasks: WorkerTaskSnapshot[]) => {
      await taskOrchestrator?.recoverPendingTask(tasks);
    },
  });

  runtime = await deps.createWorkerRuntime({
    runtimeKind: input.runtimeKind,
    projectPath: input.projectPath,
    workerName: input.workerName,
    trustMode: input.forceTrust,
    socketsRoot: input.runtimeSocketsRoot,
    hooks: deps.createWorkerRuntimeBridge({
      runtimeKind: input.runtimeKind,
      workerId: input.workerId,
      gatewayUrl: input.gatewayUrl,
      apiKey: input.apiKey,
      forceTrust: input.forceTrust,
      handledTaskIds: input.handledTaskIds,
      isRuntimeProcessing: () => runtime.isProcessing,
      shouldAcceptInput: () => !input.runtimeState.isShuttingDown() && Boolean(input.workerId),
      monitorForCompletion: (prompt: string) => runtime.monitorForCompletion(prompt),
      reportResult: (taskId, result) => gatewaySession.reportResult(taskId, result),
      queueWorkerStream: (chunk) => {
        gatewaySession.queueWorkerStream(chunk);
      },
      getRuntimeExitHandler: () => input.runtimeState.getRuntimeExitHandler(),
    }),
  });

  taskOrchestrator = deps.createTaskOrchestrator({
    workerId: input.workerId,
    projectPath: input.projectPath,
    runtime,
    handledTaskIds: input.handledTaskIds,
    isRuntimeOwningTerminal: () => input.runtimeState.isRuntimeOwningTerminal(),
    reportResult: (taskId, result) => gatewaySession.reportResult(taskId, result),
    logDiagnostic: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  const runtimeLifecycle = deps.createRuntimeLifecycle({
    runtime,
    gatewaySession: gatewaySession as WorkerGatewaySession,
    controlPlaneClient: input.controlPlaneClient,
    workerId: input.workerId,
    runtimeKind: input.runtimeKind,
    logBrief: input.logBrief,
    onStarted: () => {
      input.runtimeState.markStarted();
    },
    onShutdownStart: () => {
      input.runtimeState.beginShutdown();
    },
  });
  input.runtimeState.setRuntimeExitHandler(runtimeLifecycle.createRuntimeExitHandler());

  return {
    gatewaySession,
    runtime,
    taskOrchestrator,
    runtimeLifecycle,
  };
}
