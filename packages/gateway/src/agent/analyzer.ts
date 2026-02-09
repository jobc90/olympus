import type { Analysis, AgentConfig } from '@olympus-dev/protocol';
import type { AIProvider, AnalyzerContext } from './providers/types.js';
import { MockProvider } from './providers/mock.js';

export type { AnalyzerContext } from './providers/types.js';

/**
 * Command Analyzer — analyzes user commands into structured Analysis objects.
 *
 * Delegates to the configured AIProvider (OpenAI, Mock, etc.)
 */
export class CommandAnalyzer {
  private provider: AIProvider;

  constructor(provider: AIProvider);
  /** @deprecated Use AIProvider constructor. Config-based constructor kept for backward compatibility. */
  constructor(config: AgentConfig);
  constructor(providerOrConfig: AIProvider | AgentConfig) {
    if ('analyze' in providerOrConfig) {
      this.provider = providerOrConfig;
    } else {
      // Legacy constructor — create MockProvider from config
      this.provider = new MockProvider({
        provider: providerOrConfig.provider,
        model: providerOrConfig.model,
        apiKey: providerOrConfig.apiKey,
        defaultTimeout: providerOrConfig.defaultTimeout,
        orchestrationMode: providerOrConfig.orchestrationMode,
      });
    }
  }

  async analyze(command: string, context: AnalyzerContext): Promise<Analysis> {
    return this.provider.analyze(command, context);
  }
}
