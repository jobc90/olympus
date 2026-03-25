import type { TaskResult } from './worker-runtime.js';
import {
  detectCompletionPattern,
  detectIdlePromptForCompletion,
  extractResultFromBuffer,
  shouldForceCompletionOnQuiet,
} from './pty-worker.js';

// Reuse PTY terminal-text heuristics only as a compatibility fallback.
// Runtime-control state and task artifacts remain the authoritative sources.
import type {
  TmuxSessionAdapterLike,
  TmuxWorkerTarget,
} from './worker-host.js';

export interface TmuxTaskRunnerOptions {
  pollIntervalMs?: number;
  settleMs?: number;
  captureLines?: number;
  maxWaitMs?: number;
  now?: () => number;
}

export interface TmuxTaskExecutionInput {
  target: TmuxWorkerTarget;
  prompt: string;
  source: 'local' | 'remote';
}

export interface TmuxTaskMonitorInput {
  target: TmuxWorkerTarget;
  prompt: string;
}

interface MonitorOptions {
  requirePromptEvidence: boolean;
  baselineSnapshot: string;
}

interface RunnerState {
  prompt: string;
  submittedAt: number;
  lastOutputAt: number;
  lastSnapshot: string;
  baselineSnapshot: string;
  requirePromptEvidence: boolean;
  observedPromptEcho: boolean;
  observedPostPromptOutput: boolean;
  observedRuntimeActivity: boolean;
  reject: (error: Error) => void;
  settleTimer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
  finished: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_SETTLE_MS = 10_000;
const DEFAULT_CAPTURE_LINES = 200;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1_000;

export class TmuxTaskRunner {
  private isProcessing = false;

  private activeState: RunnerState | null = null;

  private isStarting = false;

  constructor(
    private readonly sessionAdapter: TmuxSessionAdapterLike,
    private readonly options: TmuxTaskRunnerOptions = {},
  ) {}

  async executeTask(input: TmuxTaskExecutionInput): Promise<TaskResult> {
    if (this.isProcessing || this.isStarting) {
      throw new Error('이미 작업 진행 중입니다');
    }
    this.isStarting = true;
    try {
      const baselineSnapshot = (await this.captureSnapshot(input.target).catch(() => '')) ?? '';
      await this.sessionAdapter.sendInput({
        target: input.target,
        text: input.prompt,
        source: input.source,
        submit: true,
      });

      return await this.monitorTask({
        target: input.target,
        prompt: input.prompt,
      }, {
        requirePromptEvidence: true,
        baselineSnapshot,
      });
    } finally {
      this.isStarting = false;
    }
  }

  async monitorForCompletion(input: TmuxTaskMonitorInput): Promise<TaskResult> {
    return this.monitorTask(input, {
      requirePromptEvidence: false,
      baselineSnapshot: '',
    });
  }

  private async monitorTask(
    input: TmuxTaskMonitorInput,
    monitorOptions: MonitorOptions,
  ): Promise<TaskResult> {
    if (this.isProcessing) {
      throw new Error('이미 작업 진행 중입니다');
    }

    this.isProcessing = true;
    const submittedAt = this.now();
    const state: RunnerState = {
      prompt: input.prompt,
      submittedAt,
      lastOutputAt: submittedAt,
      lastSnapshot: '',
      baselineSnapshot: monitorOptions.baselineSnapshot,
      requirePromptEvidence: monitorOptions.requirePromptEvidence,
      observedPromptEcho: false,
      observedPostPromptOutput: false,
      observedRuntimeActivity: false,
      reject: () => {},
      settleTimer: null,
      pollTimer: null,
      finished: false,
    };

    try {
      return await new Promise<TaskResult>((resolve, reject) => {
        state.reject = reject;
        this.activeState = state;
        const poll = async () => {
          try {
            if (state.finished) return;
            const now = this.now();
            if (now - state.submittedAt > (this.options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS)) {
              this.finish(state);
              reject(new Error('tmux task monitoring timed out'));
              return;
            }

            const snapshot = (await this.captureSnapshot(input.target)) ?? '';
            if (snapshot !== state.lastSnapshot) {
              state.lastSnapshot = snapshot;
              state.lastOutputAt = now;
            }
            if (state.requirePromptEvidence && snapshot !== state.baselineSnapshot) {
              state.observedRuntimeActivity = true;
            }

            const promptEchoObserved = snapshot.includes(state.prompt);
            if (promptEchoObserved) {
              state.observedPromptEcho = true;
            }

            const postPromptOutput = extractPostPromptOutput(snapshot, state.prompt);
            if (postPromptOutput) {
              state.observedPostPromptOutput = true;
            }

            const idlePromptScope = state.requirePromptEvidence
              ? (postPromptOutput || (!promptEchoObserved && state.observedRuntimeActivity ? snapshot : ''))
              : snapshot;
            const hasIdlePrompt = detectIdlePromptForCompletion(idlePromptScope);
            const hasCompletionText = postPromptOutput
              ? detectCompletionPattern(postPromptOutput)
              : detectCompletionPattern(snapshot);
            const quietCompletion = shouldForceCompletionOnQuiet(
              snapshot,
              state.submittedAt,
              state.lastOutputAt,
              now,
            );
            const canUseCompatibilityCompletion = !state.requirePromptEvidence
              || state.observedPostPromptOutput
              || state.observedRuntimeActivity;

            if (canUseCompatibilityCompletion && (hasIdlePrompt || hasCompletionText || quietCompletion)) {
              if (!state.settleTimer) {
                state.settleTimer = setTimeout(() => {
                  this.finish(state);
                  const completedAt = this.now();
                  const resultText = state.requirePromptEvidence
                    ? extractPostPromptOutput(state.lastSnapshot, state.prompt)
                    : extractResultFromBuffer(state.lastSnapshot, state.prompt);
                  resolve({
                    success: true,
                    text: resultText || extractResultFromBuffer(state.lastSnapshot, state.prompt),
                    durationMs: completedAt - state.submittedAt,
                  });
                }, this.options.settleMs ?? DEFAULT_SETTLE_MS);
              }
            } else {
              this.clearSettleTimer(state);
            }

            state.pollTimer = setTimeout(() => {
              void poll();
            }, this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
          } catch (error) {
            this.finish(state);
            reject(error);
          }
        };

        void poll();
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async captureSnapshot(target: TmuxWorkerTarget): Promise<string> {
    return this.sessionAdapter.capturePane({
      target,
      lines: this.options.captureLines ?? DEFAULT_CAPTURE_LINES,
    });
  }

  private clearSettleTimer(state: RunnerState): void {
    if (!state.settleTimer) return;
    clearTimeout(state.settleTimer);
    state.settleTimer = null;
  }

  private finish(state: RunnerState): void {
    state.finished = true;
    this.clearSettleTimer(state);
    if (this.activeState === state) {
      this.activeState = null;
    }
    if (!state.pollTimer) return;
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  get processing(): boolean {
    return this.isProcessing || this.isStarting;
  }

  cancelActiveTask(reason = 'task preempted by runtime control'): void {
    const state = this.activeState;
    if (!state || state.finished) return;
    this.finish(state);
    this.isStarting = false;
    this.isProcessing = false;
    state.reject(new Error(reason));
  }
}

function extractPostPromptOutput(snapshot: string, prompt: string): string {
  const promptIndex = snapshot.lastIndexOf(prompt);
  if (promptIndex < 0) return '';
  return extractResultFromBuffer(snapshot.slice(promptIndex), prompt).trim();
}
