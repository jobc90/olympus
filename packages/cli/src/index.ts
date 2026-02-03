import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { patchCommand } from './commands/patch.js';
import { authCommand } from './commands/auth.js';
import { configCommand } from './commands/config.js';
import { dashboardCommand } from './commands/dashboard.js';

const program = new Command();

program
  .name('olympus')
  .description('⚡ Olympus - AI-powered development platform')
  .version('0.1.0');

program.addCommand(runCommand);
program.addCommand(patchCommand);
program.addCommand(authCommand);
program.addCommand(configCommand);
program.addCommand(dashboardCommand);

program.parse();
