import { describe, expect, it } from 'vitest';
import { supportsWorkerRuntimeControl } from '../worker.js';

describe('worker runtime capabilities', () => {
  it('treats tmux and pty workers as runtime-control capable', () => {
    expect(supportsWorkerRuntimeControl({ runtimeKind: 'tmux' })).toBe(true);
    expect(supportsWorkerRuntimeControl({ runtimeKind: 'pty' })).toBe(true);
  });

  it('treats missing runtime kinds as not runtime-control capable', () => {
    expect(supportsWorkerRuntimeControl({})).toBe(false);
  });
});
