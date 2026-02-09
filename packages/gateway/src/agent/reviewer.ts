import type { AgentTask, WorkerResult, ReviewReport, AgentConfig } from '@olympus-dev/protocol';
import type { AIProvider } from './providers/types.js';
import { MockProvider } from './providers/mock.js';

/**
 * Result Reviewer — analyzes worker outputs and makes success/failure judgments.
 *
 * Delegates to the configured AIProvider (OpenAI, Mock, etc.)
 */
export class ResultReviewer {
  private provider: AIProvider;

  constructor(provider: AIProvider);
  /** @deprecated Use AIProvider constructor. Config-based constructor kept for backward compatibility. */
  constructor(config: AgentConfig);
  constructor(providerOrConfig: AIProvider | AgentConfig) {
    if ('review' in providerOrConfig) {
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

  async review(results: WorkerResult[], task: AgentTask): Promise<ReviewReport> {
    return this.provider.review(results, task);
  }
}
