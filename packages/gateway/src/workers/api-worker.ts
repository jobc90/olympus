import { EventEmitter } from 'node:events';
import type { WorkerTask, WorkerResult, WorkerConfig } from '@olympus-dev/protocol';
import type { Worker } from './types.js';

/**
 * API Worker — executes tasks via Claude API (Messages endpoint) with streaming.
 *
 * Uses the Anthropic SDK for direct API calls. Suitable for quick Q&A and
 * lightweight tasks that don't require file system access.
 *
 * Emits: 'output', 'error', 'done'
 */
export class ApiWorker extends EventEmitter implements Worker {
  private output = '';
  private errorOutput = '';
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' = 'pending';
  private startedAt = 0;
  private abortController: AbortController | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private task: WorkerTask,
    private config: WorkerConfig,
    private apiKey?: string,
    private model = 'claude-sonnet-4-20250514',
  ) {
    super();
  }

  getStatus(): string {
    return this.status;
  }

  getOutput(): string {
    return this.output;
  }

  getOutputPreview(maxLength = 200): string {
    if (this.output.length <= maxLength) return this.output;
    return '...' + this.output.slice(-maxLength);
  }

  async start(): Promise<WorkerResult> {
    this.startedAt = Date.now();
    this.status = 'running';

    if (!this.apiKey) {
      this.status = 'failed';
      return {
        workerId: this.task.id,
        status: 'failed',
        exitCode: null,
        output: '',
        duration: 0,
        error: 'API 키가 설정되지 않았습니다.',
      };
    }

    this.abortController = new AbortController();

    // Timeout
    this.timeoutHandle = setTimeout(() => {
      if (this.status === 'running') {
        this.status = 'timeout';
        this.abortController?.abort();
      }
    }, this.task.timeout);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          stream: true,
          messages: [{ role: 'user', content: this.task.prompt }],
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API ${response.status}: ${errBody.slice(0, 300)}`);
      }

      // Stream SSE response
      await this.streamResponse(response);

      this.clearTimeouts();
      const duration = Date.now() - this.startedAt;

      // Check if timeout fired during streaming
      const currentStatus = this.status as string;
      if (currentStatus === 'timeout') {
        return {
          workerId: this.task.id,
          status: 'timeout',
          exitCode: null,
          output: this.output,
          duration,
          error: `타임아웃 (${this.task.timeout}ms)`,
        };
      }

      this.status = 'completed';
      return {
        workerId: this.task.id,
        status: 'completed',
        exitCode: 0,
        output: this.output,
        duration,
      };
    } catch (err) {
      this.clearTimeouts();
      const duration = Date.now() - this.startedAt;
      const error = err as Error;

      if ((this.status as string) === 'timeout') {
        return {
          workerId: this.task.id,
          status: 'timeout',
          exitCode: null,
          output: this.output,
          duration,
          error: `타임아웃 (${this.task.timeout}ms)`,
        };
      }

      this.status = 'failed';
      return {
        workerId: this.task.id,
        status: 'failed',
        exitCode: 1,
        output: this.output,
        duration,
        error: error.message,
      };
    }
  }

  terminate(): void {
    if (this.status === 'running') {
      this.abortController?.abort();
      this.status = 'failed';
    }
  }

  /**
   * Stream SSE events from the Anthropic Messages API.
   */
  private async streamResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              const text = event.delta.text;
              this.output += text;
              this.emit('output', text);

              // Enforce max output buffer
              if (this.output.length > this.config.maxOutputBuffer) {
                this.output = this.output.slice(-this.config.maxOutputBuffer);
              }
            }
            if (event.type === 'message_stop') {
              return;
            }
            if (event.type === 'error') {
              this.errorOutput += event.error?.message || 'Unknown API error';
              this.emit('error', event.error?.message || 'Unknown API error');
            }
          } catch {
            // Non-JSON line — skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private clearTimeouts(): void {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = null;
  }
}
