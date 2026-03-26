import { execFile as execFileCb, spawn as spawnCb } from 'node:child_process';
import { promisify } from 'node:util';

export interface NativeTerminalLaunchInput {
  projectId: string;
  workerId: string;
  sessionName: string;
  paneId: string;
}

export interface NativeTerminalLaunchResult {
  platform: string;
  terminal: string;
}

export interface NativeTerminalLauncherLike {
  launch(input: NativeTerminalLaunchInput): NativeTerminalLaunchResult | Promise<NativeTerminalLaunchResult>;
}

type CommandRunner = (command: string, args: string[]) => Promise<string>;
type SpawnRunner = (command: string, args: string[]) => Promise<void>;
type InteractiveTerminalDetector = () => boolean;

const execFile = promisify(execFileCb);

async function defaultCommandRunner(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFile(command, args);
  return stdout.trim();
}

async function defaultSpawnRunner(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnCb(command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export class NativeTerminalLauncher implements NativeTerminalLauncherLike {
  constructor(
    private readonly runCommand: CommandRunner = defaultCommandRunner,
    private readonly platform = process.platform,
    private readonly spawnProcess: SpawnRunner = defaultSpawnRunner,
    private readonly isInteractiveTerminal: InteractiveTerminalDetector = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ) {}

  async launch(input: NativeTerminalLaunchInput): Promise<NativeTerminalLaunchResult> {
    if (this.platform !== 'darwin') {
      throw new Error(`tmux attach launcher is only supported on macOS: ${this.platform}`);
    }

    if (this.isInteractiveTerminal()) {
      await this.spawnProcess('tmux', [
        'attach-session',
        '-t',
        `=${input.sessionName}`,
      ]);

      return {
        platform: this.platform,
        terminal: 'current-terminal',
      };
    }

    await this.runCommand('osascript', [
      '-e',
      `tell application "Terminal" to do script "tmux attach-session -t '=${input.sessionName}'"`,
      '-e',
      'tell application "Terminal" to activate',
    ]);

    return {
      platform: this.platform,
      terminal: 'tmux-attach',
    };
  }
}
