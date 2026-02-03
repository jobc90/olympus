import { Command } from 'commander';
import chalk from 'chalk';
import { loadCredentials, saveCredentials, checkAuthStatus } from '@olympus-dev/core';
import { createInterface } from 'readline/promises';

export const authCommand = new Command('auth')
  .description('Configure authentication for AI agents');

authCommand
  .command('gemini')
  .description('Authenticate with Gemini CLI')
  .action(async () => {
    console.log(chalk.bold('🎨 Gemini Authentication'));
    console.log();
    console.log('Gemini uses the Gemini CLI for authentication.');
    console.log('Please ensure Gemini CLI is installed and authenticated:');
    console.log();
    console.log(chalk.cyan('  1. Install: npm i -g @google/gemini-cli'));
    console.log(chalk.cyan('  2. Run: gemini'));
    console.log(chalk.cyan('  3. Complete OAuth in browser'));
    console.log();

    const status = await checkAuthStatus();
    if (status.gemini) {
      console.log(chalk.green('✓ Gemini CLI is installed and available'));
    } else {
      console.log(chalk.red('✗ Gemini CLI not found. Please install it first.'));
    }
  });

authCommand
  .command('openai')
  .description('Configure OpenAI API key')
  .action(async () => {
    console.log(chalk.bold('⚙️  OpenAI Authentication'));
    console.log();

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const apiKey = await rl.question(chalk.cyan('Enter your OpenAI API key: '));
    rl.close();

    if (!apiKey || !apiKey.startsWith('sk-')) {
      console.log(chalk.red('✗ Invalid API key. Must start with "sk-"'));
      return;
    }

    const creds = await loadCredentials();
    creds.openai = { apiKey };
    await saveCredentials(creds);
    console.log(chalk.green('✓ OpenAI API key saved to ~/.olympus/credentials.json'));
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    console.log(chalk.bold('🔑 Authentication Status'));
    console.log();
    const status = await checkAuthStatus();
    for (const [agent, authed] of Object.entries(status)) {
      const icon = authed ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${agent}: ${authed ? 'authenticated' : 'not configured'}`);
    }
  });
