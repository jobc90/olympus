import { describe, expect, it, vi } from 'vitest';
import { PtyStdinBridge } from '../pty-stdin-bridge.js';

describe('PtyStdinBridge', () => {
  it('forwards decoded input and normalizes enter to carriage return', () => {
    const writeToPty = vi.fn();
    const handleLocalInput = vi.fn();
    const exitWorker = vi.fn();
    const bridge = new PtyStdinBridge({
      writeToPty,
      handleLocalInput,
      exitWorker,
    });

    bridge.handleData(Buffer.from('git status\n'));

    expect(writeToPty).toHaveBeenCalledWith('git status\r');
    expect(handleLocalInput).toHaveBeenCalledWith('git status\n');
    expect(exitWorker).not.toHaveBeenCalled();
  });

  it('exits the worker on Ctrl+C without forwarding input', () => {
    const writeToPty = vi.fn();
    const handleLocalInput = vi.fn();
    const exitWorker = vi.fn();
    const bridge = new PtyStdinBridge({
      writeToPty,
      handleLocalInput,
      exitWorker,
    });

    bridge.handleData(Buffer.from([0x03]));

    expect(exitWorker).toHaveBeenCalledTimes(1);
    expect(writeToPty).not.toHaveBeenCalled();
    expect(handleLocalInput).not.toHaveBeenCalled();
  });

  it('exits the worker on Ctrl+] without forwarding input', () => {
    const writeToPty = vi.fn();
    const handleLocalInput = vi.fn();
    const exitWorker = vi.fn();
    const bridge = new PtyStdinBridge({
      writeToPty,
      handleLocalInput,
      exitWorker,
    });

    bridge.handleData(Buffer.from([0x1d]));

    expect(exitWorker).toHaveBeenCalledTimes(1);
    expect(writeToPty).not.toHaveBeenCalled();
    expect(handleLocalInput).not.toHaveBeenCalled();
  });

  it('resets its decoder state', () => {
    const bridge = new PtyStdinBridge({
      writeToPty: vi.fn(),
      handleLocalInput: vi.fn(),
      exitWorker: vi.fn(),
    });

    bridge.handleData(Buffer.from([0xed, 0x95]));
    bridge.reset();

    expect(() => bridge.handleData(Buffer.from([0x9c]))).not.toThrow();
  });
});
