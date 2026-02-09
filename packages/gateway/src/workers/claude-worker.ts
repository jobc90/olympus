import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { WorkerTask, WorkerResult, WorkerConfig } from '@olympus-dev/protocol';

/**
 * Claude CLI Worker — executes a task via `claude` CLI in non-interactive mode.
 *
 * Uses child_process.spawn() for precise stdout/stderr control.
 * Emits: 'output', 'error', 'done'
 */
export class ClaudeCliWorker extends EventEmitter {
  private process: ChildProcess | null = null;
  private output = '';
  private errorOutput = '';
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' = 'pending';
  private startedAt = 0;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private killTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private task: WorkerTask,
    private config: WorkerConfig,
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

  /**
   * Start the Claude CLI process
   */
  async start(): Promise<WorkerResult> {
    return new Promise<WorkerResult>((resolve) => {
      this.startedAt = Date.now();
      this.status = 'running';

      const claudePath = this.config.claudePath || 'claude';

      // Build prompt
      const prompt = this.buildPrompt();

      // Spawn Claude CLI in non-interactive mode
      const args = ['--dangerously-skip-permissions', '-p', this.task.projectPath, '--message', prompt];

      try {
        this.process = spawn(claudePath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.buildSafeEnv(),
          cwd: this.task.projectPath,
        });
      } catch (err) {
        this.status = 'failed';
        resolve({
          workerId: this.task.id,
          status: 'failed',
          exitCode: null,
          output: '',
          duration: 0,
          error: `spawn 실패: ${(err as Error).message}`,
        });
        return;
      }

      // stdout streaming
      this.process.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.output += text;
        this.emit('output', text);

        // Enforce max output buffer
        if (this.output.length > this.config.maxOutputBuffer) {
          this.output = this.output.slice(-this.config.maxOutputBuffer);
        }
      });

      // stderr
      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.errorOutput += text;
        this.emit('error', text);
      });

      // Process exit
      this.process.on('close', (code) => {
        this.clearTimeouts();
        const duration = Date.now() - this.startedAt;

        if (this.status === 'timeout') {
          resolve({
            workerId: this.task.id,
            status: 'timeout',
            exitCode: code,
            output: this.output,
            duration,
            error: `타임아웃 (${this.task.timeout}ms)`,
          });
          return;
        }

        this.status = code === 0 ? 'completed' : 'failed';
        resolve({
          workerId: this.task.id,
          status: this.status,
          exitCode: code,
          output: this.output,
          duration,
          error: code !== 0 ? this.errorOutput.slice(0, 500) : undefined,
        });
      });

      this.process.on('error', (err) => {
        this.clearTimeouts();
        this.status = 'failed';
        resolve({
          workerId: this.task.id,
          status: 'failed',
          exitCode: null,
          output: this.output,
          duration: Date.now() - this.startedAt,
          error: err.message,
        });
      });

      // Timeout
      this.timeoutHandle = setTimeout(() => {
        if (this.status === 'running') {
          this.status = 'timeout';
          this.process?.kill('SIGTERM');

          // Escalate to SIGKILL after 10 seconds
          this.killTimeoutHandle = setTimeout(() => {
            this.process?.kill('SIGKILL');
          }, 10_000);
        }
      }, this.task.timeout);
    });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.process && this.status === 'running') {
      this.process.kill('SIGTERM');
      // Escalate after 5 seconds
      this.killTimeoutHandle = setTimeout(() => {
        this.process?.kill('SIGKILL');
      }, 5_000);
    }
  }

  private buildPrompt(): string {
    if (this.task.orchestration) {
      return `/orchestration "${this.task.prompt}"`;
    }
    return this.task.prompt;
  }

  /**
   * Build a safe environment for the worker.
   * Excludes sensitive keys that workers shouldn't access.
   */
  private buildSafeEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Remove sensitive keys
    delete env.OPENAI_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    delete env.OLYMPUS_AGENT_API_KEY;

    // Set worker-specific vars
    env.CLAUDE_NO_TELEMETRY = '1';

    return env;
  }

  private clearTimeouts(): void {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    if (this.killTimeoutHandle) clearTimeout(this.killTimeoutHandle);
    this.timeoutHandle = null;
    this.killTimeoutHandle = null;
  }
}
