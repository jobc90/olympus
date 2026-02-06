import { Command } from 'commander';
import chalk from 'chalk';
import {
  type ModelPrefs,
  extractMcpModels,
  getCoreModelPrefs,
  mergePrefs,
  readMcpCredentials,
  syncModelPrefs,
} from '../model-sync.js';

function printPrefs(title: string, prefs: ModelPrefs): void {
  console.log(chalk.bold(title));
  console.log(`  geminiFlash:       ${prefs.geminiFlash ?? '-'}`);
  console.log(`  geminiPro:         ${prefs.geminiPro ?? '-'}`);
  console.log(`  geminiFallbackFlash:${prefs.geminiFallbackFlash ?? '-'}`);
  console.log(`  geminiFallbackPro: ${prefs.geminiFallbackPro ?? '-'}`);
  console.log(`  codex:             ${prefs.codex ?? '-'}`);
}

export const modelsCommand = new Command('models')
  .description('Manage runtime model preferences and sync core + MCP settings');

modelsCommand
  .command('show')
  .description('Show model preferences from core config and MCP credentials')
  .action(async () => {
    const corePrefs = await getCoreModelPrefs();
    const mcpPrefs = extractMcpModels(readMcpCredentials());
    const effective = mergePrefs(corePrefs, mcpPrefs);

    console.log(chalk.cyan.bold('\n⚙️  Olympus Models\n'));
    printPrefs('Core (~/.olympus/config.json)', corePrefs);
    console.log();
    printPrefs('MCP (~/.claude/mcps/ai-agents/credentials.json)', mcpPrefs);
    console.log();
    printPrefs('Effective (core priority, then MCP fallback)', effective);
    console.log();
  });

modelsCommand
  .command('set')
  .description('Set model preferences and sync to both core and MCP')
  .option('--gemini <model>', 'Gemini default/flash model')
  .option('--gemini-pro <model>', 'Gemini pro model')
  .option('--gemini-fallback <model>', 'Gemini fallback default model')
  .option('--gemini-fallback-pro <model>', 'Gemini fallback pro model')
  .option('--codex <model>', 'Codex model')
  .action(async (opts) => {
    const target: ModelPrefs = {
      geminiFlash: opts.gemini,
      geminiPro: opts.geminiPro,
      geminiFallbackFlash: opts.geminiFallback,
      geminiFallbackPro: opts.geminiFallbackPro,
      codex: opts.codex,
    };

    if (!Object.values(target).some(Boolean)) {
      console.log(chalk.yellow('No model options provided. Use --help to see flags.'));
      return;
    }

    await syncModelPrefs(target);
    console.log(chalk.green('✓ Model preferences updated and synced to core + MCP'));
  });

modelsCommand
  .command('sync')
  .description('Sync existing preferences between core and MCP (core as source of truth)')
  .action(async () => {
    const corePrefs = await getCoreModelPrefs();
    await syncModelPrefs(corePrefs);
    console.log(chalk.green('✓ Synced core model preferences to MCP credentials'));
  });
