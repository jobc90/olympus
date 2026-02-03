import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '@olympus-dev/core';

export const dashboardCommand = new Command('dashboard')
  .alias('ui')
  .description('Launch the Olympus web dashboard')
  .option('-p, --port <port>', 'Port number', '4200')
  .action(async (opts) => {
    const config = await loadConfig();
    const port = parseInt(opts.port) || config.webPort;

    console.log(chalk.bold('🌐 Olympus Dashboard'));
    console.log();
    console.log(chalk.yellow('⚠ Web dashboard will be available in v0.2'));
    console.log(chalk.dim(`  Planned: http://localhost:${port}`));
    console.log();
    console.log('For now, use CLI commands:');
    console.log(chalk.cyan('  olympus run "your prompt"'));
    console.log(chalk.cyan('  olympus patch "your instructions"'));
    console.log(chalk.cyan('  olympus auth status'));
  });
