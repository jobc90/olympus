import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { TmuxWorkerTarget } from './tmux-layout-manager.js';

export interface TmuxSessionStartInput {
  target: TmuxWorkerTarget;
  instructionPath: string;
  launcherPrompt: string;
}

export interface TmuxSessionInput {
  target: TmuxWorkerTarget;
  text: string;
  source: 'local' | 'remote';
  submit?: boolean;
}

export interface TmuxSessionCaptureInput {
  target: TmuxWorkerTarget;
  lines: number;
}

export interface TmuxSessionAdapterLike {
  startSession(input: TmuxSessionStartInput): void | Promise<void>;
  sendInput(input: TmuxSessionInput): void | Promise<void>;
  resetSession(target: TmuxWorkerTarget): void | Promise<void>;
  stopSession(target: TmuxWorkerTarget): void | Promise<void>;
  capturePane(input: TmuxSessionCaptureInput): string | Promise<string>;
}

type CommandRunner = (command: string, args: string[]) => Promise<string>;

const execFile = promisify(execFileCb);

async function defaultCommandRunner(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFile(command, args);
  return stdout.trim();
}

export class TmuxSessionAdapter implements TmuxSessionAdapterLike {
  constructor(private readonly runCommand: CommandRunner = defaultCommandRunner) {}

  async startSession(input: TmuxSessionStartInput): Promise<void> {
    await this.runCommand('tmux', [
      'send-keys',
      '-t',
      input.target.paneId,
      '-l',
      `${input.launcherPrompt}\n${input.instructionPath}`,
    ]);
    await this.runCommand('tmux', [
      'send-keys',
      '-t',
      input.target.paneId,
      'Enter',
    ]);
  }

  async sendInput(input: TmuxSessionInput): Promise<void> {
    await this.runCommand('tmux', [
      'send-keys',
      '-t',
      input.target.paneId,
      '-l',
      input.text,
    ]);
    if (!input.submit) return;
    await this.runCommand('tmux', [
      'send-keys',
      '-t',
      input.target.paneId,
      'Enter',
    ]);
  }

  async resetSession(target: TmuxWorkerTarget): Promise<void> {
    await this.runCommand('tmux', [
      'send-keys',
      '-t',
      target.paneId,
      'C-c',
    ]);
  }

  async stopSession(target: TmuxWorkerTarget): Promise<void> {
    await this.runCommand('tmux', [
      'send-keys',
      '-t',
      target.paneId,
      'C-c',
    ]);
  }

  async capturePane(input: TmuxSessionCaptureInput): Promise<string> {
    return this.runCommand('tmux', [
      'capture-pane',
      '-p',
      '-t',
      input.target.paneId,
      '-S',
      `-${input.lines}`,
    ]);
  }
}
