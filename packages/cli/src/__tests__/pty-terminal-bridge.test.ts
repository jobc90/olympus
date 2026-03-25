import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PtyTerminalBridge } from '../pty-terminal-bridge.js';

class MockStdin extends EventEmitter {
  isTTY = true;

  isRaw = false;

  readonly setRawMode = vi.fn((mode: boolean) => {
    this.isRaw = mode;
  });

  readonly resume = vi.fn();
}

class MockStdout extends EventEmitter {
  isTTY = true;

  columns = 120;

  rows = 40;

  readonly write = vi.fn();
}

describe('PtyTerminalBridge', () => {
  it('attaches stdin/raw-mode and resize forwarding to the PTY session', () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    const bridge = new PtyTerminalBridge({ stdin, stdout });
    const session = {
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
    };
    const stdinBridge = {
      handleData: vi.fn(),
      reset: vi.fn(),
    };

    bridge.attach({
      session,
      stdinBridge: stdinBridge as never,
    });

    stdin.emit('data', Buffer.from('status'));
    stdout.emit('resize');

    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(stdin.resume).toHaveBeenCalledTimes(1);
    expect(stdinBridge.handleData).toHaveBeenCalledWith(Buffer.from('status'));
    expect(session.resize).toHaveBeenCalledWith(120, 40);
    expect(bridge.isAttachedToTty()).toBe(true);
  });

  it('writes PTY output to stdout and restores terminal state on detach', () => {
    const stdin = new MockStdin();
    const stdout = new MockStdout();
    const bridge = new PtyTerminalBridge({ stdin, stdout });
    const session = {
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
    };
    const stdinBridge = {
      handleData: vi.fn(),
      reset: vi.fn(),
    };

    bridge.attach({
      session,
      stdinBridge: stdinBridge as never,
    });
    stdin.emit('data', Buffer.from('before-detach'));
    stdout.emit('resize');
    bridge.writeOutput('hello');
    bridge.detach();
    stdin.emit('data', Buffer.from('ignored'));
    stdout.emit('resize');

    expect(stdout.write).toHaveBeenCalledWith('hello');
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(stdout.write).toHaveBeenCalledWith(
      '\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?25h\x1b[?1049l',
    );
    expect(stdinBridge.handleData).toHaveBeenCalledTimes(1);
    expect(stdinBridge.handleData).toHaveBeenCalledWith(Buffer.from('before-detach'));
    expect(session.resize).toHaveBeenCalledTimes(1);
  });

  it('calculates bounded initial PTY dimensions from preferred or terminal size', () => {
    const stdout = new MockStdout();
    const bridge = new PtyTerminalBridge({
      stdin: new MockStdin(),
      stdout,
    });

    expect(bridge.getInitialSize()).toEqual({ cols: 120, rows: 40 });
    expect(bridge.getInitialSize(999, 1)).toEqual({ cols: 500, rows: 10 });
  });
});
