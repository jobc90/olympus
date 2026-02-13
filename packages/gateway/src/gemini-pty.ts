/**
 * GeminiPty — Gemini CLI PTY/spawn 프로세스 관리
 *
 * node-pty 동적 import → 실패 시 child_process.spawn 폴백 (one-shot 모드)
 * PtyWorker(cli/src/pty-worker.ts)의 완료 감지 패턴 차용.
 */
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';

/** ANSI escape sequence 제거 (간단한 정규식) */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07)/g, '');
}

const SETTLE_MS = 3_000;        // 3초 무활동 → 완료
const INIT_SETTLE_MS = 3_000;   // 초기화: 3초 무출력 → ready
const INIT_MAX_MS = 15_000;     // 초기화: 최대 15초 대기
const DEFAULT_TIMEOUT_MS = 60_000; // 1분 타임아웃
const MAX_RESTARTS = 3;

interface PendingRequest {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  settleTimer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout>;
}

export class GeminiPty extends EventEmitter {
  private pty: unknown = null; // IPty from node-pty
  private buffer = '';
  private pending: PendingRequest | null = null;
  private ready = false;
  private alive = false;
  private model: string;
  private restartCount = 0;
  private usePty = false;
  private nodePtyModule: unknown = null;

  constructor(model?: string) {
    super();
    this.model = model ?? 'gemini-3-flash-preview';
  }

  async start(): Promise<void> {
    // Try node-pty dynamic import (optional dependency)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.nodePtyModule = await (Function('return import("node-pty")')() as Promise<unknown>);
      this.usePty = true;
    } catch {
      this.usePty = false;
    }

    if (this.usePty) {
      await this.startPty();
    } else {
      // spawn 폴백: one-shot 모드이므로 start는 noop, sendPrompt에서 개별 spawn
      this.alive = true;
      this.ready = true;
    }
  }

  private async startPty(): Promise<void> {
    const ptyMod = this.nodePtyModule as { spawn: (file: string, args: string[], options: Record<string, unknown>) => unknown };
    const pty = ptyMod.spawn('gemini', [
      '--sandbox',
      '--model', this.model,
    ], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
    }) as { onData: (cb: (data: string) => void) => void; onExit: (cb: (e: { exitCode: number }) => void) => void; write: (data: string) => void; kill: () => void; pid: number };

    this.pty = pty;
    this.alive = true;
    this.buffer = '';

    // Track initialization phase: discard startup noise, detect when ready
    let lastInitDataAt = 0;

    pty.onData((data: string) => {
      if (!this.ready) {
        // Init phase: track timing but discard output (MCP loading, skill conflicts, etc.)
        lastInitDataAt = Date.now();
        return;
      }
      this.onPtyData(data);
    });

    pty.onExit((_e: { exitCode: number }) => {
      this.alive = false;
      this.ready = false;
      this.emit('exit');

      // pending 요청이 있으면 현재 버퍼 반환
      if (this.pending) {
        const { resolve, settleTimer, timeoutTimer } = this.pending;
        if (settleTimer) clearTimeout(settleTimer);
        clearTimeout(timeoutTimer);
        resolve(stripAnsi(this.buffer).trim());
        this.pending = null;
        this.buffer = '';
      }

      // crash recovery
      if (this.restartCount < MAX_RESTARTS) {
        this.restartCount++;
        setTimeout(() => this.startPty().catch(() => {}), 2000);
      }
    });

    // Wait for Gemini CLI initialization to settle
    // (MCP servers, skills, credentials loading takes 5-10s)
    await new Promise<void>((resolve) => {
      const maxTimer = setTimeout(() => {
        this.ready = true;
        clearInterval(check);
        resolve();
      }, INIT_MAX_MS);

      const check = setInterval(() => {
        if (lastInitDataAt > 0 && Date.now() - lastInitDataAt >= INIT_SETTLE_MS) {
          clearInterval(check);
          clearTimeout(maxTimer);
          this.ready = true;
          resolve();
        }
      }, 500);
    });
  }

  private onPtyData(data: string): void {
    if (!this.pending) return;

    this.buffer += data;

    // settle 타이머 리셋
    const { settleTimer } = this.pending;
    if (settleTimer) clearTimeout(settleTimer);

    this.pending.settleTimer = setTimeout(() => {
      // 3초 무활동 → 완료
      if (this.pending) {
        const { resolve, timeoutTimer } = this.pending;
        clearTimeout(timeoutTimer);
        resolve(stripAnsi(this.buffer).trim());
        this.pending = null;
        this.buffer = '';
      }
    }, SETTLE_MS);
  }

  async stop(): Promise<void> {
    this.alive = false;
    this.ready = false;

    // pending 요청 reject
    if (this.pending) {
      const { reject, settleTimer, timeoutTimer } = this.pending;
      if (settleTimer) clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      reject(new Error('GeminiPty stopped'));
      this.pending = null;
    }

    if (this.usePty && this.pty) {
      try {
        (this.pty as { kill: () => void }).kill();
      } catch { /* ignore */ }
      this.pty = null;
    }
  }

  isAlive(): boolean {
    return this.alive;
  }

  /**
   * 프롬프트 전송 → 완료 대기 → 결과 반환
   * PTY 모드: 상주 프로세스에 입력
   * spawn 폴백: 개별 프로세스 실행
   */
  async sendPrompt(prompt: string, timeoutMs?: number): Promise<string> {
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (this.usePty) {
      return this.sendPromptPty(prompt, timeout);
    }
    return this.sendPromptSpawn(prompt, timeout);
  }

  private sendPromptPty(prompt: string, timeoutMs: number): Promise<string> {
    if (!this.alive || !this.ready) {
      return Promise.reject(new Error('GeminiPty not ready'));
    }
    if (this.pending) {
      return Promise.reject(new Error('GeminiPty busy'));
    }

    return new Promise((resolve, reject) => {
      this.buffer = '';

      const timeoutTimer = setTimeout(() => {
        if (this.pending) {
          const { settleTimer } = this.pending;
          if (settleTimer) clearTimeout(settleTimer);
          // 타임아웃 시 현재 버퍼 반환 (부분 결과)
          resolve(stripAnsi(this.buffer).trim());
          this.pending = null;
          this.buffer = '';
        }
      }, timeoutMs);

      this.pending = { resolve, reject, settleTimer: null, timeoutTimer };

      // 프롬프트 전송
      const pty = this.pty as { write: (data: string) => void };
      pty.write(prompt);
      setTimeout(() => pty.write('\r'), 150);
    });
  }

  private sendPromptSpawn(prompt: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let settled = false;

      // -p '' enables headless mode; actual prompt comes from stdin
      const gemini: ChildProcess = spawn('gemini', [
        '-p', '',
        '--approval-mode', 'yolo',
        '--model', this.model,
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          gemini.kill();
          resolve(stripAnsi(stdout).trim());
        }
      }, timeoutMs);

      gemini.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      // stderr is ignored (contains startup noise: MCP loading, skill conflicts, etc.)

      gemini.on('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(stripAnsi(stdout).trim());
        }
      });

      gemini.on('error', (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      gemini.stdin?.write(prompt);
      gemini.stdin?.end();
    });
  }
}
