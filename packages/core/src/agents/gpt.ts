import type { AgentExecutor, AgentResult, ExecuteOptions } from '../types.js';
import { loadCredentials } from '../config.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * GPT agent executor - uses OpenAI REST API directly
 * Supports streaming via onChunk callback and cancellation via AbortSignal
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

    // Check if already aborted
    if (options?.signal?.aborted) {
      return {
        success: false,
        output: '',
        error: 'Aborted',
        agent: 'gpt',
        model,
        durationMs: Date.now() - start,
      };
    }

    const creds = await loadCredentials();
    if (!creds.openai?.apiKey) {
      return {
        success: true,
        skipped: true,
        reason: 'OpenAI API key not configured. Run: olympus auth openai',
        output: '',
        agent: 'gpt',
        model,
        durationMs: Date.now() - start,
      };
    }

    // Use streaming if onChunk callback is provided
    const useStreaming = !!options?.onChunk;

    try {
      // Create abort controller that combines timeout and external signal
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      // Link external signal to our controller
      if (options?.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

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
          stream: useStreaming,
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

      // Handle streaming response
      if (useStreaming && response.body) {
        const content = await this.handleStreamingResponse(response.body, options.onChunk!, controller.signal);
        return {
          success: true,
          output: content,
          agent: 'gpt',
          model,
          durationMs: Date.now() - start,
        };
      }

      // Non-streaming response
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
      const error = err as Error;
      if (error.name === 'AbortError' || options?.signal?.aborted) {
        return {
          success: false,
          output: '',
          error: 'Aborted',
          agent: 'gpt',
          model,
          durationMs: Date.now() - start,
        };
      }
      return {
        success: false,
        output: '',
        error: `GPT request failed: ${error.message}`,
        agent: 'gpt',
        model,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Handle SSE streaming response from OpenAI
   */
  private async handleStreamingResponse(
    body: ReadableStream<Uint8Array>,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        if (signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as {
                choices: Array<{ delta: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch {
              // Ignore malformed JSON in stream
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }
}
