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
  .option('--mode <mode>', 'Server mode: legacy | hybrid | codex', 'codex')
  .action(async (opts) => {
    const { loadConfig, isTelegramConfigured } = await import('@olympus-dev/gateway');
    const config = loadConfig();

    // Validate mode
    const validModes = ['legacy', 'hybrid', 'codex'];
    const mode: string = validModes.includes(opts.mode) ? opts.mode : 'legacy';

    // Determine what to start
    const startAll = !opts.gateway && !opts.dashboard && !opts.telegram;
    const startGateway = startAll || opts.gateway;
    const startDashboard = startAll || opts.dashboard;
    const startTelegram = startAll || opts.telegram;

    console.log(chalk.cyan.bold('\n⚡ Olympus Server\n'));
    if (mode !== 'legacy') {
      console.log(chalk.magenta(`  Mode: ${mode.toUpperCase()}`));
      console.log();
    }

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

    // Initialize Codex Orchestrator if hybrid or codex mode
    let codexAdapter: Awaited<ReturnType<typeof initCodexAdapter>> | null = null;
    if (mode === 'hybrid' || mode === 'codex') {
      codexAdapter = await initCodexAdapter(config);
    }

    // Start Gateway
    if (startGateway) {
      gateway = await startGatewayServer(opts.port, config, codexAdapter ?? undefined, mode);
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
      if (codexAdapter) {
        try {
          const { CodexOrchestrator } = await import('@olympus-dev/codex');
          // codexAdapter holds reference internally, but orchestrator shutdown is via the stored ref
        } catch { /* ignore */ }
      }
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

    // Stop ALL olympus-* tmux sessions (not just main)
    if (stopGateway) {
      try {
        const tmuxSessions = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null', {
          encoding: 'utf-8',
        }).trim().split('\n').filter(s => s.startsWith('olympus-') || s === 'olympus');

        for (const session of tmuxSessions) {
          try {
            execSync(`tmux kill-session -t "${session}" 2>/dev/null`);
            console.log(chalk.green(`  ✓ ${session} 세션 종료됨`));
            stoppedAny = true;
          } catch {
            // Session might already be dead
          }
        }

        if (tmuxSessions.length === 0) {
          console.log(chalk.gray('  - tmux 세션: 없음'));
        }
      } catch {
        // No tmux sessions
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

async function startGatewayServer(port: string, config: { gatewayHost: string; apiKey: string }, codexAdapter?: unknown, mode?: string) {
  const { Gateway } = await import('@olympus-dev/gateway');

  const gatewayOpts: Record<string, unknown> = {
    port: Number(port),
    host: config.gatewayHost,
  };
  if (codexAdapter) {
    gatewayOpts.codexAdapter = codexAdapter;
  }
  if (mode) {
    gatewayOpts.mode = mode;
  }

  const gateway = new Gateway(gatewayOpts as never);

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
    // Import and await bot startup with timeout
    const STARTUP_TIMEOUT = 15000; // 15 seconds max
    const botModule = await Promise.race([
      import('@olympus-dev/telegram-bot'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bot startup timed out after 15s')), STARTUP_TIMEOUT)
      ),
    ]);

    // Check startup result from bot module
    const startResult = (botModule as { startResult?: { success: boolean; error?: string } }).startResult;

    if (startResult?.success === false) {
      console.log(chalk.yellow(`   ⚠ Telegram 봇 시작 실패: ${startResult.error ?? '알 수 없는 오류'}`));
      console.log(chalk.gray('   Gateway는 정상 작동합니다. 봇 없이 계속합니다.'));
      console.log();
      return;
    }

    console.log(chalk.green('   ✓ Telegram 봇 연결됨'));
    console.log(chalk.gray(`   허용된 사용자: ${config.telegram.allowedUsers.join(', ')}`));

    // Auto-connect main session for all allowed users
    await autoConnectMainSessionForUsers(config, config.telegram.allowedUsers);
    console.log();
  } catch (err) {
    const errMsg = (err as Error).message;
    const isTimeout = errMsg.includes('timed out');
    console.log(chalk.yellow(`   ⚠ Telegram 봇 시작 ${isTimeout ? '시간 초과' : '실패'}: ${errMsg}`));
    console.log(chalk.gray('   Gateway는 정상 작동합니다. 봇 없이 계속합니다.'));
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
 * Orchestrator CLAUDE.md template — instructs the main session AI to act as a
 * Telegram message orchestrator that routes commands to other tmux sessions.
 */
const ORCHESTRATOR_CLAUDE_MD = `# Olympus Orchestrator

당신은 Olympus 메시지 오케스트레이터입니다. Telegram에서 오는 모든 사용자 메시지를 받아 적절한 tmux 세션으로 라우팅합니다.

## 언어 설정

**항상 한국어(한글)로 응답하세요.**

## 역할

1. 사용자 메시지 의도 파악
2. 적절한 tmux 세션으로 라우팅
3. 대상 세션의 응답 대기 및 캡처
4. 결과를 간결하게 가공하여 전달

## 세션 발견

\`\`\`bash
tmux list-sessions -F "#{session_name}:#{pane_current_path}" | grep "^olympus-"
\`\`\`

- \`olympus-main\` = 나 자신 (라우팅하지 않음)
- \`olympus-*\` = 라우팅 가능한 세션

## 라우팅 프로토콜

### 1. 메시지 전송

\`\`\`bash
tmux send-keys -t <session-name> -l '<message>'
tmux send-keys -t <session-name> Enter
\`\`\`

### 2. 응답 대기 (폴링)

\`\`\`bash
tmux capture-pane -t <session-name> -p -S -100
\`\`\`

- 첫 10초: 2초 간격 폴링
- 이후: 5초 간격 폴링
- 최대 120초 대기 후 타임아웃 보고

### 3. 완료 감지

캡처된 출력의 마지막 비어있지 않은 줄이 \`❯\`로 시작하면 = Claude CLI가 유휴 상태 (처리 완료)

### 4. 응답 추출

완료 감지 후, 캡처된 출력에서:
- 사용자 메시지 이후 ~ \`❯\` 프롬프트 이전 내용을 추출
- \`⏺\` 마커가 있는 줄이 Claude의 응답

## 세션 선택 규칙

1. \`@세션명 메시지\` → 해당 세션으로 직접 라우팅
2. 프로젝트명이 언급됨 → 해당 프로젝트 경로의 세션으로 라우팅
3. 세션이 1개만 있음 → 해당 세션으로 라우팅
4. 판단이 어려움 → 사용 가능한 세션 목록을 보여주고 선택 요청

## 응답 형식

- **2000자 이내** (Telegram 메시지 제한)
- 한국어
- 핵심 결과만 간결하게
- 에러 발생 시 에러 내용 포함
- 코드 블록은 핵심 부분만 발췌

## 직접 응답하는 경우 (라우팅 없이)

- 인사, 간단한 질문
- 세션 목록/상태 조회 요청 → \`tmux list-sessions\`로 확인 후 답변
- 라우팅할 적절한 세션이 없는 경우

## 규칙

- 내부 라우팅 과정(tmux 명령어 실행 등)을 사용자에게 노출하지 않음
- 결과만 깔끔하게 전달
- 대상 세션이 응답 중일 때는 "처리 중입니다..." 안내 후 대기
- 타임아웃 시 현재까지의 출력을 요약해서 전달
`;

/**
 * Set up the orchestrator directory with CLAUDE.md
 * Returns the directory path for the main session working directory
 */
function setupOrchestratorDir(homedir: string): string {
  const { mkdirSync, writeFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');

  const dir = join(homedir, '.olympus', 'orchestrator');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'CLAUDE.md'), ORCHESTRATOR_CLAUDE_MD);
  return dir;
}

/**
 * Create main Claude CLI session as Telegram orchestrator
 * Runs in ~/.olympus/orchestrator/ with CLAUDE.md that instructs the AI
 * to route messages to other tmux sessions and process their responses.
 */
async function createMainSession(config: { gatewayUrl: string; apiKey: string }): Promise<boolean> {
  const { execSync } = await import('child_process');
  const { homedir } = await import('os');

  const MAIN_SESSION = 'olympus-main';

  console.log(chalk.cyan('🖥️  Main 세션 (오케스트레이터) 시작 중...'));

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

  // Check if Claude CLI is available
  let agentPath = '';
  let agentName = '';
  try {
    agentPath = execSync('which claude', { encoding: 'utf-8' }).trim();
    agentName = 'Claude CLI';
  } catch {
    console.log(chalk.yellow('   ⚠ Claude CLI가 설치되어 있지 않습니다. Main 세션 생략.'));
    return false;
  }

  // Set up orchestrator directory with CLAUDE.md
  const orchestratorDir = setupOrchestratorDir(homedir());

  // Create main tmux session with Claude CLI in trust mode (background, no attach)
  const trustFlag = ' --dangerously-skip-permissions';

  try {
    // Start in orchestrator directory so Claude reads the orchestrator CLAUDE.md
    execSync(
      `tmux new-session -d -s "${MAIN_SESSION}" -c "${orchestratorDir}" ${agentPath}${trustFlag}`,
      { stdio: 'pipe' }
    );
    // Enable extended-keys for Shift+Enter passthrough (Ghostty/Kitty protocol)
    try {
      execSync(`tmux set -t "${MAIN_SESSION}" extended-keys always`, { stdio: 'pipe' });
    } catch { /* tmux < 3.2 */ }
    console.log(chalk.green(`   ✓ ${MAIN_SESSION} 세션 생성됨 (${agentName} 오케스트레이터)`));
    console.log(chalk.gray(`   경로: ${orchestratorDir}`));

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
 * Initialize Codex Orchestrator and create adapter for Gateway integration
 */
async function initCodexAdapter(config: { gatewayHost: string; gatewayPort: number; apiKey: string }) {
  try {
    const { CodexOrchestrator } = await import('@olympus-dev/codex');
    const { CodexAdapter } = await import('@olympus-dev/gateway');
    const path = await import('node:path');
    const fs = await import('node:fs');

    console.log(chalk.cyan('🧠 Codex Orchestrator 시작 중...'));

    // Scan for projects in current directory
    const workspacePath = process.cwd();
    const projects: Array<{ name: string; path: string; aliases: string[]; techStack: string[] }> = [];

    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const projectPath = path.join(workspacePath, entry.name);
      const hasProjectMarker =
        fs.existsSync(path.join(projectPath, '.git')) ||
        fs.existsSync(path.join(projectPath, 'package.json'));
      if (!hasProjectMarker) continue;

      projects.push({
        name: entry.name,
        path: projectPath,
        aliases: [],
        techStack: [],
      });
    }

    const codex = new CodexOrchestrator({
      maxSessions: 5,
      projects,
    });

    await codex.initialize();

    const adapter = new CodexAdapter(
      codex,
      // Broadcast function — will be connected to Gateway later
      () => {},
    );

    console.log(chalk.green(`   ✓ Codex Orchestrator 초기화 완료 (프로젝트 ${projects.length}개)`));
    for (const p of projects) {
      console.log(chalk.gray(`     - ${p.name}: ${p.path}`));
    }
    console.log();

    return adapter;
  } catch (err) {
    console.log(chalk.yellow(`   ⚠ Codex Orchestrator 초기화 실패: ${(err as Error).message}`));
    console.log(chalk.gray('   Legacy 모드로 계속합니다.'));
    console.log();
    return null;
  }
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
