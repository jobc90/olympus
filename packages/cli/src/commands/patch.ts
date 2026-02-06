import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { runParallel, addHistory } from '@olympus-dev/core';

export const patchCommand = new Command('patch')
  .description('Get code patch suggestions from AI agents')
  .argument('<instructions>', 'Patch instructions')
  .option('--context <file>', 'Context file path')
  .option('--pro', 'Use pro models', false)
  .action(async (instructions: string, opts) => {
    let context = '';
    if (opts.context) {
      const { readFile } = await import('fs/promises');
      try {
        context = await readFile(opts.context, 'utf-8');
      } catch {
        console.log(chalk.yellow(`⚠ Could not read context file: ${opts.context}`));
      }
    }

    const patchPrompt = `You are a code modification assistant. Given the following instructions, provide a unified diff patch.

Instructions: ${instructions}
${context ? `\nContext:\n${context}` : ''}

Respond with ONLY the code changes in unified diff format.`;

    const spinner = ora('Collecting patch suggestions...').start();

    try {
      const result = await runParallel({
        prompt: patchPrompt,
        usePro: opts.pro,
      });

      spinner.stop();

      console.log();
      console.log(chalk.bold.white('⚡ Patch Suggestions'));
      console.log(chalk.dim('═'.repeat(60)));

      if (result.gemini?.success) {
        console.log();
        console.log(chalk.bold.blue('🎨 Gemini Patch:'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(result.gemini.output);
      }

      const codexResult = result.codex ?? result.gpt;
      if (codexResult?.success) {
        console.log();
        console.log(chalk.bold.green('⚙️  Codex Patch:'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(codexResult.output);
      }

      await addHistory(`patch: ${instructions}`, result);
    } catch (err) {
      spinner.fail('Patch collection failed');
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });
