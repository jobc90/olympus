import { randomUUID } from 'node:crypto';
import type { AgentExecutor, AgentResult, MergedResult, OrchestratorOptions, ExecuteOptions } from './types.js';
import { GeminiExecutor } from './agents/gemini.js';
import { GptExecutor } from './agents/gpt.js';
import { detectAgent } from './agents/router.js';
import { OlympusBus } from './events.js';

const executors: Record<string, AgentExecutor> = {
  gemini: new GeminiExecutor(),
  gpt: new GptExecutor(),
};

/** Extended options with bus injection and abort signal */
export interface RunParallelOptions extends OrchestratorOptions {
  bus?: OlympusBus;
  signal?: AbortSignal;
}

/** Run agents in parallel */
export async function runParallel(options: RunParallelOptions): Promise<MergedResult> {
  // Use injected bus or fall back to singleton
  const bus = options.bus ?? OlympusBus.getInstance();
  const runId = bus.runId ?? randomUUID().slice(0, 8);
  const start = Date.now();
  const agents = options.agents ?? ['gemini', 'gpt'];

  const prompt = options.context
    ? `Context:\n${options.context}\n\nTask:\n${options.prompt}`
    : options.prompt;

  // Check if already aborted
  if (options.signal?.aborted) {
    bus.emitLog('warn', 'Run aborted before start', 'orchestrator');
    return { gemini: null, gpt: null, durationMs: 0 };
  }

  // Phase 0: Start
  bus.emitPhase(0, 'Analysis', 'started');
  bus.emitLog('info', `Starting parallel execution: ${agents.join(', ')}`, 'orchestrator');

  // Create tasks for each agent
  const taskIds: Record<string, string> = {};
  for (const name of agents) {
    const taskId = `${runId}-${name}`;
    taskIds[name] = taskId;
    bus.emitTaskUpdate(taskId, `Run ${name}`, 'pending');
  }

  const results = await Promise.allSettled(
    agents.map(async (name): Promise<[string, AgentResult]> => {
      const executor = executors[name];
      if (!executor) throw new Error(`Unknown agent: ${name}`);

      const taskId = taskIds[name];

      // Check abort before starting
      if (options.signal?.aborted) {
        throw new Error('Aborted');
      }

      // Mark task as in_progress and emit agent:start
      bus.emitTaskUpdate(taskId, `Run ${name}`, 'in_progress');
      bus.emitAgentStart(name, taskId);
      bus.emitLog('info', `Agent ${name} started`, 'orchestrator');

      try {
        // Execute with streaming callback and abort signal
        const executeOptions: ExecuteOptions = {
          usePro: options.usePro,
          timeout: options.timeout,
          signal: options.signal,
          onChunk: (chunk: string) => {
            bus.emitAgentChunk(name, taskId, chunk);
          },
        };

        const result = await executor.execute(prompt, executeOptions);

        if (result.success) {
          bus.emitAgentComplete(name, taskId, result.output?.slice(0, 200));
          bus.emitTaskUpdate(taskId, `Run ${name}`, 'completed');
          bus.emitLog('info', `Agent ${name} completed in ${result.durationMs}ms`, 'orchestrator');
        } else {
          bus.emitAgentError(name, taskId, result.error ?? 'Unknown error');
          bus.emitTaskUpdate(taskId, `Run ${name}`, 'failed');
          bus.emitLog('error', `Agent ${name} failed: ${result.error}`, 'orchestrator');
        }

        return [name, result];
      } catch (err) {
        const error = (err as Error).message;
        bus.emitAgentError(name, taskId, error);
        bus.emitTaskUpdate(taskId, `Run ${name}`, 'failed');
        bus.emitLog('error', `Agent ${name} exception: ${error}`, 'orchestrator');
        throw err;
      }
    })
  );

  const merged: MergedResult = {
    gemini: null,
    gpt: null,
    durationMs: Date.now() - start,
  };

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const [name, agentResult] = result.value;
      if (name === 'gemini') merged.gemini = agentResult;
      if (name === 'gpt') merged.gpt = agentResult;
    }
  }

  // Phase completion
  const allSuccess = (merged.gemini?.success ?? true) && (merged.gpt?.success ?? true);
  bus.emitPhase(0, 'Analysis', allSuccess ? 'completed' : 'failed');
  bus.emitLog('info', `Parallel execution completed in ${merged.durationMs}ms`, 'orchestrator');

  return merged;
}

/** Smart run - auto-detect which agent to use */
export async function smartRun(options: RunParallelOptions): Promise<MergedResult> {
  const detected = detectAgent(options.prompt);

  if (detected === 'both' || options.agents) {
    return runParallel(options);
  }

  return runParallel({ ...options, agents: [detected] });
}

/** Check authentication status for all agents */
export async function checkAuthStatus(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};
  for (const [name, executor] of Object.entries(executors)) {
    status[name] = await executor.checkAuth();
  }
  return status;
}
