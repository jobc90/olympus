import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { patchCommand } from './commands/patch.js';
import { authCommand } from './commands/auth.js';
import { configCommand } from './commands/config.js';
import { dashboardCommand } from './commands/dashboard.js';
import { gatewayCommand } from './commands/gateway.js';
import { tuiCommand } from './commands/tui.js';
import { telegramCommand } from './commands/telegram.js';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';
import { quickstartCommand } from './commands/quickstart.js';

const program = new Command();

program
  .name('olympus')
  .description('⚡ Olympus - AI-powered development platform')
  .version('0.2.0');

// Main commands (most common)
program.addCommand(quickstartCommand); // Quick setup + start
program.addCommand(setupCommand);      // First-time setup only
program.addCommand(startCommand);      // Start everything
program.addCommand(runCommand);        // Run a task

// Individual services
program.addCommand(gatewayCommand);
program.addCommand(telegramCommand);
program.addCommand(tuiCommand);
program.addCommand(dashboardCommand);

// Configuration
program.addCommand(configCommand);
program.addCommand(authCommand);

// Other
program.addCommand(patchCommand);

program.parse();
