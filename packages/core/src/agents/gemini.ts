import { spawn, type ChildProcess } from 'child_process';
import type { AgentExecutor, AgentResult, ExecuteOptions } from '../types.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * Gemini agent executor - uses Gemini CLI (spawn)
 * Supports streaming via onChunk callback and cancellation via AbortSignal
 */
export class GeminiExecutor implements AgentExecutor {
  readonly name = 'gemini' as const;

  async checkAuth(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('gemini', ['--version'], { stdio: 'pipe' });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  async execute(prompt: string, options?: ExecuteOptions): Promise<AgentResult> {
    const usePro = options?.usePro ?? false;
    const primaryModel = options?.model ?? (usePro ? DEFAULT_CONFIG.gemini.proModel : DEFAULT_CONFIG.gemini.defaultModel);
    const fallbackModel = usePro ? DEFAULT_CONFIG.gemini.fallbackProModel : DEFAULT_CONFIG.gemini.fallbackModel;
    const timeout = options?.timeout ?? 120_000;

    const start = Date.now();

    // Check if already aborted
    if (options?.signal?.aborted) {
      return {
        success: false,
        output: '',
        error: 'Aborted',
        agent: 'gemini',
        model: primaryModel,
        durationMs: Date.now() - start,
      };
    }

    // Try primary model first
    const result = await this.executeWithModel(prompt, primaryModel, timeout, options);
    if (result.success) return { ...result, durationMs: Date.now() - start };

    // Fallback on failure (404 or model not available)
    if (result.error?.includes('404') || result.error?.includes('not found')) {
      const fallbackResult = await this.executeWithModel(prompt, fallbackModel, timeout, options);
      return { ...fallbackResult, durationMs: Date.now() - start };
    }

    return { ...result, durationMs: Date.now() - start };
  }

  private executeWithModel(
    prompt: string,
    model: string,
    timeout: number,
    options?: ExecuteOptions
  ): Promise<AgentResult> {
    return new Promise((resolve) => {
      const args = ['--model', model, '-p', prompt];
      const proc = spawn('gemini', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      let aborted = false;

      // Handle abort signal
      const abortHandler = () => {
        aborted = true;
        proc.kill('SIGTERM');
        resolve({
          success: false,
          output: stdout.trim(),
          error: 'Aborted',
          agent: 'gemini',
          model,
        });
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          proc.kill('SIGTERM');
          resolve({
            success: false,
            output: '',
            error: 'Aborted',
            agent: 'gemini',
            model,
          });
          return;
        }
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      const timer = setTimeout(() => {
        if (!aborted) {
          proc.kill('SIGTERM');
          resolve({
            success: false,
            output: '',
            error: `Timeout after ${timeout}ms`,
            agent: 'gemini',
            model,
          });
        }
      }, timeout);

      // Stream stdout chunks
      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // Call streaming callback if provided
        if (options?.onChunk && !aborted) {
          options.onChunk(chunk);
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', abortHandler);

        if (aborted) return; // Already resolved

        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: code !== 0 ? (stderr || stdout).trim() : undefined,
          agent: 'gemini',
          model,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', abortHandler);

        if (aborted) return; // Already resolved

        resolve({
          success: false,
          output: '',
          error: `Gemini CLI not found: ${err.message}. Install with: npm i -g @google/gemini-cli`,
          agent: 'gemini',
          model,
        });
      });
    });
  }
}
