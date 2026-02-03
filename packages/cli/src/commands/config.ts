import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '@olympus-dev/core';

export const configCommand = new Command('config')
  .description('View and modify Olympus configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const config = await loadConfig();
    console.log(chalk.bold('⚙️  Olympus Configuration'));
    console.log();
    console.log(JSON.stringify(config, null, 2));
  });

configCommand
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Config key (dot notation)')
  .argument('<value>', 'Config value')
  .action(async (key: string, value: string) => {
    // Simple dot notation set
    const parts = key.split('.');
    const update: Record<string, unknown> = {};
    let current = update;
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    // Try to parse as JSON, fallback to string
    try {
      current[parts[parts.length - 1]] = JSON.parse(value);
    } catch {
      current[parts[parts.length - 1]] = value;
    }
    await saveConfig(update as never);
    console.log(chalk.green(`✓ Set ${key} = ${value}`));
  });

configCommand
  .command('path')
  .description('Show config directory path')
  .action(async () => {
    const config = await loadConfig();
    console.log(config.configDir);
  });
