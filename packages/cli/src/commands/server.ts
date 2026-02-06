import { Command } from 'commander';
import chalk from 'chalk';

export const serverCommand = new Command('server')
  .description('Manage Olympus server components');

// server start subcommand
serverCommand
  .command('start')
  .description('Start Olympus server (gateway + dashboard + telegram bot)')
  .option('--gateway', 'Start only the gateway')
  .option('--dashboard', 'Start only the dashboard')
  .option('--telegram', 'Start only the telegram bot')
  .option('-p, --port <port>', 'Gateway port', '18790')
  .option('--web-port <port>', 'Dashboard port', '18791')
  .option('--skip-update', 'Skip CLI update check (default: true)', true)
  .option('--update-tools', 'Force CLI tools update on start')
  .action(async (opts) => {
    const { loadConfig, isTelegramConfigured } = await import('@olympus-dev/gateway');
    const config = loadConfig();

    // Determine what to start
    const startAll = !opts.gateway && !opts.dashboard && !opts.telegram;
    const startGateway = startAll || opts.gateway;
    const startDashboard = startAll || opts.dashboard;
    const startTelegram = startAll || opts.telegram;

    console.log(chalk.cyan.bold('\n⚡ Olympus Server\n'));

    // Update CLI tools only when explicitly requested
    if (opts.updateTools) {
      await updateCLITools();
    }

    // Show what will be started
    console.log(chalk.white('Starting:'));
    if (startGateway) console.log(chalk.green('  ✓ Gateway'));
    if (startDashboard) console.log(chalk.green('  ✓ Dashboard'));
    if (startTelegram) {
      if (isTelegramConfigured()) {
        console.log(chalk.green('  ✓ Telegram Bot'));
      } else {
        console.log(chalk.yellow('  ⚠ Telegram Bot (not configured)'));
      }
    }
    console.log();

    let gateway: Awaited<ReturnType<typeof startGatewayServer>> | null = null;
    let dashboard: Awaited<ReturnType<typeof startDashboardServer>> | null = null;

    // Start Gateway
    if (startGateway) {
      gateway = await startGatewayServer(opts.port, config);
    }

    // Start Dashboard
    if (startDashboard) {
      dashboard = await startDashboardServer(opts.webPort, {
        gatewayHost: config.gatewayHost,
        gatewayPort: config.gatewayPort,
        apiKey: config.apiKey,
      });
    }

    // Create main Claude CLI session first (before Telegram bot)
    if (startGateway) {
      await createMainSession(config);
    }

    // Start Telegram Bot (will auto-connect to main session)
    if (startTelegram && isTelegramConfigured()) {
      await startTelegramBot(config);
    } else if (startTelegram && !isTelegramConfigured()) {
      console.log(chalk.yellow('💡 Telegram 봇 설정: olympus setup --telegram\n'));
    }

    // Seed Context OS workspace
    try {
      const { ContextStore } = await import('@olympus-dev/core');
      const fs = await import('node:fs');
      const path = await import('node:path');
      const store = ContextStore.getInstance();
      const workspacePath = process.cwd();
      store.seedWorkspace(workspacePath);

      // Seed direct child directories as project contexts for top-level visibility.
      const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        const projectPath = path.join(workspacePath, entry.name);
        const hasProjectMarker =
          fs.existsSync(path.join(projectPath, '.git')) ||
          fs.existsSync(path.join(projectPath, 'package.json')) ||
          fs.existsSync(path.join(projectPath, 'pnpm-workspace.yaml'));
        if (!hasProjectMarker) continue;
        store.seedProject(workspacePath, projectPath);
      }

      console.log(chalk.green(`  ✓ Context OS workspace seeded: ${workspacePath}`));
    } catch {
      // Non-critical, continue
    }

    // Final instructions
    console.log(chalk.cyan.bold('\n✅ Olympus 준비 완료!\n'));
    console.log(chalk.gray('종료: Ctrl+C'));

    // Graceful shutdown
    const shutdown = async () => {
      console.log(chalk.yellow('\n\nShutting down...'));
      if (gateway) {
        await gateway.stop();
      }
      if (dashboard) {
        dashboard.close();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// server stop subcommand
serverCommand
  .command('stop')
  .description('Stop running Olympus server')
  .option('--gateway', 'Stop only the gateway')
  .option('--dashboard', 'Stop only the dashboard')
  .option('--telegram', 'Stop only the telegram bot')
  .action(async (opts) => {
    const { execSync } = await import('child_process');
    const { loadConfig } = await import('@olympus-dev/gateway');
    const config = loadConfig();

    const stopAll = !opts.gateway && !opts.dashboard && !opts.telegram;
    const stopGateway = stopAll || opts.gateway;
    const stopDashboard = stopAll || opts.dashboard;
    const stopTelegram = stopAll || opts.telegram;

    console.log(chalk.cyan.bold('\n⚡ Olympus Server Stop\n'));

    let stoppedAny = false;

    // Graceful stop helper: SIGTERM → wait → SIGKILL
    const gracefulKill = (pids: string, label: string, timeoutMs = 5000): boolean => {
      const pidList = pids.split('\n').filter(Boolean).join(' ');
      if (!pidList) return false;
      try {
        // Step 1: Send SIGTERM for graceful shutdown
        execSync(`kill -15 ${pidList} 2>/dev/null`);
        console.log(chalk.gray(`    ${label}: SIGTERM 전송됨, 종료 대기 중...`));

        // Step 2: Wait for process to exit (poll every 500ms)
        const startTime = Date.now();
        let alive = true;
        while (alive && Date.now() - startTime < timeoutMs) {
          try {
            execSync(`kill -0 ${pidList.split(' ')[0]} 2>/dev/null`);
            // Still alive, wait
            execSync('sleep 0.5');
          } catch {
            alive = false;
          }
        }

        // Step 3: Force kill if still alive
        if (alive) {
          try {
            execSync(`kill -9 ${pidList} 2>/dev/null`);
            console.log(chalk.yellow(`    ${label}: 강제 종료됨 (SIGKILL)`));
          } catch {
            // Already dead
          }
        }
        return true;
      } catch {
        return false;
      }
    };

    // Stop Gateway (port 18790) - this also stops telegram if running in same process
    if (stopGateway) {
      try {
        const pids = execSync(`lsof -ti :${config.gatewayPort} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (pids) {
          gracefulKill(pids, 'Gateway');
          console.log(chalk.green('  ✓ Gateway 종료됨 (+ Telegram Bot)'));
          stoppedAny = true;
        } else {
          console.log(chalk.gray('  - Gateway: 실행 중이 아님'));
        }
      } catch {
        console.log(chalk.gray('  - Gateway: 실행 중이 아님'));
      }
    }

    // Stop Dashboard (port 18791)
    if (stopDashboard) {
      try {
        const pids = execSync('lsof -ti :18791 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (pids) {
          gracefulKill(pids, 'Dashboard');
          console.log(chalk.green('  ✓ Dashboard 종료됨'));
          stoppedAny = true;
        } else {
          console.log(chalk.gray('  - Dashboard: 실행 중이 아님'));
        }
      } catch {
        console.log(chalk.gray('  - Dashboard: 실행 중이 아님'));
      }
    }

    // Stop standalone Telegram bot (if running separately via `olympus telegram`)
    if (stopTelegram && !stopGateway) {
      try {
        const pids = execSync('pgrep -f "olympus.*telegram" 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (pids) {
          gracefulKill(pids, 'Telegram Bot');
          console.log(chalk.green('  ✓ Telegram Bot 종료됨'));
          stoppedAny = true;
        } else {
          console.log(chalk.gray('  - Telegram Bot: 실행 중이 아님'));
        }
      } catch {
        console.log(chalk.gray('  - Telegram Bot: 실행 중이 아님'));
      }
    }

    // Stop main session (olympus-main tmux session)
    if (stopGateway) {
      try {
        execSync('tmux kill-session -t "olympus-main" 2>/dev/null');
        console.log(chalk.green('  ✓ Main 세션 종료됨'));
        stoppedAny = true;
      } catch {
        // Session might not exist
      }
    }

    console.log();
    if (stoppedAny) {
      console.log(chalk.cyan('서버가 종료되었습니다.'));
    } else {
      console.log(chalk.yellow('실행 중인 서버가 없습니다.'));
    }
  });

// server status subcommand
serverCommand
  .command('status')
  .description('Check Olympus server status')
  .action(async () => {
    const { loadConfig } = await import('@olympus-dev/gateway');
    const config = loadConfig();

    console.log(chalk.cyan.bold('\n⚡ Olympus Server Status\n'));

    // Check gateway
    try {
      const res = await fetch(`http://${config.gatewayHost}:${config.gatewayPort}/healthz`);
      if (res.ok) {
        const data = await res.json() as { status: string; uptime: number };
        console.log(chalk.green('  ✓ Gateway: running'));
        console.log(chalk.gray(`    Uptime: ${Math.floor(data.uptime / 60)}m`));
      } else {
        console.log(chalk.red('  ✗ Gateway: not responding'));
      }
    } catch {
      console.log(chalk.red('  ✗ Gateway: not running'));
    }

    console.log();
  });

async function startGatewayServer(port: string, config: { gatewayHost: string; apiKey: string }) {
  const { Gateway } = await import('@olympus-dev/gateway');

  const gateway = new Gateway({
    port: Number(port),
    host: config.gatewayHost,
  });

  await gateway.start();

  console.log(chalk.cyan('📡 Gateway 시작됨'));
  console.log(chalk.gray(`   URL: http://${config.gatewayHost}:${port}`));
  console.log(chalk.gray(`   API Key: ${config.apiKey}`));
  console.log(chalk.gray(`   WebSocket: ws://${config.gatewayHost}:${port}/ws`));
  console.log();

  return gateway;
}

interface DashboardConfig {
  gatewayHost: string;
  gatewayPort: number;
  apiKey: string;
}

async function startDashboardServer(port: string, gatewayConfig?: DashboardConfig) {
  const http = await import('node:http');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  // Find the web package dist directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Try multiple possible locations for web dist
  const possiblePaths = [
    path.resolve(__dirname, '../../web/dist'),           // Development: packages/cli/dist -> packages/web/dist
    path.resolve(__dirname, '../../../web/dist'),        // Alternative
    path.resolve(process.cwd(), 'packages/web/dist'),   // From monorepo root
    path.resolve(process.cwd(), 'node_modules/@olympus-dev/web/dist'), // Installed package
  ];

  let distPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'index.html'))) {
      distPath = p;
      break;
    }
  }

  if (!distPath) {
    console.log(chalk.yellow('🌐 Dashboard'));
    console.log(chalk.red('   ✗ 빌드된 파일을 찾을 수 없습니다.'));
    console.log(chalk.gray('   pnpm build 를 먼저 실행하세요.'));
    console.log();
    return null;
  }

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(distPath!, req.url === '/' ? 'index.html' : req.url!);

    // SPA fallback: if file doesn't exist, serve index.html
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distPath!, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      // Inject gateway config into index.html as window.__OLYMPUS_CONFIG__
      if (ext === '.html' && gatewayConfig) {
        const configScript = `<script>window.__OLYMPUS_CONFIG__=${JSON.stringify({
          host: gatewayConfig.gatewayHost,
          port: gatewayConfig.gatewayPort,
          apiKey: gatewayConfig.apiKey,
        })};</script>`;
        const html = content.toString().replace('</head>', `${configScript}</head>`);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(html);
        return;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });

  return new Promise<typeof server>((resolve) => {
    server.listen(Number(port), '127.0.0.1', () => {
      console.log(chalk.cyan('🌐 Dashboard 시작됨'));
      console.log(chalk.gray(`   URL: http://localhost:${port}`));
      console.log();
      resolve(server);
    });
  });
}

async function startTelegramBot(config: { telegram?: { token: string; allowedUsers: number[] }; gatewayUrl: string; apiKey: string }) {
  if (!config.telegram) return;

  // Set environment variables for telegram bot
  process.env.TELEGRAM_BOT_TOKEN = config.telegram.token;
  process.env.ALLOWED_USERS = config.telegram.allowedUsers.join(',');
  process.env.OLYMPUS_GATEWAY_URL = config.gatewayUrl;
  process.env.OLYMPUS_API_KEY = config.apiKey;

  console.log(chalk.cyan('🤖 Telegram 봇 시작 중...'));

  try {
    // Import starts the bot in background
    import('@olympus-dev/telegram-bot').catch(() => {});

    // Wait for bot to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(chalk.green('   ✓ Telegram 봇 연결됨'));
    console.log(chalk.gray(`   허용된 사용자: ${config.telegram.allowedUsers.join(', ')}`));

    // Auto-connect main session for all allowed users
    await autoConnectMainSessionForUsers(config, config.telegram.allowedUsers);
    console.log();
  } catch (err) {
    console.log(chalk.red(`   ✗ Telegram 봇 시작 실패: ${(err as Error).message}`));
    console.log();
  }
}

/**
 * Auto-connect main session for all allowed Telegram users
 */
async function autoConnectMainSessionForUsers(
  config: { gatewayUrl: string; apiKey: string },
  allowedUsers: number[]
): Promise<void> {
  const MAIN_SESSION = 'olympus-main';

  for (const chatId of allowedUsers) {
    try {
      const res = await fetch(`${config.gatewayUrl}/api/sessions/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ chatId, tmuxSession: MAIN_SESSION }),
      });

      if (res.ok) {
        console.log(chalk.green(`   ✓ main 세션 → 사용자 ${chatId} 연결됨`));
      }
    } catch {
      // Ignore - main session might not exist
    }
  }
}

/**
 * Create main Claude CLI session for dashboard control
 * This runs in the background and is auto-connected to Gateway
 */
async function createMainSession(config: { gatewayUrl: string; apiKey: string }): Promise<boolean> {
  const { execSync } = await import('child_process');

  const MAIN_SESSION = 'olympus-main';

  console.log(chalk.cyan('🖥️  Main 세션 시작 중...'));

  // Check if main session already exists
  try {
    execSync(`tmux has-session -t "${MAIN_SESSION}" 2>/dev/null`, { stdio: 'pipe' });
    console.log(chalk.yellow(`   ⚠ '${MAIN_SESSION}' 이미 실행 중`));

    // Connect existing session to Gateway
    await connectMainSessionToGateway(config, MAIN_SESSION);
    return true;
  } catch {
    // Session doesn't exist, create it
  }

  // Check if tmux is available
  try {
    execSync('which tmux', { stdio: 'pipe' });
  } catch {
    console.log(chalk.yellow('   ⚠ tmux가 설치되어 있지 않습니다. Main 세션 생략.'));
    return false;
  }

  // Check if claude is available
  let claudePath = 'claude';
  try {
    claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    console.log(chalk.yellow('   ⚠ Claude CLI가 설치되어 있지 않습니다. Main 세션 생략.'));
    return false;
  }

  // Create main tmux session with Claude CLI (background, no attach)
  try {
    const projectPath = process.cwd();
    execSync(
      `tmux new-session -d -s "${MAIN_SESSION}" -c "${projectPath}" "${claudePath}"`,
      { stdio: 'pipe' }
    );
    console.log(chalk.green(`   ✓ ${MAIN_SESSION} 세션 생성됨`));
    console.log(chalk.gray(`   경로: ${projectPath}`));

    // Connect to Gateway
    await connectMainSessionToGateway(config, MAIN_SESSION);
    return true;
  } catch (err) {
    console.log(chalk.red(`   ✗ Main 세션 생성 실패: ${(err as Error).message}`));
    return false;
  }
}

/**
 * Connect main session to Gateway for dashboard visibility
 */
async function connectMainSessionToGateway(
  config: { gatewayUrl: string; apiKey: string },
  tmuxSession: string
): Promise<void> {
  // Wait a moment for Gateway to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    const res = await fetch(`${config.gatewayUrl}/api/sessions/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        chatId: 0, // System session (dashboard control)
        tmuxSession,
      }),
    });

    if (res.ok) {
      console.log(chalk.green('   ✓ Gateway에 연결됨'));
    } else {
      const error = await res.json() as { message?: string };
      console.log(chalk.yellow(`   ⚠ Gateway 연결 실패: ${error.message || 'Unknown error'}`));
    }
  } catch (err) {
    console.log(chalk.yellow(`   ⚠ Gateway 연결 실패: ${(err as Error).message}`));
  }
  console.log();
}

/**
 * CLI Tools to update
 */
const CLI_TOOLS = [
  { name: 'claude', package: '@anthropic-ai/claude-code', label: 'Claude CLI' },
  { name: 'gemini', package: '@google/gemini-cli', label: 'Gemini CLI' },
  { name: 'codex', package: '@openai/codex', label: 'Codex CLI' },
];

/**
 * Update CLI tools to latest versions
 */
async function updateCLITools(): Promise<void> {
  const { execSync, spawnSync } = await import('child_process');

  console.log(chalk.white('🔄 CLI 도구 업데이트 확인 중...\n'));

  for (const tool of CLI_TOOLS) {
    // Check if tool is installed
    try {
      execSync(`which ${tool.name}`, { stdio: 'pipe' });
    } catch {
      console.log(chalk.gray(`   - ${tool.label}: 설치되지 않음 (건너뜀)`));
      continue;
    }

    // Get current version
    let currentVersion = '';
    try {
      currentVersion = execSync(`npm list -g ${tool.package} --depth=0 2>/dev/null | grep ${tool.package} | sed 's/.*@//'`, {
        encoding: 'utf-8',
      }).trim();
    } catch {
      // Couldn't get version
    }

    // Get latest version from npm
    let latestVersion = '';
    try {
      latestVersion = execSync(`npm view ${tool.package} version 2>/dev/null`, {
        encoding: 'utf-8',
      }).trim();
    } catch {
      console.log(chalk.yellow(`   ⚠ ${tool.label}: 버전 확인 실패`));
      continue;
    }

    // Compare versions
    if (currentVersion === latestVersion) {
      console.log(chalk.green(`   ✓ ${tool.label}: v${currentVersion} (최신)`));
    } else {
      console.log(chalk.yellow(`   ↑ ${tool.label}: v${currentVersion || '?'} → v${latestVersion} 업데이트 중...`));

      // Update
      const result = spawnSync('npm', ['install', '-g', `${tool.package}@latest`], {
        stdio: 'pipe',
        shell: true,
      });

      if (result.status === 0) {
        console.log(chalk.green(`   ✓ ${tool.label}: v${latestVersion} 업데이트 완료`));
      } else {
        // Try with sudo on permission error
        const sudoResult = spawnSync('sudo', ['npm', 'install', '-g', `${tool.package}@latest`], {
          stdio: 'inherit',
          shell: true,
        });

        if (sudoResult.status === 0) {
          console.log(chalk.green(`   ✓ ${tool.label}: v${latestVersion} 업데이트 완료`));
        } else {
          console.log(chalk.red(`   ✗ ${tool.label}: 업데이트 실패 (수동으로 실행: npm i -g ${tool.package})`));
        }
      }
    }
  }

  console.log();
}
