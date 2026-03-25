import type { PtySessionHandle } from './pty-session-adapter.js';
import type { PtyStdinBridge } from './pty-stdin-bridge.js';

export interface PtyTerminalBridgeStdin {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode(mode: boolean): void;
  resume(): void;
  on(event: 'data', listener: (data: Buffer) => void): void;
  removeListener(event: 'data', listener: (data: Buffer) => void): void;
}

export interface PtyTerminalBridgeStdout {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(data: string): void;
  on(event: 'resize', listener: () => void): void;
  removeListener(event: 'resize', listener: () => void): void;
}

export interface PtyTerminalBridgeOptions {
  stdin?: PtyTerminalBridgeStdin;
  stdout?: PtyTerminalBridgeStdout;
}

export interface PtyTerminalBridgeAttachInput {
  session: PtySessionHandle;
  stdinBridge: PtyStdinBridge;
}

export class PtyTerminalBridge {
  private readonly stdin: PtyTerminalBridgeStdin;

  private readonly stdout: PtyTerminalBridgeStdout;

  private stdinHandler: ((data: Buffer) => void) | null = null;

  private resizeHandler: (() => void) | null = null;

  private originalRawMode: boolean | undefined;

  private ttyAttached = false;

  constructor(options: PtyTerminalBridgeOptions = {}) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
  }

  getInitialSize(preferredCols?: number, preferredRows?: number): { cols: number; rows: number } {
    return {
      cols: Math.max(40, Math.min(500, preferredCols ?? this.stdout.columns ?? 220)),
      rows: Math.max(10, Math.min(200, preferredRows ?? this.stdout.rows ?? 50)),
    };
  }

  attach(input: PtyTerminalBridgeAttachInput): void {
    if (this.stdout.isTTY) {
      this.ttyAttached = true;
    }

    if (this.stdin.isTTY) {
      this.originalRawMode = this.stdin.isRaw;
      this.stdin.setRawMode(true);
      this.stdin.resume();

      this.stdinHandler = (data: Buffer) => {
        input.stdinBridge.handleData(data);
      };
      this.stdin.on('data', this.stdinHandler);
    }

    this.resizeHandler = () => {
      if (this.stdout.columns && this.stdout.rows) {
        input.session.resize(this.stdout.columns, this.stdout.rows);
      }
    };
    this.stdout.on('resize', this.resizeHandler);
  }

  writeOutput(data: string): void {
    this.stdout.write(data);
  }

  isAttachedToTty(): boolean {
    return this.ttyAttached;
  }

  detach(): void {
    if (this.stdinHandler) {
      this.stdin.removeListener('data', this.stdinHandler);
      this.stdinHandler = null;
    }

    if (this.stdin.isTTY && this.originalRawMode !== undefined) {
      try {
        this.stdin.setRawMode(this.originalRawMode);
      } catch {
        // stdin may already be destroyed
      }
    }

    if (this.resizeHandler) {
      this.stdout.removeListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.ttyAttached) {
      this.stdout.write(
        '\x1b[?1006l'
        + '\x1b[?1002l'
        + '\x1b[?1000l'
        + '\x1b[?25h'
        + '\x1b[?1049l',
      );
      this.ttyAttached = false;
    }
  }
}
