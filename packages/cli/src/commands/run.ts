import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { runParallel, checkAuthStatus, addHistory } from '@olympus-dev/core';

export const runCommand = new Command('run')
  .description('Run parallel AI analysis with Gemini + GPT')
  .argument('<prompt>', 'The prompt to analyze')
  .option('--agent <agent>', 'Use specific agent: gemini, gpt, or both', 'both')
  .option('--pro', 'Use pro models for complex tasks', false)
  .option('--json', 'Output as JSON', false)
  .option('--timeout <ms>', 'Timeout in milliseconds', '120000')
  .action(async (prompt: string, opts) => {
    // Check auth
    const authStatus = await checkAuthStatus();
    const agents = opts.agent === 'both' ? ['gemini', 'gpt'] as const : [opts.agent as 'gemini' | 'gpt'];

    for (const agent of agents) {
      if (!authStatus[agent]) {
        console.log(chalk.yellow(`⚠ ${agent} not authenticated. Run: olympus auth ${agent}`));
      }
    }

    const availableAgents = agents.filter(a => authStatus[a]);
    if (availableAgents.length === 0) {
      console.log(chalk.red('✗ No authenticated agents. Run: olympus auth gemini or olympus auth openai'));
      process.exit(1);
    }

    const spinner = ora({
      text: `Analyzing with ${availableAgents.map(a => chalk.cyan(a)).join(' + ')}...`,
    }).start();

    try {
      const result = await runParallel({
        prompt,
        agents: availableAgents as ('gemini' | 'gpt')[],
        usePro: opts.pro,
        timeout: parseInt(opts.timeout),
      });

      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Display results
      console.log();
      console.log(chalk.bold.white(`⚡ Olympus Analysis Results`));
      console.log(chalk.dim('─'.repeat(60)));

      if (result.gemini) {
        console.log();
        console.log(chalk.bold.blue('🎨 Gemini') + chalk.dim(` (${result.gemini.model}, ${result.gemini.durationMs}ms)`));
        console.log(chalk.dim('─'.repeat(40)));
        if (result.gemini.success) {
          console.log(result.gemini.output);
        } else {
          console.log(chalk.red(`Error: ${result.gemini.error}`));
        }
      }

      if (result.gpt) {
        console.log();
        console.log(chalk.bold.green('⚙️  GPT') + chalk.dim(` (${result.gpt.model}, ${result.gpt.durationMs}ms)`));
        console.log(chalk.dim('─'.repeat(40)));
        if (result.gpt.success) {
          console.log(result.gpt.output);
        } else {
          console.log(chalk.red(`Error: ${result.gpt.error}`));
        }
      }

      console.log();
      console.log(chalk.dim(`Total: ${result.durationMs}ms`));

      // Save to history
      await addHistory(prompt, result);
    } catch (err) {
      spinner.fail('Analysis failed');
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });
