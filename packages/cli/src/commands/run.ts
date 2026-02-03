import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { runParallel, checkAuthStatus, addHistory } from '@olympus-dev/core';

interface RunResponse {
  runId: string;
}

interface RunStatus {
  runId: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  prompt: string;
  phase: number;
  phaseName: string;
}

export const runCommand = new Command('run')
  .description('Run parallel AI analysis with Gemini + GPT')
  .argument('<prompt>', 'The prompt to analyze')
  .option('--agent <agent>', 'Use specific agent: gemini, gpt, or both', 'both')
  .option('--pro', 'Use pro models for complex tasks', false)
  .option('--json', 'Output as JSON', false)
  .option('--timeout <ms>', 'Timeout in milliseconds', '120000')
  .option('--gateway <url>', 'Use gateway server instead of direct execution')
  .option('--api-key <key>', 'API key for gateway authentication')
  .action(async (prompt: string, opts) => {
    // If gateway mode, delegate to gateway
    if (opts.gateway) {
      await runViaGateway(prompt, opts);
      return;
    }

    // Direct execution mode (existing behavior)
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

/**
 * Run analysis via Gateway HTTP API
 */
async function runViaGateway(prompt: string, opts: {
  gateway: string;
  apiKey?: string;
  agent: string;
  pro: boolean;
  json: boolean;
  timeout: string;
}) {
  const gatewayUrl = opts.gateway.replace(/\/$/, ''); // Remove trailing slash

  // Load API key from config if not provided
  let apiKey = opts.apiKey;
  if (!apiKey) {
    try {
      const { loadConfig } = await import('@olympus-dev/gateway');
      const config = loadConfig();
      apiKey = config.apiKey;
    } catch {
      console.log(chalk.red('✗ API key required. Use --api-key or ensure ~/.olympus/config.json exists'));
      process.exit(1);
    }
  }

  const agents = opts.agent === 'both' ? ['gemini', 'gpt'] : [opts.agent];

  const spinner = ora({
    text: `Sending request to gateway...`,
  }).start();

  try {
    // Create run via HTTP API
    const response = await fetch(`${gatewayUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        agents: agents as ('gemini' | 'gpt')[],
        usePro: opts.pro,
        timeout: parseInt(opts.timeout),
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error: string; message: string };
      throw new Error(`${error.error}: ${error.message}`);
    }

    const { runId } = await response.json() as RunResponse;
    spinner.text = `Run started: ${chalk.cyan(runId)}`;

    // Poll for completion
    let status: RunStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await fetch(`${gatewayUrl}/api/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to get run status');
      }

      status = await statusResponse.json() as RunStatus;
      spinner.text = `Phase ${status.phase}: ${status.phaseName} (${status.status})`;
    } while (status.status === 'running');

    spinner.stop();

    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    // Display final status
    console.log();
    console.log(chalk.bold.white(`⚡ Olympus Run Complete`));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(`Run ID: ${chalk.cyan(status.runId)}`);
    console.log(`Status: ${status.status === 'completed' ? chalk.green('✓ Completed') : chalk.red(`✗ ${status.status}`)}`);
    console.log(`Final Phase: ${status.phase} (${status.phaseName})`);
    console.log();
    console.log(chalk.dim('Use TUI or Web dashboard for detailed streaming output'));

  } catch (err) {
    spinner.fail('Run failed');
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}
