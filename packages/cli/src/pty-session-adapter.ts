import { chmodSync, accessSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

export interface PtySessionHandle {
  write(data: string): void;
  kill(): void;
  resize(cols: number, rows: number): void;
}

export interface PtySessionStartOptions {
  projectPath: string;
  trustMode: boolean;
  cols: number;
  rows: number;
  onData(data: string): void;
  onExit(event: { exitCode: number }): void;
}

export interface PtySessionAdapterLike {
  startSession(options: PtySessionStartOptions): Promise<PtySessionHandle>;
}

interface NodePtyInstance {
  write(data: string): void;
  kill(): void;
  resize(cols: number, rows: number): void;
  onData(handler: (data: string) => void): { dispose(): void };
  onExit(handler: (event: { exitCode: number }) => void): { dispose(): void };
}

interface PtySessionAdapterDeps {
  ensureSpawnHelperPermissions(): void;
  loadSpawn(): Promise<
    (file: string, args: string[], options: {
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: Record<string, string>;
    }) => NodePtyInstance
  >;
  getTerminalSize(): { cols: number; rows: number } | null;
}

function ensureNodePtySpawnHelperPermissions(): void {
  try {
    const require = createRequire(import.meta.url);
    const ptyPath = dirname(require.resolve('node-pty/package.json'));
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platform = process.platform;
    const helperPath = join(ptyPath, 'prebuilds', `${platform}-${arch}`, 'spawn-helper');

    try {
      accessSync(helperPath, constants.X_OK);
    } catch {
      chmodSync(helperPath, 0o755);
    }
  } catch {
    // Ignore when node-pty layout cannot be resolved at runtime.
  }
}

async function loadNodePtySpawn(): Promise<PtySessionAdapterDeps['loadSpawn'] extends () => Promise<infer T> ? T : never> {
  const ptyModule = await import('node-pty');
  const pty = (ptyModule as Record<string, unknown>).default ?? ptyModule;
  return (pty as { spawn: PtySessionAdapterDeps['loadSpawn'] extends () => Promise<infer T> ? T : never }).spawn;
}

function getProcessTerminalSize(): { cols: number; rows: number } | null {
  if (!process.stdout.isTTY || !process.stdout.columns || !process.stdout.rows) {
    return null;
  }
  return {
    cols: process.stdout.columns,
    rows: process.stdout.rows,
  };
}

const defaultDeps: PtySessionAdapterDeps = {
  ensureSpawnHelperPermissions: ensureNodePtySpawnHelperPermissions,
  loadSpawn: loadNodePtySpawn,
  getTerminalSize: getProcessTerminalSize,
};

export class PtySessionAdapter implements PtySessionAdapterLike {
  constructor(private readonly deps: PtySessionAdapterDeps = defaultDeps) {}

  async startSession(options: PtySessionStartOptions): Promise<PtySessionHandle> {
    this.deps.ensureSpawnHelperPermissions();
    const spawn = await this.deps.loadSpawn();

    const claudeArgs: string[] = [];
    if (options.trustMode) {
      claudeArgs.push('--dangerously-skip-permissions');
    }

    const session = spawn('claude', claudeArgs, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.projectPath,
      env: { ...process.env } as Record<string, string>,
    });

    session.onData(options.onData);
    session.onExit(options.onExit);

    const actualSize = this.deps.getTerminalSize();
    if (actualSize && (actualSize.cols !== options.cols || actualSize.rows !== options.rows)) {
      session.resize(
        Math.max(40, Math.min(500, actualSize.cols)),
        Math.max(10, Math.min(200, actualSize.rows)),
      );
    }

    return session;
  }
}
