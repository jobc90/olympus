import type { Analysis, ExecutionPlan, AgentConfig } from '@olympus-dev/protocol';
import type { AIProvider, PlannerContext } from './providers/types.js';
import { MockProvider } from './providers/mock.js';

/**
 * Execution Planner — creates worker execution plans from analysis results.
 *
 * Delegates to the configured AIProvider (OpenAI, Mock, etc.)
 */
export class ExecutionPlanner {
  private provider: AIProvider;

  constructor(provider: AIProvider);
  /** @deprecated Use AIProvider constructor. Config-based constructor kept for backward compatibility. */
  constructor(config: AgentConfig);
  constructor(providerOrConfig: AIProvider | AgentConfig) {
    if ('plan' in providerOrConfig) {
      this.provider = providerOrConfig;
    } else {
      this.provider = new MockProvider({
        provider: providerOrConfig.provider,
        model: providerOrConfig.model,
        apiKey: providerOrConfig.apiKey,
        defaultTimeout: providerOrConfig.defaultTimeout,
        orchestrationMode: providerOrConfig.orchestrationMode,
      });
    }
  }

  async plan(analysis: Analysis, context?: PlannerContext): Promise<ExecutionPlan> {
    return this.provider.plan(analysis, context ?? {});
  }
}
