import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TmuxTaskRunner } from '../tmux-task-runner.js';
import type { TmuxSessionAdapterLike, TmuxWorkerTarget } from '../worker-host.js';

describe('TmuxTaskRunner', () => {
  const target: TmuxWorkerTarget = {
    projectId: 'server',
    workerId: 'worker-1',
    sessionName: 'olympus_server',
    windowName: 'worker-1',
    paneId: '%1',
    mode: 'resident',
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the prompt to tmux and resolves when captured output reaches a completed idle state', async () => {
    const capturePane = vi
      .fn<Required<TmuxSessionAdapterLike>['capturePane']>()
      .mockResolvedValueOnce('Implement auth flow\n\nThinking...')
      .mockResolvedValueOnce('Implement auth flow\n\nImplemented the auth flow.\n\n>')
      .mockResolvedValue('Implement auth flow\n\nImplemented the auth flow.\n\n>');

    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane,
    };

    const runner = new TmuxTaskRunner(sessionAdapter, {
      pollIntervalMs: 1_000,
      settleMs: 10_000,
      captureLines: 200,
    });

    const execution = runner.executeTask({
      target,
      prompt: 'Implement auth flow',
      source: 'remote',
    });

    await vi.advanceTimersByTimeAsync(21_000);

    await expect(execution).resolves.toMatchObject({
      success: true,
      text: 'Implemented the auth flow.',
    });
    expect(sessionAdapter.sendInput).toHaveBeenCalledWith({
      target,
      text: 'Implement auth flow',
      source: 'remote',
      submit: true,
    });
    expect(capturePane).toHaveBeenCalledWith({
      target,
      lines: 200,
    });
  });

  it('monitors an already-submitted prompt without sending duplicate input', async () => {
    const capturePane = vi
      .fn<Required<TmuxSessionAdapterLike>['capturePane']>()
      .mockResolvedValueOnce('Working...')
      .mockResolvedValueOnce('Fixed the failing test.\n\n>')
      .mockResolvedValue('Fixed the failing test.\n\n>');

    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane,
    };

    const runner = new TmuxTaskRunner(sessionAdapter, {
      pollIntervalMs: 1_000,
      settleMs: 10_000,
      captureLines: 120,
    });

    const execution = runner.monitorForCompletion({
      target,
      prompt: 'Fix the failing test',
    });

    await vi.advanceTimersByTimeAsync(21_000);

    await expect(execution).resolves.toMatchObject({
      success: true,
      text: 'Fixed the failing test.',
    });
    expect(sessionAdapter.sendInput).not.toHaveBeenCalled();
    expect(capturePane).toHaveBeenCalledWith({
      target,
      lines: 120,
    });
  });

  it('does not treat an idle welcome screen as task completion before prompt activity is observed', async () => {
    const welcomeScreen = [
      '╭─── Claude Code v2.1.81 ──────────────────────────────────────────────────────╮',
      '│ Welcome back                                                           │',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
      '',
      '────────────────────────────────────────────────────────────────────────────────',
      '❯ ',
      '────────────────────────────────────────────────────────────────────────────────',
    ].join('\n');

    const capturePane = vi
      .fn<Required<TmuxSessionAdapterLike>['capturePane']>()
      .mockResolvedValue(welcomeScreen);

    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane,
    };

    const runner = new TmuxTaskRunner(sessionAdapter, {
      pollIntervalMs: 1_000,
      settleMs: 1_000,
      maxWaitMs: 12_000,
      captureLines: 80,
    });

    const execution = runner.executeTask({
      target,
      prompt: 'Respond with exactly SMOKE_OK and nothing else.',
      source: 'remote',
    });
    const rejection = expect(execution).rejects.toThrow('tmux task monitoring timed out');

    await vi.advanceTimersByTimeAsync(13_000);

    await rejection;
  });

  it('waits for post-prompt output instead of completing from stale pre-prompt pane history', async () => {
    const prompt = 'Respond with exactly SMOKE_OK and nothing else.';
    const staleHistory = [
      'Previous task summary',
      '',
      '❯ ',
    ].join('\n');
    const promptEchoOnly = `${staleHistory}\n${prompt}\n`;
    const completedSnapshot = `${staleHistory}\n${prompt}\n\nSMOKE_OK\n\n❯ `;

    const capturePane = vi
      .fn<Required<TmuxSessionAdapterLike>['capturePane']>()
      .mockResolvedValueOnce(staleHistory)
      .mockResolvedValueOnce(promptEchoOnly)
      .mockResolvedValueOnce(completedSnapshot)
      .mockResolvedValue(completedSnapshot);

    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane,
    };

    const runner = new TmuxTaskRunner(sessionAdapter, {
      pollIntervalMs: 1_000,
      settleMs: 1_000,
      captureLines: 80,
    });

    const execution = runner.executeTask({
      target,
      prompt,
      source: 'remote',
    });

    await vi.advanceTimersByTimeAsync(13_000);

    await expect(execution).resolves.toMatchObject({
      success: true,
      text: 'SMOKE_OK',
    });
  });

  it('treats wrapped enriched prompts as valid task activity before completing', async () => {
    const prompt = '## Project Context\nA very long context block that wraps in tmux before the actual instruction is echoed back to the pane.\n\nRespond with exactly WRAPPED_OK and nothing else.';
    const baseline = [
      'Previous task summary',
      '',
      '❯ ',
    ].join('\n');
    const wrappedPromptEcho = [
      '## Project Context',
      'A very long context block that wraps in tmux before the actual',
      'instruction is echoed back to the pane.',
      '',
      'Respond with exactly WRAPPED_OK and nothing else.',
      '',
      'Thinking...',
    ].join('\n');
    const completedSnapshot = [
      '## Project Context',
      'A very long context block that wraps in tmux before the actual',
      'instruction is echoed back to the pane.',
      '',
      '⏺ WRAPPED_OK',
      '',
      '❯ ',
    ].join('\n');

    const capturePane = vi
      .fn<Required<TmuxSessionAdapterLike>['capturePane']>()
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce(wrappedPromptEcho)
      .mockResolvedValueOnce(completedSnapshot)
      .mockResolvedValue(completedSnapshot);

    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane,
    };

    const runner = new TmuxTaskRunner(sessionAdapter, {
      pollIntervalMs: 1_000,
      settleMs: 1_000,
      captureLines: 120,
    });

    const execution = runner.executeTask({
      target,
      prompt,
      source: 'remote',
    });

    await vi.advanceTimersByTimeAsync(13_000);

    await expect(execution).resolves.toMatchObject({
      success: true,
      text: 'WRAPPED_OK',
    });
  });

  it('does not send a second prompt when another task is already being monitored', async () => {
    const capturePane = vi
      .fn<Required<TmuxSessionAdapterLike>['capturePane']>()
      .mockResolvedValue('Implement auth flow\n\nThinking...');

    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane,
    };

    const runner = new TmuxTaskRunner(sessionAdapter, {
      pollIntervalMs: 1_000,
      settleMs: 1_000,
      maxWaitMs: 30_000,
      captureLines: 120,
    });

    const first = runner.monitorForCompletion({
      target,
      prompt: 'Implement auth flow',
    });

    await expect(runner.executeTask({
      target,
      prompt: 'Urgent follow-up',
      source: 'remote',
    })).rejects.toThrow('이미 작업 진행 중입니다');

    expect(sessionAdapter.sendInput).not.toHaveBeenCalled();

    runner.cancelActiveTask('cancelled for test cleanup');
    await expect(first).rejects.toThrow('cancelled for test cleanup');
  });

  it('clears both starting and processing flags when cancelActiveTask is invoked', () => {
    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane: vi.fn(),
    };

    const runner = new TmuxTaskRunner(sessionAdapter);
    const reject = vi.fn();

    (runner as unknown as {
      isStarting: boolean;
      isProcessing: boolean;
      activeState: {
        finished: boolean;
        settleTimer: ReturnType<typeof setTimeout> | null;
        pollTimer: ReturnType<typeof setTimeout> | null;
        reject: (error: Error) => void;
      };
    }).isStarting = true;
    (runner as unknown as {
      isStarting: boolean;
      isProcessing: boolean;
      activeState: {
        finished: boolean;
        settleTimer: ReturnType<typeof setTimeout> | null;
        pollTimer: ReturnType<typeof setTimeout> | null;
        reject: (error: Error) => void;
      };
    }).isProcessing = true;
    (runner as unknown as {
      activeState: {
        finished: boolean;
        settleTimer: ReturnType<typeof setTimeout> | null;
        pollTimer: ReturnType<typeof setTimeout> | null;
        reject: (error: Error) => void;
      };
    }).activeState = {
      finished: false,
      settleTimer: null,
      pollTimer: null,
      reject,
    };

    runner.cancelActiveTask('preempted');

    expect((runner as unknown as { isStarting: boolean }).isStarting).toBe(false);
    expect((runner as unknown as { isProcessing: boolean }).isProcessing).toBe(false);
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({
      message: 'preempted',
    }));
  });

  it('reports processing while a task is still in the starting phase', () => {
    const sessionAdapter: TmuxSessionAdapterLike = {
      startSession: vi.fn(),
      sendInput: vi.fn(),
      resetSession: vi.fn(),
      stopSession: vi.fn(),
      capturePane: vi.fn(),
    };

    const runner = new TmuxTaskRunner(sessionAdapter);
    (runner as unknown as { isStarting: boolean }).isStarting = true;

    expect(runner.processing).toBe(true);
  });
});
