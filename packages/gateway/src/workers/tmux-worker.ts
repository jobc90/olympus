import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkerTask, WorkerResult, WorkerConfig } from '@olympus-dev/protocol';
import type { Worker } from './types.js';

/**
 * Tmux Worker — executes tasks inside a tmux session with Claude CLI.
 *
 * Uses tmux pipe-pane + file offset for output streaming.
 * Reuses security patterns from the existing SessionManager (execFileSync, no shell).
 *
 * Emits: 'output', 'error', 'done'
 */
export class TmuxWorker extends EventEmitter implements Worker {
  private output = '';
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' = 'pending';
  private startedAt = 0;
  private sessionName: string;
  private logFile: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private lastOffset = 0;

  constructor(
    private task: WorkerTask,
    private config: WorkerConfig,
  ) {
    super();
    this.sessionName = `olympus-worker-${task.id}`;

    // Resolve log directory
    const logDir = (config.logDir || '~/.olympus/worker-logs').replace(/^~/, process.env.HOME || '/tmp');
    mkdirSync(logDir, { recursive: true });
    this.logFile = join(logDir, `${this.sessionName}.log`);
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
    return new Promise<WorkerResult>((resolve) => {
      this.startedAt = Date.now();
      this.status = 'running';

      const claudePath = this.config.claudePath || 'claude';

      try {
        // Create tmux session (detached)
        execFileSync('tmux', [
          'new-session', '-d', '-s', this.sessionName,
          '-x', '200', '-y', '50',
        ], { cwd: this.task.projectPath });

        // Set up pipe-pane for output capture
        execFileSync('tmux', [
          'pipe-pane', '-t', this.sessionName,
          `cat >> ${this.logFile}`,
        ]);

        // Send Claude CLI command
        const prompt = this.task.orchestration
          ? `/orchestration "${this.task.prompt}"`
          : this.task.prompt;

        const command = `${claudePath} --dangerously-skip-permissions -p ${this.task.projectPath} --message ${JSON.stringify(prompt)}`;
        execFileSync('tmux', ['send-keys', '-t', this.sessionName, command, 'Enter']);
      } catch (err) {
        this.status = 'failed';
        this.cleanup();
        resolve({
          workerId: this.task.id,
          status: 'failed',
          exitCode: null,
          output: '',
          duration: 0,
          error: `tmux 세션 생성 실패: ${(err as Error).message}`,
        });
        return;
      }

      // Poll for output updates
      this.pollInterval = setInterval(() => {
        this.readNewOutput();
      }, 1000);

      // Poll for session completion
      const completionCheck = setInterval(() => {
        if (!this.isSessionAlive()) {
          clearInterval(completionCheck);
          this.readNewOutput(); // Final read
          this.clearTimeouts();
          this.cleanup();

          const duration = Date.now() - this.startedAt;
          this.status = 'completed';
          resolve({
            workerId: this.task.id,
            status: 'completed',
            exitCode: 0,
            output: this.output,
            duration,
          });
        }
      }, 2000);

      // Timeout
      this.timeoutHandle = setTimeout(() => {
        if (this.status === 'running') {
          this.status = 'timeout';
          clearInterval(completionCheck);
          this.readNewOutput();
          this.clearTimeouts();
          this.cleanup();

          resolve({
            workerId: this.task.id,
            status: 'timeout',
            exitCode: null,
            output: this.output,
            duration: Date.now() - this.startedAt,
            error: `타임아웃 (${this.task.timeout}ms)`,
          });
        }
      }, this.task.timeout);
    });
  }

  terminate(): void {
    if (this.status === 'running') {
      this.status = 'failed';
      this.clearTimeouts();
      this.cleanup();
    }
  }

  /**
   * Read new output from the log file since last offset.
   */
  private readNewOutput(): void {
    try {
      if (!existsSync(this.logFile)) return;

      const content = readFileSync(this.logFile, 'utf-8');
      if (content.length > this.lastOffset) {
        const newContent = content.slice(this.lastOffset);
        this.lastOffset = content.length;
        this.output += newContent;
        this.emit('output', newContent);

        // Enforce max output buffer
        if (this.output.length > this.config.maxOutputBuffer) {
          this.output = this.output.slice(-this.config.maxOutputBuffer);
        }
      }
    } catch {
      // File read error — ignore
    }
  }

  /**
   * Check if the tmux session is still alive.
   */
  private isSessionAlive(): boolean {
    try {
      execFileSync('tmux', ['has-session', '-t', this.sessionName], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup tmux session and polling.
   */
  private cleanup(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Kill session if still alive
    try {
      execFileSync('tmux', ['kill-session', '-t', this.sessionName], { stdio: 'pipe' });
    } catch {
      // Session already gone
    }
  }

  private clearTimeouts(): void {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = null;
  }
}
