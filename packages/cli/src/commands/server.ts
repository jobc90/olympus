import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';

const PROJECT_MARKERS = ['.git', 'package.json', 'pnpm-workspace.yaml'] as const;
const SKIP_DIRS = new Set(['node_modules', '.git', '.idea', '.vscode', '.next', 'dist', 'build', '.turbo', '.cache', 'coverage']);

function isProjectDirectory(dirPath: string): boolean {
  return PROJECT_MARKERS.some((marker) => existsSync(join(dirPath, marker)));
}

function resolveWorkspaceRootForServer(cwd: string): string {
  const envRoot = process.env.OLYMPUS_WORKSPACE_ROOT;
  if (envRoot) {
    const resolved = resolvePath(envRoot);
    if (existsSync(resolved)) return resolved;
  }

  const resolvedCwd = resolvePath(cwd);
  const looksLikeOlympus = existsSync(join(resolvedCwd, 'pnpm-workspace.yaml'))
    && existsSync(join(resolvedCwd, 'packages'))
    && existsSync(join(resolvedCwd, 'AGENTS.md'));

  if (looksLikeOlympus || basename(resolvedCwd).toLowerCase() === 'olympus') {
    const parent = dirname(resolvedCwd);
    try {
      const siblings = readdirSync(parent, { withFileTypes: true, encoding: 'utf8' })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('.') && name !== basename(resolvedCwd));
      const hasSiblingProject = siblings.some((name) => isProjectDirectory(join(parent, name)));
      if (hasSiblingProject) return parent;
    } catch {
      // Fall through
    }
  }

  return resolvedCwd;
}

function listWorkspaceProjectsForServer(workspaceRoot: string): Array<{ name: string; path: string }> {
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = readdirSync(workspaceRoot, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return [];
  }

  const projects: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const projectPath = join(workspaceRoot, entry.name);
    if (!isProjectDirectory(projectPath)) continue;
    projects.push({ name: entry.name, path: projectPath });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

export const serverCommand = new Command('server')
  .description('Manage Olympus server components');

// server start subcommand
serverCommand
  .command('start')
  .description('Start Olympus server (gateway + dashboard + telegram bot)')
  .option('--gateway', 'Start only the gateway')
  .option('--dashboard', 'Start only the dashboard')
  .option('--telegram', 'Start only the telegram bot')
  .option('-p, --port <port>', 'Gateway port', '8200')
  .option('--web-port <port>', 'Dashboard port', '8201')
  .option('--skip-update', 'Skip CLI update check (default: true)', true)
  .option('--update-tools', 'Force CLI tools update on start')
  .option('--mode <mode>', 'Server mode: legacy | hybrid | codex', 'codex')
  .option('-w, --workspace <path>', 'Workspace root path (default: auto-detect)')
  .action(async (opts) => {
    const { loadConfig, isTelegramConfigured } = await import('@olympus-dev/gateway');
    const config = loadConfig();
    const workspaceRoot = opts.workspace
      ? resolvePath(String(opts.workspace))
      : resolveWorkspaceRootForServer(process.cwd());

    // Validate mode
    const validModes = ['legacy', 'hybrid', 'codex'];
    const mode: string = validModes.includes(opts.mode) ? opts.mode : (() => {
      if (opts.mode) console.warn(chalk.yellow(`  ⚠ 알 수 없는 모드 '${opts.mode}' → codex로 실행`));
      return 'codex';
    })();

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
    console.log(chalk.gray(`  Workspace: ${workspaceRoot}`));
    console.log();

    // Update CLI tools only when explicitly requested
    if (opts.updateTools) {
      await updateCLITools();
    }

    // Show what will be started
    console.log(chalk.white('Starting:'));
    if (startGateway) {
      console.log(chalk.green('  ✓ Gateway') + chalk.gray(` → port ${config.gatewayPort}`));
      if (startDashboard) {
        console.log(chalk.green('    ├─ Dashboard') + chalk.gray(` → port ${opts.webPort}`));
      }
      if (startTelegram) {
        if (isTelegramConfigured()) {
          console.log(chalk.green('    └─ Telegram Bot'));
        } else {
          console.log(chalk.yellow('    └─ Telegram Bot') + chalk.gray(' (설정 없음 — olympus setup --telegram)'));
        }
      }
    } else {
      if (startDashboard) console.log(chalk.green('  ✓ Dashboard'));
      if (startTelegram) {
        if (isTelegramConfigured()) {
          console.log(chalk.green('  ✓ Telegram Bot'));
        } else {
          console.log(chalk.yellow('  ⚠ Telegram Bot') + chalk.gray(' (설정 없음)'));
        }
      }
    }
    console.log();

    let gateway: Awaited<ReturnType<typeof startGatewayServer>> | null = null;
    let dashboard: Awaited<ReturnType<typeof startDashboardServer>> | null = null;

    // Initialize Codex Orchestrator if hybrid or codex mode
    let codexAdapter: Awaited<ReturnType<typeof initCodexAdapter>> | null = null;
    if (mode === 'hybrid' || mode === 'codex') {
      codexAdapter = await initCodexAdapter(workspaceRoot);
    }

    // Initialize Gemini Advisor (optional, graceful degradation)
    const geminiAdvisor = await initGeminiAdvisor(workspaceRoot);

    // Start Gateway
    if (startGateway) {
      try {
        gateway = await startGatewayServer(
          opts.port,
          config,
          codexAdapter ?? undefined,
          mode,
          geminiAdvisor ?? undefined,
          workspaceRoot,
        );
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'EADDRINUSE') {
          console.log(chalk.red(`\n  ❌ Gateway 포트 ${opts.port}이 이미 사용 중입니다.\n`));
          console.log(chalk.gray('  해결 방법:'));
          if (process.platform === 'win32') {
            console.log(chalk.gray(`  1. 기존 프로세스 종료: netstat -ano | findstr :${opts.port}  → taskkill /PID <PID> /F`));
          } else {
            console.log(chalk.gray(`  1. 기존 프로세스 종료: lsof -ti :${opts.port} | xargs kill`));
          }
          console.log(chalk.gray('  2. 다른 포트 사용: olympus server start -p 8202'));
          console.log(chalk.gray('  3. 이미 실행 중이면 대시보드를 바로 여세요: http://localhost:8201\n'));
        } else {
          console.log(chalk.red(`\n  ❌ Gateway 시작 실패: ${e.message}\n`));
        }
        process.exit(1);
      }
    }

    // Start Dashboard
    if (startDashboard) {
      try {
        dashboard = await startDashboardServer(opts.webPort, {
          gatewayHost: config.gatewayHost,
          gatewayPort: config.gatewayPort,
          apiKey: config.apiKey,
        });
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'EADDRINUSE') {
          console.log(chalk.yellow(`  ⚠ Dashboard 포트 ${opts.webPort}이 사용 중 — 대시보드 없이 계속합니다.`));
          console.log(chalk.gray(`    다른 포트: olympus server start --web-port 8202\n`));
        } else {
          console.log(chalk.yellow(`  ⚠ Dashboard 시작 실패: ${e.message}`));
        }
      }
    }

    // Start Telegram Bot
    if (startTelegram && isTelegramConfigured()) {
      await startTelegramBot(config);
    } else if (startTelegram && !isTelegramConfigured()) {
      console.log(chalk.yellow('💡 Telegram 봇 설정: olympus setup --telegram\n'));
    }

    // Seed Context OS workspace
    try {
      const { ContextStore } = await import('@olympus-dev/core');
      const store = ContextStore.getInstance();
      store.seedWorkspace(workspaceRoot);

      const projects = listWorkspaceProjectsForServer(workspaceRoot);
      for (const project of projects) {
        store.seedProject(workspaceRoot, project.path);
      }

      console.log(chalk.green(`  ✓ Context OS workspace seeded: ${workspaceRoot}`));
    } catch {
      // Non-critical, continue
    }

    // Final instructions
    console.log(chalk.cyan.bold('\n✅ Olympus 준비 완료!\n'));
    if (startGateway) {
      console.log(chalk.white(`  Gateway:   `) + chalk.cyan(`http://localhost:${config.gatewayPort}`));
    }
    if (startDashboard) {
      console.log(chalk.white(`  Dashboard: `) + chalk.cyan.underline(`http://localhost:${opts.webPort}`) + chalk.gray(' ← 브라우저에서 열기'));
    }
    if (startTelegram && isTelegramConfigured()) {
      console.log(chalk.white(`  Telegram:  `) + chalk.green('✓ 봇 연결됨'));
    }
    console.log();
    console.log(chalk.gray('워커 시작: ') + chalk.white('olympus start-trust') + chalk.gray(' (다른 터미널)'));
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

    // Cross-platform helper to find PIDs listening on a port
    const getPidsOnPort = (port: number): string => {
      if (process.platform === 'win32') {
        try {
          const out = execSync(`netstat -ano | findstr ":${port} "`, { encoding: 'utf-8' });
          const pids = [...new Set(
            out.split('\n')
              .map((l) => l.trim().split(/\s+/).pop() ?? '')
              .filter((p) => /^\d+$/.test(p) && p !== '0'),
          )];
          return pids.join('\n');
        } catch {
          return '';
        }
      }
      try {
        return execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      } catch {
        return '';
      }
    };

    // Cross-platform kill helper
    const killPid = (pid: string, signal: 'SIGTERM' | 'SIGKILL'): void => {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /F 2>nul`, { stdio: 'pipe' });
      } else {
        const sig = signal === 'SIGTERM' ? '-15' : '-9';
        execSync(`kill ${sig} ${pid} 2>/dev/null`);
      }
    };

    // Graceful stop helper: SIGTERM → wait → SIGKILL
    const gracefulKill = (pids: string, label: string, timeoutMs = 5000): boolean => {
      const pidArray = pids.split('\n').filter(Boolean);
      if (pidArray.length === 0) return false;
      try {
        // Step 1: Send SIGTERM for graceful shutdown
        for (const pid of pidArray) {
          try { killPid(pid, 'SIGTERM'); } catch { /* already dead */ }
        }
        console.log(chalk.gray(`    ${label}: SIGTERM 전송됨, 종료 대기 중...`));

        // Step 2: Wait for process to exit (poll every 500ms)
        const startTime = Date.now();
        let alive = true;
        while (alive && Date.now() - startTime < timeoutMs) {
          try {
            if (process.platform === 'win32') {
              execSync(`tasklist /FI "PID eq ${pidArray[0]}" /NH 2>nul | findstr /I "${pidArray[0]}"`, { stdio: 'pipe' });
            } else {
              execSync(`kill -0 ${pidArray[0]} 2>/dev/null`);
            }
            execSync(process.platform === 'win32' ? 'timeout /t 1 /nobreak >nul' : 'sleep 0.5');
          } catch {
            alive = false;
          }
        }

        // Step 3: Force kill if still alive
        if (alive) {
          for (const pid of pidArray) {
            try { killPid(pid, 'SIGKILL'); } catch { /* already dead */ }
          }
          console.log(chalk.yellow(`    ${label}: 강제 종료됨`));
        }
        return true;
      } catch {
        return false;
      }
    };

    // Stop Gateway (port 8200) - this also stops telegram if running in same process
    if (stopGateway) {
      const pids = getPidsOnPort(config.gatewayPort);
      if (pids) {
        gracefulKill(pids, 'Gateway');
        console.log(chalk.green('  ✓ Gateway 종료됨 (+ Telegram Bot)'));
        stoppedAny = true;
      } else {
        console.log(chalk.gray('  - Gateway: 실행 중이 아님'));
      }
    }

    // Stop Dashboard (port 8201)
    if (stopDashboard) {
      const pids = getPidsOnPort(8201);
      if (pids) {
        gracefulKill(pids, 'Dashboard');
        console.log(chalk.green('  ✓ Dashboard 종료됨'));
        stoppedAny = true;
      } else {
        console.log(chalk.gray('  - Dashboard: 실행 중이 아님'));
      }
    }

    // Stop standalone Telegram bot (if running separately via `olympus telegram`)
    if (stopTelegram && !stopGateway) {
      try {
        const pids = process.platform === 'win32'
          ? execSync('wmic process where "CommandLine like \'%olympus%telegram%\'" get ProcessId /VALUE 2>nul', { encoding: 'utf-8' })
              .split('\n').map((l) => l.replace('ProcessId=', '').trim()).filter((p) => /^\d+$/.test(p) && p !== '0').join('\n')
          : execSync('pgrep -f "olympus.*telegram" 2>/dev/null', { encoding: 'utf-8' }).trim();
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

function maskApiKey(key: string): string {
  if (!key) return '(not set)';
  if (key.length >= 8) return key.slice(0, 4) + '****' + key.slice(-4);
  return '****';
}

async function startGatewayServer(
  port: string,
  config: { gatewayHost: string; apiKey: string },
  codexAdapter?: unknown,
  mode?: string,
  geminiAdvisor?: unknown,
  workspaceRoot?: string,
) {
  const { Gateway } = await import('@olympus-dev/gateway');

  const gatewayOpts: Record<string, unknown> = {
    port: Number(port),
    host: config.gatewayHost,
  };
  if (codexAdapter) {
    gatewayOpts.codexAdapter = codexAdapter;
  }
  if (geminiAdvisor) {
    gatewayOpts.geminiAdvisor = geminiAdvisor;
  }
  if (mode) {
    gatewayOpts.mode = mode;
  }
  if (workspaceRoot) {
    gatewayOpts.workspaceRoot = workspaceRoot;
  }

  const gateway = new Gateway(gatewayOpts as never);

  await gateway.start();

  console.log(chalk.cyan('📡 Gateway 시작됨'));
  console.log(chalk.gray(`   URL: http://${config.gatewayHost}:${port}`));
  console.log(chalk.gray(`   API Key: ${maskApiKey(config.apiKey)}`));
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
    console.log(chalk.gray('   확인한 위치:'));
    for (const p of possiblePaths) {
      console.log(chalk.gray(`     • ${p}`));
    }
    console.log(chalk.gray('   해결:'));
    console.log(chalk.gray('     pnpm -F @olympus-dev/web build'));
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
    // Strip query string from URL for file resolution
    const urlPath = (req.url ?? '/').split('?')[0];
    const requestedPath = urlPath === '/' ? 'index.html' : urlPath;
    let filePath = path.resolve(distPath!, '.' + path.normalize('/' + requestedPath));

    // Security: path traversal 가드 — distPath 외부 접근 차단
    if (!filePath.startsWith(distPath!)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

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
 * Initialize Codex Orchestrator and create adapter for Gateway integration
 */
async function initCodexAdapter(
  workspaceRoot: string,
) {
  try {
    const { CodexOrchestrator } = await import('@olympus-dev/codex');
    const { CodexAdapter } = await import('@olympus-dev/gateway');

    console.log(chalk.cyan('🧠 Codex Orchestrator 시작 중...'));

    // Scan for projects in workspace root
    const discoveredProjects = listWorkspaceProjectsForServer(workspaceRoot);
    const projects: Array<{ name: string; path: string; aliases: string[]; techStack: string[] }> = [];
    for (const project of discoveredProjects) {
      projects.push({
        name: project.name,
        path: project.path,
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
 * Initialize Gemini Advisor (optional — graceful degradation if gemini CLI not available)
 */
async function initGeminiAdvisor(workspaceRoot: string) {
  try {
    const { execSync } = await import('child_process');

    // gemini CLI 존재 확인
    try {
      const isWin = process.platform === 'win32';
      execSync(isWin ? 'where gemini' : 'which gemini', { stdio: 'pipe' });
    } catch {
      console.log(chalk.gray('  - Gemini Advisor: gemini CLI 미설치 (건너뜀)'));
      return null;
    }

    const { GeminiAdvisor } = await import('@olympus-dev/gateway');
    const projects = listWorkspaceProjectsForServer(workspaceRoot);

    const parseBool = (value: string | undefined, fallback: boolean): boolean => {
      if (value == null || value.trim() === '') return fallback;
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
    };

    const parseIntWithDefault = (value: string | undefined, fallback: number): number => {
      if (value == null || value.trim() === '') return fallback;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };

    const refreshIntervalMs = parseIntWithDefault(process.env.OLYMPUS_GEMINI_REFRESH_MS, 0);
    const preTaskReviewEnabled = parseBool(process.env.OLYMPUS_GEMINI_PRE_REVIEW, false);
    const postTaskReviewEnabled = parseBool(process.env.OLYMPUS_GEMINI_POST_REVIEW, false);
    const proactiveAlertEnabled = parseBool(process.env.OLYMPUS_GEMINI_PROACTIVE_ALERT, false);
    const analysisTimeoutMs = parseIntWithDefault(process.env.OLYMPUS_GEMINI_ANALYSIS_TIMEOUT_MS, 60_000);
    const reviewTimeoutMs = parseIntWithDefault(process.env.OLYMPUS_GEMINI_REVIEW_TIMEOUT_MS, 30_000);

    const advisor = new GeminiAdvisor({
      model: process.env.OLYMPUS_GEMINI_MODEL || undefined,
      refreshIntervalMs,
      preTaskReviewEnabled,
      postTaskReviewEnabled,
      proactiveAlertEnabled,
      analysisTimeoutMs,
      reviewTimeoutMs,
    });
    await advisor.initialize(projects);
    const status = advisor.getStatus();
    if (!status.running || !status.ptyAlive) {
      console.log(chalk.yellow('  ⚠ Gemini Advisor 시작 실패: Gemini PTY가 활성화되지 않았습니다.'));
      return null;
    }

    console.log(chalk.green(`  ✓ Gemini Advisor 초기화 완료 (프로젝트 ${projects.length}개)`));
    console.log(chalk.gray(`    └ Mode: ${refreshIntervalMs <= 0 ? 'change-driven' : `periodic ${refreshIntervalMs}ms`} / pre-review:${preTaskReviewEnabled ? 'on' : 'off'} / post-review:${postTaskReviewEnabled ? 'on' : 'off'}`));
    return advisor;
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Gemini Advisor 초기화 실패 (선택 기능): ${(err as Error).message}`));
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

  const checkCmd = process.platform === 'win32' ? 'where' : 'which';
  for (const tool of CLI_TOOLS) {
    // Check if tool is installed
    try {
      execSync(`${checkCmd} ${tool.name}`, { stdio: 'pipe' });
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
