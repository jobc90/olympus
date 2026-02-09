import type { AgentConfig } from '@olympus-dev/protocol';
import type { AIProvider, AIProviderConfig } from './types.js';
import { MockProvider } from './mock.js';
import { OpenAIProvider } from './openai.js';

export type { AIProvider, AIProviderConfig, AnalyzerContext, PlannerContext } from './types.js';
export { MockProvider } from './mock.js';
export { OpenAIProvider } from './openai.js';

/**
 * Create an AI Provider based on config.
 *
 * - 'mock': Pattern-based analysis (no API calls)
 * - 'openai': OpenAI Chat Completions with tool_use
 * - 'anthropic': Falls back to mock (not yet implemented)
 *
 * Falls back to MockProvider if:
 * - Provider is 'mock'
 * - API key is missing
 */
export function createAIProvider(config: AgentConfig): AIProvider {
  const providerConfig: AIProviderConfig = {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    defaultTimeout: config.defaultTimeout,
    maxRetries: 2,
    orchestrationMode: config.orchestrationMode,
  };

  if (config.provider === 'mock' || !config.apiKey) {
    if (config.provider !== 'mock' && !config.apiKey) {
      console.warn(`[AIProvider] ${config.provider} provider에 API 키가 없습니다. Mock 모드로 전환합니다.`);
    }
    return new MockProvider(providerConfig);
  }

  if (config.provider === 'openai') {
    return new OpenAIProvider(providerConfig);
  }

  // Anthropic and other providers — fallback to mock
  console.warn(`[AIProvider] ${config.provider} provider는 아직 지원되지 않습니다. Mock 모드로 전환합니다.`);
  return new MockProvider(providerConfig);
}
