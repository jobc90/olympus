import { spawn } from 'child_process';
import type { AgentExecutor, AgentResult, ExecuteOptions } from '../types.js';
import { DEFAULT_CONFIG } from '../config.js';

/**
 * Gemini agent executor - uses Gemini CLI (spawn)
 * Extracted from multi-ai-orchestration/mcps/ai-agents/server.js
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

    // Try primary model first
    const result = await this.executeWithModel(prompt, primaryModel, timeout);
    if (result.success) return { ...result, durationMs: Date.now() - start };

    // Fallback on failure (404 or model not available)
    if (result.error?.includes('404') || result.error?.includes('not found')) {
      const fallbackResult = await this.executeWithModel(prompt, fallbackModel, timeout);
      return { ...fallbackResult, durationMs: Date.now() - start };
    }

    return { ...result, durationMs: Date.now() - start };
  }

  private executeWithModel(prompt: string, model: string, timeout: number): Promise<AgentResult> {
    return new Promise((resolve) => {
      const args = ['--model', model, '-p', prompt];
      const proc = spawn('gemini', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          output: '',
          error: `Timeout after ${timeout}ms`,
          agent: 'gemini',
          model,
        });
      }, timeout);

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
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
