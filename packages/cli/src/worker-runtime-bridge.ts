import {
  createLocalPtyTaskBridge,
  type CreateLocalPtyTaskBridgeInput,
} from './local-pty-task-bridge.js';
import {
  createWorkerRuntimeHooks,
  type WorkerRuntimeHooksInput,
} from './worker-runtime-hooks.js';
import type { WorkerRuntimeHooks, WorkerRuntimeKind } from './worker-runtime.js';

export interface CreateWorkerRuntimeBridgeInput
  extends Omit<CreateLocalPtyTaskBridgeInput, 'fetchImpl'> {
  runtimeKind: WorkerRuntimeKind;
  queueWorkerStream: WorkerRuntimeHooksInput['queueWorkerStream'];
  getRuntimeExitHandler: WorkerRuntimeHooksInput['getRuntimeExitHandler'];
}

export interface CreateWorkerRuntimeBridgeDeps {
  createLocalPtyTaskBridge: (
    input: CreateLocalPtyTaskBridgeInput,
  ) => ReturnType<typeof createLocalPtyTaskBridge>;
  createWorkerRuntimeHooks: (
    input: WorkerRuntimeHooksInput,
  ) => WorkerRuntimeHooks;
}

const defaultDeps: CreateWorkerRuntimeBridgeDeps = {
  createLocalPtyTaskBridge,
  createWorkerRuntimeHooks,
};

export function createWorkerRuntimeBridge(
  input: CreateWorkerRuntimeBridgeInput,
  deps: CreateWorkerRuntimeBridgeDeps = defaultDeps,
): WorkerRuntimeHooks {
  if (input.runtimeKind !== 'pty') {
    return {};
  }

  const localPtyTaskBridge = deps.createLocalPtyTaskBridge({
    workerId: input.workerId,
    gatewayUrl: input.gatewayUrl,
    apiKey: input.apiKey,
    forceTrust: input.forceTrust,
    handledTaskIds: input.handledTaskIds,
    isRuntimeProcessing: input.isRuntimeProcessing,
    shouldAcceptInput: input.shouldAcceptInput,
    monitorForCompletion: input.monitorForCompletion,
    reportResult: input.reportResult,
  });

  return deps.createWorkerRuntimeHooks({
    runtimeKind: 'pty',
    queueWorkerStream: input.queueWorkerStream,
    localPtyTaskBridge,
    getRuntimeExitHandler: input.getRuntimeExitHandler,
  });
}
