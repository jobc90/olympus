import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { basename, resolve } from 'path';

/**
 * Generate session name from project path
 * e.g., /Users/jobc/dev/olympus -> olympus-olympus
 *       /Users/jobc/dev/console -> olympus-console
 */
function generateSessionName(projectPath: string): string {
  const absolutePath = resolve(projectPath);
  const folderName = basename(absolutePath);
  // Sanitize folder name (remove special chars, replace spaces with dashes)
  const sanitized = folderName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  return `olympus-${sanitized}`;
}

/**
 * Find available session name by appending -2, -3, etc. if base name exists
 */
function findAvailableSessionName(baseName: string): string {
  // First try: base name
  try {
    execSync(`tmux has-session -t "${baseName}" 2>/dev/null`, { stdio: 'pipe' });
  } catch {
    // Session doesn't exist, use base name
    return baseName;
  }

  // Base name exists, try -2, -3, ...
  let suffix = 2;
  while (suffix <= 99) {
    const newName = `${baseName}-${suffix}`;
    try {
      execSync(`tmux has-session -t "${newName}" 2>/dev/null`, { stdio: 'pipe' });
      suffix++;
    } catch {
      return newName;
    }
  }

  throw new Error('Too many sessions with the same base name (max 99)');
}

async function startAction(opts: Record<string, unknown>, forceTrust: boolean): Promise<void> {
  const projectPath = resolve(opts.project as string);

  console.log(chalk.cyan.bold('\n⚡ Olympus Start\n'));

  // Check if tmux is installed
  try {
    execSync('which tmux', { stdio: 'pipe' });
  } catch {
    console.log(chalk.red('❌ tmux가 설치되어 있지 않습니다.'));
    console.log(chalk.gray('   설치: brew install tmux (macOS)'));
    console.log(chalk.gray('         apt install tmux (Ubuntu)'));
    process.exit(1);
  }

  // Check if codex or claude is installed (codex preferred)
  let agentBinary = '';
  let agentName = '';
  try {
    execSync('which codex', { stdio: 'pipe' });
    agentBinary = 'codex';
    agentName = 'Codex CLI';
  } catch {
    try {
      execSync('which claude', { stdio: 'pipe' });
      agentBinary = 'claude';
      agentName = 'Claude CLI';
    } catch {
      console.log(chalk.red('❌ Codex/Claude CLI가 설치되어 있지 않습니다.'));
      console.log(chalk.gray('   Codex: npm install -g @openai/codex'));
      console.log(chalk.gray('   Claude: npm install -g @anthropic-ai/claude-code'));
      process.exit(1);
    }
  }

  // Check if already inside tmux
  const insideTmux = !!process.env.TMUX;

  // Generate session name (auto-increment if exists: olympus-foo, olympus-foo-2, olympus-foo-3...)
  const baseName = (opts.session as string) || generateSessionName(projectPath);
  const sessionName = findAvailableSessionName(baseName);

  if (sessionName !== baseName) {
    console.log(chalk.yellow(`📌 '${baseName}' 이미 존재 → '${sessionName}' 생성`));
    console.log();
  }

  // Create new session
  const trustMode = forceTrust || !!opts.trust;

  console.log(chalk.white('Starting:'));
  console.log(chalk.green(`  ✓ tmux session: ${sessionName}`));
  console.log(chalk.green(`  ✓ ${agentName}${trustMode ? ' (trust mode)' : ''}`));
  console.log(chalk.gray(`  ✓ Project: ${projectPath}`));
  if (trustMode) {
    console.log(chalk.yellow(`  ⚠ Trust mode: 권한 확인 없이 실행됩니다`));
  }
  console.log();

  try {
    // Get agent path to ensure it's found in tmux
    const agentPath = execSync(`which ${agentBinary}`, { encoding: 'utf-8' }).trim();

    // Build trust flag per agent:
    //   codex: --full-auto (sandboxed auto-execution)
    //   claude: --dangerously-skip-permissions
    let trustFlag = '';
    if (trustMode) {
      trustFlag = agentBinary === 'codex' ? ' --full-auto' : ' --dangerously-skip-permissions';
    }

    // Create tmux session with agent as the command
    // IMPORTANT: don't quote the full "path --flag" as one token — tmux treats
    // the first unquoted arg after -c <dir> as the shell command string.
    execSync(
      `tmux new-session -d -s "${sessionName}" -c "${projectPath}" ${agentPath}${trustFlag}`,
      { stdio: 'pipe' }
    );

    // Enable extended-keys for modifier key passthrough (Shift+Enter → newline)
    // 'always' forces passthrough even if terminal doesn't advertise support (needed for Ghostty/Kitty protocol)
    try {
      execSync(`tmux set -t "${sessionName}" extended-keys always`, { stdio: 'pipe' });
    } catch {
      // tmux < 3.2 doesn't support extended-keys, ignore
    }

    console.log(chalk.cyan.bold(`✅ ${agentName} 세션 시작됨!\n`));

    if (insideTmux) {
      // Already inside tmux, can't attach directly
      console.log(chalk.yellow('현재 tmux 내부에서 실행 중입니다.'));
      console.log(chalk.white('\n전환 방법:'));
      console.log(chalk.yellow(`  Ctrl+b ) 또는 Ctrl+b s`));
      console.log(chalk.gray('  → 세션 목록에서 선택'));
    } else if (opts.attach) {
      console.log(chalk.cyan('세션에 연결합니다...\n'));
      try {
        execSync(`tmux attach -t "${sessionName}"`, { stdio: 'inherit' });
        console.log(chalk.yellow('\n세션이 종료되었습니다.'));
      } catch {
        // Session might have ended
        console.log(chalk.yellow('\n세션이 종료되었습니다.'));
      }
    } else {
      console.log(chalk.white('사용 방법:'));
      console.log(chalk.yellow(`  tmux attach -t ${sessionName}`));
      console.log(chalk.gray('  → 세션 연결\n'));
      console.log(chalk.gray(`종료: Ctrl+D (Claude 종료 시 세션도 종료됨)`));
    }
  } catch (err) {
    console.log(chalk.red(`❌ 세션 생성 실패: ${(err as Error).message}`));
    process.exit(1);
  }
}

export const startCommand = new Command('start')
  .description('Start agent CLI in a new tmux session (Codex preferred, Claude fallback)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-s, --session <name>', 'Tmux session name (auto-generated from project path if not specified)')
  .option('-a, --attach', 'Attach to the session after creation', true)
  .option('--no-attach', 'Do not attach to the session')
  .option('--trust', 'Run agent CLI in trust mode (bypass permissions)')
  .action((opts) => startAction(opts, false));

export const startTrustCommand = new Command('start-trust')
  .description('Start agent CLI in trust mode (bypass permissions)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-s, --session <name>', 'Tmux session name (auto-generated from project path if not specified)')
  .option('-a, --attach', 'Attach to the session after creation', true)
  .option('--no-attach', 'Do not attach to the session')
  .action((opts) => startAction(opts, true));
