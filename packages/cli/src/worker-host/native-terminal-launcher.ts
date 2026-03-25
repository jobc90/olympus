import { execFile as execFileCb } from 'node:child_process';
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

const execFile = promisify(execFileCb);

async function defaultCommandRunner(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFile(command, args);
  return stdout.trim();
}

export class NativeTerminalLauncher implements NativeTerminalLauncherLike {
  constructor(
    private readonly runCommand: CommandRunner = defaultCommandRunner,
    private readonly platform = process.platform,
  ) {}

  async launch(input: NativeTerminalLaunchInput): Promise<NativeTerminalLaunchResult> {
    if (this.platform !== 'darwin') {
      throw new Error(`tmux attach launcher is only supported on macOS: ${this.platform}`);
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
