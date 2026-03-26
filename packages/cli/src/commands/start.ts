import { Command } from 'commander';
import {
  resolveRuntimeSocketsRoot,
  resolveWorkerRuntimeKind,
  selectPendingTaskForWorker,
  startWorker,
} from '../worker-bootstrap.js';

export {
  resolveRuntimeSocketsRoot,
  resolveWorkerRuntimeKind,
  selectPendingTaskForWorker,
} from '../worker-bootstrap.js';

export const startCommand = new Command('start')
  .description('Start Olympus Worker daemon (tmux by default, pty fallback)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-r, --runtime <runtime>', 'Worker runtime: tmux or pty', 'tmux')
  .action((opts) => startWorker(opts, false));

export const startTrustCommand = new Command('start-trust')
  .description('Start Olympus Worker in trust mode (tmux by default, pty fallback)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-r, --runtime <runtime>', 'Worker runtime: tmux or pty', 'tmux')
  .action((opts) => startWorker(opts, true));
