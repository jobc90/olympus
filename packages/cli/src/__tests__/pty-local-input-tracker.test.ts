import { describe, expect, it, vi } from 'vitest';
import { PtyLocalInputTracker } from '../pty-local-input-tracker.js';

describe('PtyLocalInputTracker', () => {
  it('emits a trimmed command on enter while idle', () => {
    const tracker = new PtyLocalInputTracker();
    const onCommand = vi.fn();

    tracker.consume('git status', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });
    tracker.consume('\r', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });

    expect(onCommand).toHaveBeenCalledWith('git status');
  });

  it('forces completion during settle and then emits the next command', () => {
    const tracker = new PtyLocalInputTracker();
    const onCommand = vi.fn();
    const forceCompleteIfSettling = vi.fn(() => true);

    tracker.consume('next task', {
      isIdle: () => false,
      forceCompleteIfSettling,
      onCommand,
    });
    tracker.consume('\r', {
      isIdle: () => false,
      forceCompleteIfSettling,
      onCommand,
    });

    expect(forceCompleteIfSettling).toHaveBeenCalled();
    expect(onCommand).toHaveBeenCalledWith('next task');
  });

  it('ignores bracket pasted text', () => {
    const tracker = new PtyLocalInputTracker();
    const onCommand = vi.fn();

    tracker.consume('\x1b[200~git status\x1b[201~', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });
    tracker.consume('\r', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });

    expect(onCommand).not.toHaveBeenCalled();
  });

  it('applies backspace and clears buffer on control characters', () => {
    const tracker = new PtyLocalInputTracker();
    const onCommand = vi.fn();

    tracker.consume('git stats', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });
    tracker.consume('\b', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });
    tracker.consume('\r', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });

    expect(onCommand).toHaveBeenCalledWith('git stat');

    onCommand.mockClear();
    tracker.consume('ab', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });
    tracker.consume('\x1b[A', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });
    tracker.consume('\r', {
      isIdle: () => true,
      forceCompleteIfSettling: () => false,
      onCommand,
    });

    expect(onCommand).not.toHaveBeenCalled();
  });
});
