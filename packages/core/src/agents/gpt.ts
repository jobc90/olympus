import type { AgentExecutor, AgentResult, ExecuteOptions } from '../types.js';
import { loadCredentials } from '../config.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * GPT agent executor - uses OpenAI REST API directly
 * Extracted from multi-ai-orchestration/mcps/ai-agents/server.js
 */
export class GptExecutor implements AgentExecutor {
  readonly name = 'gpt' as const;

  async checkAuth(): Promise<boolean> {
    const creds = await loadCredentials();
    return !!creds.openai?.apiKey;
  }

  async execute(prompt: string, options?: ExecuteOptions): Promise<AgentResult> {
    const model = options?.model ?? DEFAULT_CONFIG.gpt.defaultModel;
    const timeout = options?.timeout ?? 120_000;
    const start = Date.now();

    const creds = await loadCredentials();
    if (!creds.openai?.apiKey) {
      return {
        success: false,
        output: '',
        error: 'OpenAI API key not configured. Run: olympus auth openai',
        agent: 'gpt',
        model,
        durationMs: Date.now() - start,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${DEFAULT_CONFIG.gpt.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${creds.openai.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          output: '',
          error: `OpenAI API error (${response.status}): ${errorBody}`,
          agent: 'gpt',
          model,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';

      return {
        success: true,
        output: content,
        agent: 'gpt',
        model,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `GPT request failed: ${(err as Error).message}`,
        agent: 'gpt',
        model,
        durationMs: Date.now() - start,
      };
    }
  }
}
