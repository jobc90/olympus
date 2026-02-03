import { Command } from 'commander';
import { startRepl } from '../repl/index.js';

export const interactiveCommand = new Command('interactive')
  .description('Start interactive REPL mode (also triggered by running olympus with no arguments)')
  .alias('i')
  .action(async () => {
    await startRepl();
  });

/**
 * Launch interactive REPL directly (bypassing commander)
 */
export async function launchInteractive(): Promise<void> {
  await startRepl();
}
