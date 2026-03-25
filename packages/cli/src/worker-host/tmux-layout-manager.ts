import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

export interface TmuxWorkerTarget {
  projectId: string;
  workerId: string;
  sessionName: string;
  windowName: string;
  paneId: string;
  mode: 'resident' | 'ephemeral';
}

export interface ReserveTmuxTargetInput {
  projectId: string;
  workerId: string;
  mode: 'resident' | 'ephemeral';
  projectPath?: string;
  command?: string[];
}

export interface TmuxLayoutManagerLike {
  reserveTarget(input: ReserveTmuxTargetInput): TmuxWorkerTarget | Promise<TmuxWorkerTarget>;
  releaseTarget(target: TmuxWorkerTarget): void | Promise<void>;
}

type CommandRunner = (command: string, args: string[]) => Promise<string>;

const execFile = promisify(execFileCb);

async function defaultCommandRunner(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFile(command, args);
  return stdout.trim();
}

function isDuplicateSessionError(error: unknown): boolean {
  return error instanceof Error && /duplicate session/i.test(error.message);
}

export class TmuxLayoutManager implements TmuxLayoutManagerLike {
  constructor(private readonly runCommand: CommandRunner = defaultCommandRunner) {}

  buildTarget(input: ReserveTmuxTargetInput): TmuxWorkerTarget {
    return {
      projectId: input.projectId,
      workerId: input.workerId,
      sessionName: `olympus_${input.projectId}`,
      windowName: input.workerId,
      paneId: '',
      mode: input.mode,
    };
  }

  async reserveTarget(input: ReserveTmuxTargetInput): Promise<TmuxWorkerTarget> {
    const target = this.buildTarget(input);
    const paneIdArgs = ['-P', '-F', '#{pane_id}'];
    const workingDirectoryArgs = input.projectPath ? ['-c', input.projectPath] : [];
    const commandArgs = input.command ?? [];
    const createWindow = async (): Promise<string> => this.runCommand('tmux', [
      'new-window',
      '-d',
      '-t',
      target.sessionName,
      '-n',
      target.windowName,
      ...workingDirectoryArgs,
      ...paneIdArgs,
      ...commandArgs,
    ]);

    try {
      await this.runCommand('tmux', ['has-session', '-t', target.sessionName]);
      const paneId = await createWindow();
      return {
        ...target,
        paneId,
      };
    } catch {
      let paneId: string;
      try {
        paneId = await this.runCommand('tmux', [
          'new-session',
          '-d',
          '-s',
          target.sessionName,
          '-n',
          target.windowName,
          ...workingDirectoryArgs,
          ...paneIdArgs,
          ...commandArgs,
        ]);
      } catch (error) {
        if (!isDuplicateSessionError(error)) {
          throw error;
        }
        paneId = await createWindow();
      }
      return {
        ...target,
        paneId,
      };
    }
  }

  async releaseTarget(target: TmuxWorkerTarget): Promise<void> {
    if (target.mode === 'resident') return;
    await this.runCommand('tmux', [
      'kill-window',
      '-t',
      `${target.sessionName}:${target.windowName}`,
    ]);
  }
}
