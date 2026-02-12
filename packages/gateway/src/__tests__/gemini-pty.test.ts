import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock spawn ──

const mockStdin = { write: vi.fn(), end: vi.fn() };
const mockStdoutListeners = new Map<string, (data: Buffer) => void>();
const mockStderrListeners = new Map<string, (data: Buffer) => void>();
const mockProcessListeners = new Map<string, (...args: unknown[]) => void>();

const mockProcess = {
  stdin: mockStdin,
  stdout: { on: vi.fn((event: string, cb: (data: Buffer) => void) => { mockStdoutListeners.set(event, cb); }) },
  stderr: { on: vi.fn((event: string, cb: (data: Buffer) => void) => { mockStderrListeners.set(event, cb); }) },
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { mockProcessListeners.set(event, cb); }),
  kill: vi.fn(),
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => mockProcess),
}));

import { GeminiPty } from '../gemini-pty.js';

describe('GeminiPty', () => {
  let pty: GeminiPty;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStdoutListeners.clear();
    mockStderrListeners.clear();
    mockProcessListeners.clear();
    pty = new GeminiPty('gemini-3-flash-preview');
  });

  afterEach(async () => {
    await pty.stop();
  });

  describe('constructor', () => {
    it('기본 모델 설정', () => {
      const p = new GeminiPty();
      expect(p).toBeInstanceOf(GeminiPty);
    });

    it('커스텀 모델 설정', () => {
      const p = new GeminiPty('gemini-2.5-pro');
      expect(p).toBeInstanceOf(GeminiPty);
    });
  });

  describe('start (spawn fallback)', () => {
    it('node-pty 없으면 spawn 폴백으로 alive/ready', async () => {
      await pty.start();
      expect(pty.isAlive()).toBe(true);
    });
  });

  describe('stop', () => {
    it('alive=false', async () => {
      await pty.start();
      expect(pty.isAlive()).toBe(true);

      await pty.stop();
      expect(pty.isAlive()).toBe(false);
    });
  });

  describe('isAlive', () => {
    it('시작 전 false', () => {
      expect(pty.isAlive()).toBe(false);
    });

    it('시작 후 true', async () => {
      await pty.start();
      expect(pty.isAlive()).toBe(true);
    });
  });

  describe('sendPrompt (spawn mode)', () => {
    it('spawn 프로세스로 프롬프트 전송 + close 결과 반환', async () => {
      await pty.start();
      const { spawn } = await import('node:child_process');

      const resultPromise = pty.sendPrompt('test prompt', 5000);

      // stdout 데이터 전송
      const stdoutCb = mockStdoutListeners.get('data');
      if (stdoutCb) stdoutCb(Buffer.from('{"answer": "hello"}'));

      // close 이벤트
      const closeCb = mockProcessListeners.get('close');
      if (closeCb) closeCb(0);

      const result = await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--approval-mode', 'yolo', '--model', 'gemini-3-flash-preview']),
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      );
      expect(mockStdin.write).toHaveBeenCalledWith('test prompt');
      expect(mockStdin.end).toHaveBeenCalled();
      expect(result).toContain('answer');
    });

    it('spawn 에러 시 reject', async () => {
      await pty.start();

      const resultPromise = pty.sendPrompt('test', 5000);

      // error 이벤트
      const errorCb = mockProcessListeners.get('error');
      if (errorCb) errorCb(new Error('spawn ENOENT'));

      await expect(resultPromise).rejects.toThrow('spawn ENOENT');
    });

    it('타임아웃 시 현재 버퍼 반환 + kill', async () => {
      vi.useFakeTimers();
      await pty.start();

      const resultPromise = pty.sendPrompt('test', 100);

      // stdout 일부 데이터
      const stdoutCb = mockStdoutListeners.get('data');
      if (stdoutCb) stdoutCb(Buffer.from('partial'));

      // 타임아웃 발동
      vi.advanceTimersByTime(150);

      const result = await resultPromise;
      expect(result).toBe('partial');
      expect(mockProcess.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
