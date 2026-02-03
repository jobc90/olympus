import type { AgentExecutor, AgentResult, MergedResult, OrchestratorOptions } from './types.js';
import { GeminiExecutor } from './agents/gemini.js';
import { GptExecutor } from './agents/gpt.js';
import { detectAgent } from './agents/router.js';

const executors: Record<string, AgentExecutor> = {
  gemini: new GeminiExecutor(),
  gpt: new GptExecutor(),
};

/** Run agents in parallel */
export async function runParallel(options: OrchestratorOptions): Promise<MergedResult> {
  const start = Date.now();
  const agents = options.agents ?? ['gemini', 'gpt'];

  const prompt = options.context
    ? `Context:\n${options.context}\n\nTask:\n${options.prompt}`
    : options.prompt;

  const results = await Promise.allSettled(
    agents.map(async (name): Promise<[string, AgentResult]> => {
      const executor = executors[name];
      if (!executor) throw new Error(`Unknown agent: ${name}`);
      const result = await executor.execute(prompt, { usePro: options.usePro, timeout: options.timeout });
      return [name, result];
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

  return merged;
}

/** Smart run - auto-detect which agent to use */
export async function smartRun(options: OrchestratorOptions): Promise<MergedResult> {
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
