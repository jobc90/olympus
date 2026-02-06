import type { AgentExecutor, AgentResult, ExecuteOptions } from '../types.js';
import { loadCredentials, loadConfig } from '../config.js';

/**
 * Codex agent executor - uses OpenAI REST API directly.
 * Supports streaming via onChunk callback and cancellation via AbortSignal.
 */
export class CodexExecutor implements AgentExecutor {
  readonly name = 'codex' as const;

  async checkAuth(): Promise<boolean> {
    const creds = await loadCredentials();
    return !!creds.openai?.apiKey;
  }

  async execute(prompt: string, options?: ExecuteOptions): Promise<AgentResult> {
    const config = await loadConfig();
    const model = options?.model ?? config.codex.defaultModel;
    const timeout = options?.timeout ?? 120_000;
    const start = Date.now();

    if (options?.signal?.aborted) {
      return {
        success: false,
        output: '',
        error: 'Aborted',
        agent: 'codex',
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
        agent: 'codex',
        model,
        durationMs: Date.now() - start,
      };
    }

    const useStreaming = !!options?.onChunk;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      if (options?.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const response = await fetch(`${config.codex.apiBaseUrl}/chat/completions`, {
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
          agent: 'codex',
          model,
          durationMs: Date.now() - start,
        };
      }

      if (useStreaming && response.body) {
        const content = await this.handleStreamingResponse(response.body, options.onChunk!, controller.signal);
        return {
          success: true,
          output: content,
          agent: 'codex',
          model,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';

      return {
        success: true,
        output: content,
        agent: 'codex',
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
          agent: 'codex',
          model,
          durationMs: Date.now() - start,
        };
      }
      return {
        success: false,
        output: '',
        error: `Codex request failed: ${error.message}`,
        agent: 'codex',
        model,
        durationMs: Date.now() - start,
      };
    }
  }

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
          if (!line.startsWith('data: ')) continue;
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
            // Ignore malformed JSON in stream.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }
}
