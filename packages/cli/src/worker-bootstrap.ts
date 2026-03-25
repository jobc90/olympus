import {
  prepareWorkerBootstrapContext,
  resolveRuntimeSocketsRoot,
  resolveWorkerRuntimeKind,
} from './worker-bootstrap-context.js';
import { createWorkerRuntimeState } from './worker-runtime-state.js';
import { createWorkerRuntimeAssembly } from './worker-runtime-assembly.js';
import { selectPendingTaskForWorker } from './worker-task-orchestrator.js';

/**
 * Select one recoverable pending task for this worker.
 * Used as a fallback when WS assignment events are missed.
 */
export { selectPendingTaskForWorker } from './worker-task-orchestrator.js';
export { resolveRuntimeSocketsRoot, resolveWorkerRuntimeKind } from './worker-bootstrap-context.js';

/** Write a brief message to stderr without disturbing an attached interactive runtime. */
function logBrief(msg: string): void {
  process.stderr.write(msg + '\n');
}

export async function startWorker(opts: Record<string, unknown>, forceTrust: boolean): Promise<void> {
  const context = await prepareWorkerBootstrapContext({
    opts,
    forceTrust,
    envRuntimeSocketsRoot: process.env.OLYMPUS_RUNTIME_SOCKETS_ROOT,
    logBrief,
  });

  const runtimeState = createWorkerRuntimeState(context.runtimeKind);
  const handledTaskIds = new Set<string>();

  const { runtimeLifecycle } = await createWorkerRuntimeAssembly({
    workerId: context.workerId,
    workerName: context.workerName,
    projectPath: context.projectPath,
    runtimeKind: context.runtimeKind,
    runtimeSocketsRoot: context.runtimeSocketsRoot,
    gatewayUrl: context.gatewayUrl,
    apiKey: context.apiKey,
    forceTrust,
    handledTaskIds,
    controlPlaneClient: context.controlPlaneClient,
    runtimeState,
    logBrief,
  });

  try {
    await runtimeLifecycle.start();
  } catch (err) {
    await runtimeLifecycle.handleStartFailure(err as Error);
  }
  runtimeLifecycle.installSignalHandlers();

  await new Promise(() => {});
}
