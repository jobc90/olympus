import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';

async function startAction(opts: Record<string, unknown>, forceTrust: boolean): Promise<void> {
  const projectPath = resolve(opts.project as string);

  console.log(chalk.cyan.bold('\n⚡ Olympus Start\n'));

  // Check if Claude CLI is installed
  const { execSync } = await import('child_process');
  let agentBinary = '';
  let agentName = '';
  try {
    execSync('which claude', { stdio: 'pipe' });
    agentBinary = 'claude';
    agentName = 'Claude CLI';
  } catch {
    console.log(chalk.red('❌ Claude CLI가 설치되어 있지 않습니다.'));
    console.log(chalk.gray('   설치: npm install -g @anthropic-ai/claude-code'));
    process.exit(1);
  }

  const trustMode = forceTrust;

  console.log(chalk.white('Starting:'));
  console.log(chalk.green(`  ✓ ${agentName}${trustMode ? ' (trust mode)' : ''}`));
  console.log(chalk.gray(`  ✓ Project: ${projectPath}`));
  if (trustMode) {
    console.log(chalk.yellow(`  ⚠ Trust mode: 권한 확인 없이 실행됩니다`));
  }
  console.log();

  try {
    const { spawn } = await import('child_process');

    // Get agent path
    const agentPath = execSync(`which ${agentBinary}`, { encoding: 'utf-8' }).trim();

    // Build args
    const args: string[] = [];
    if (trustMode) {
      args.push('--dangerously-skip-permissions');
    }

    console.log(chalk.cyan.bold(`✅ ${agentName} 시작!\n`));

    // Spawn Claude CLI in foreground with inherited stdio
    const child = spawn(agentPath, args, {
      stdio: 'inherit',
      cwd: projectPath,
    });

    child.on('close', (code) => {
      console.log(chalk.yellow(`\n${agentName} 종료됨 (code: ${code ?? 0})`));
      process.exit(code ?? 0);
    });

    child.on('error', (err) => {
      console.log(chalk.red(`❌ ${agentName} 실행 실패: ${err.message}`));
      process.exit(1);
    });
  } catch (err) {
    console.log(chalk.red(`❌ 실행 실패: ${(err as Error).message}`));
    process.exit(1);
  }
}

export const startCommand = new Command('start')
  .description('Start Claude CLI in the current terminal')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .action((opts) => startAction(opts, false));

export const startTrustCommand = new Command('start-trust')
  .description('Start Claude CLI in trust mode (--dangerously-skip-permissions)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .action((opts) => startAction(opts, true));
