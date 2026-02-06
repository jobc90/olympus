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
import { interactiveCommand } from './commands/interactive.js';
import { serverCommand } from './commands/server.js';
import { modelsCommand } from './commands/models.js';
import { launchClaude } from './claude-wrapper.js';

// Check if running with no arguments (Claude CLI mode)
// argv: [node, script, ...args]
const hasArgs = process.argv.length > 2;
const isHelpOrVersion = process.argv.includes('--help') ||
                        process.argv.includes('-h') ||
                        process.argv.includes('--version') ||
                        process.argv.includes('-V');

if (!hasArgs && !isHelpOrVersion) {
  // No arguments: launch Claude CLI with Olympus branding
  launchClaude().catch((err) => {
    console.error('Failed to start Claude CLI:', err.message);
    process.exit(1);
  });
} else {
  // Has arguments: use commander
  const program = new Command();

  program
    .name('olympus')
    .description('⚡ Olympus - AI-powered development platform')
    .version('0.2.0');

  // Main commands (most common)
  program.addCommand(quickstartCommand); // Quick setup + start
  program.addCommand(setupCommand);      // First-time setup only
  program.addCommand(startCommand);      // Start tmux claude cli
  program.addCommand(serverCommand);     // Server management (gateway + dashboard + telegram)
  program.addCommand(runCommand);        // Run a task
  program.addCommand(interactiveCommand); // Interactive REPL (explicit)

  // Individual services
  program.addCommand(gatewayCommand);
  program.addCommand(telegramCommand);
  program.addCommand(tuiCommand);
  program.addCommand(dashboardCommand);

  // Configuration
  program.addCommand(configCommand);
  program.addCommand(authCommand);
  program.addCommand(modelsCommand);

  // Other
  program.addCommand(patchCommand);

  program.parse();
}
