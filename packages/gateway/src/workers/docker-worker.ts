import { EventEmitter } from 'node:events';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { WorkerTask, WorkerResult, WorkerConfig } from '@olympus-dev/protocol';
import type { Worker } from './types.js';

/**
 * Docker Worker — runs Claude CLI inside a Docker container for maximum isolation.
 *
 * Falls back to ClaudeCliWorker (child_process) if Docker is not available.
 *
 * Emits: 'output', 'error', 'done'
 */
export class DockerWorker extends EventEmitter implements Worker {
  private output = '';
  private errorOutput = '';
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' = 'pending';
  private startedAt = 0;
  private containerName: string;
  private process: ChildProcess | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private task: WorkerTask,
    private config: WorkerConfig,
  ) {
    super();
    this.containerName = `olympus-worker-${randomUUID().slice(0, 8)}`;
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

    // Check if Docker is available
    if (!this.isDockerAvailable()) {
      this.status = 'failed';
      return {
        workerId: this.task.id,
        status: 'failed',
        exitCode: null,
        output: '',
        duration: 0,
        error: 'Docker가 설치되어 있지 않거나 실행 중이 아닙니다. child_process fallback을 사용하세요.',
      };
    }

    // Timeout
    this.timeoutHandle = setTimeout(() => {
      if (this.status === 'running') {
        this.status = 'timeout';
        this.stopContainer();
      }
    }, this.task.timeout);

    try {
      const result = await this.runInContainer();
      this.clearTimeouts();
      return result;
    } catch (err) {
      this.clearTimeouts();
      const duration = Date.now() - this.startedAt;
      this.status = 'failed';
      return {
        workerId: this.task.id,
        status: 'failed',
        exitCode: 1,
        output: this.output,
        duration,
        error: (err as Error).message,
      };
    }
  }

  terminate(): void {
    if (this.status === 'running') {
      this.clearTimeouts();
      this.stopContainer();
      this.status = 'failed';
    }
  }

  private isDockerAvailable(): boolean {
    try {
      execFileSync('docker', ['info'], {
        stdio: 'pipe',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async runInContainer(): Promise<WorkerResult> {
    return new Promise<WorkerResult>((resolve) => {
      const args = [
        'run',
        '--rm',
        '--name', this.containerName,
        // Mount project directory
        '-v', `${this.task.projectPath}:/workspace`,
        '-w', '/workspace',
        // Minimal environment — no host env leakage
        '-e', `CLAUDE_PROMPT=${this.task.prompt}`,
        // Resource limits
        '--memory', '2g',
        '--cpus', '2',
        // Use node image with Claude CLI
        'node:20-slim',
        'sh', '-c',
        `npx -y @anthropic-ai/claude-code --print "$CLAUDE_PROMPT" 2>&1`,
      ];

      this.process = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH },
      });

      this.process.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.output += text;
        this.emit('output', text);

        if (this.output.length > this.config.maxOutputBuffer) {
          this.output = this.output.slice(-this.config.maxOutputBuffer);
        }
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.errorOutput += text;
        this.emit('error', text);
      });

      this.process.on('close', (code) => {
        const duration = Date.now() - this.startedAt;

        if ((this.status as string) === 'timeout') {
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
          error: code !== 0 ? this.errorOutput.slice(-500) : undefined,
        });
      });

      this.process.on('error', (err) => {
        const duration = Date.now() - this.startedAt;
        this.status = 'failed';
        resolve({
          workerId: this.task.id,
          status: 'failed',
          exitCode: null,
          output: this.output,
          duration,
          error: err.message,
        });
      });
    });
  }

  private stopContainer(): void {
    try {
      this.process?.kill('SIGTERM');
      execFileSync('docker', ['stop', '-t', '5', this.containerName], {
        stdio: 'pipe',
        timeout: 10_000,
      });
    } catch {
      // Container may already be stopped
    }
    try {
      execFileSync('docker', ['rm', '-f', this.containerName], {
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // Container may already be removed
    }
  }

  private clearTimeouts(): void {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = null;
  }
}
