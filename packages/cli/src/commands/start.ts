import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, basename } from 'path';
import WebSocket from 'ws';
import { createMessage, GATEWAY_PATH } from '@olympus-dev/protocol';
import type { PtyWorker as PtyWorkerType } from '../pty-worker.js';

interface TaskPayload {
  taskId: string;
  workerId: string;
  workerName: string;
  prompt: string;
  provider?: string;
  dangerouslySkipPermissions?: boolean;
  projectPath: string;
}

/** Write a brief message to stderr (visible even in PTY mode, doesn't corrupt TUI) */
function logBrief(msg: string): void {
  process.stderr.write(msg + '\n');
}

async function startWorker(opts: Record<string, unknown>, forceTrust: boolean): Promise<void> {
  const projectPath = resolve(opts.project as string);
  let workerName = (opts.name as string) || basename(projectPath);

  // 1. Load config
  const { loadConfig } = await import('@olympus-dev/gateway');
  const config = loadConfig();
  const gatewayUrl = config.gatewayUrl || `http://${config.gatewayHost}:${config.gatewayPort}`;
  const apiKey = config.apiKey;

  logBrief(chalk.gray('⚡ Olympus Worker (PTY mode)'));

  // 2. Check gateway health
  try {
    const healthRes = await fetch(`${gatewayUrl}/healthz`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
  } catch {
    logBrief(chalk.red(`  Gateway 연결 실패: ${gatewayUrl}`));
    logBrief(chalk.gray('  olympus server start로 Gateway를 먼저 시작하세요.'));
    process.exit(1);
  }

  // 3. PtyWorker 시작 (PTY 전용 — spawn 폴백 없음)
  let ptyWorker: PtyWorkerType;

  // shutdown 함수를 먼저 선언 (onExit에서 참조)
  let shutdownFn: ((signal: string) => Promise<void>) | null = null;

  try {
    const { PtyWorker } = await import('../pty-worker.js');
    ptyWorker = new PtyWorker({
      projectPath,
      trustMode: forceTrust,
      onReady: () => {},
      onExit: () => {
        if (shutdownFn) shutdownFn('Ctrl+C');
      },
    });
    // Claude CLI v2.x + MCP servers can take 30-60s to fully initialize
    // PtyWorker has 15s time-based fallback; 120s is the absolute maximum
    await Promise.race([
      ptyWorker.start(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PTY init timeout (120s) — Claude CLI not ready')), 120_000),
      ),
    ]);
  } catch (err) {
    logBrief(chalk.red(`\n  ❌ PTY 시작 실패: ${(err as Error).message}`));
    logBrief(chalk.gray(''));
    logBrief(chalk.gray('  해결 방법:'));
    logBrief(chalk.gray('  1. claude 명령어가 설치되어 있는지 확인: which claude'));
    logBrief(chalk.gray('  2. node-pty가 설치되어 있는지 확인: ls node_modules/node-pty'));
    logBrief(chalk.gray('  3. Claude CLI를 직접 실행해 정상 동작하는지 확인: claude'));
    logBrief(chalk.gray(''));
    process.exit(1);
  }

  // 4. Register worker
  let workerId: string;
  try {
    const regRes = await fetch(`${gatewayUrl}/api/workers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ name: workerName, projectPath, pid: process.pid }),
    });
    if (!regRes.ok) throw new Error(`HTTP ${regRes.status}`);
    const data = await regRes.json() as { worker: { id: string; name: string } };
    workerId = data.worker.id;
    workerName = data.worker.name;
    logBrief(chalk.gray(`  Worker: ${workerName} (PTY)`));
  } catch (err) {
    logBrief(chalk.red(`  워커 등록 실패: ${(err as Error).message}`));
    ptyWorker.destroy();
    process.exit(1);
  }

  // 5. Start heartbeat
  const heartbeatInterval = setInterval(async () => {
    try {
      await fetch(`${gatewayUrl}/api/workers/${workerId}/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch { /* ignore heartbeat failures */ }
  }, 30_000);

  // ─── 결과 보고 ───

  async function reportResult(taskId: string, result: Record<string, unknown>): Promise<void> {
    await fetch(`${gatewayUrl}/api/workers/tasks/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(result),
    }).catch((err: Error) => {
      process.stderr.write(`[worker] 결과 보고 실패: ${err.message}\n`);
    });
  }

  // ─── PTY 작업 처리 ───

  async function handleTask(task: TaskPayload): Promise<void> {
    try {
      const { result } = await ptyWorker.executeTaskWithTimeout(task.prompt);

      await reportResult(task.taskId, {
        success: result.success,
        text: result.text.slice(0, 50000),
        durationMs: result.durationMs,
      });
    } catch (err) {
      process.stderr.write(`[worker] 작업 실행 실패: ${(err as Error).message}\n`);
      await reportResult(task.taskId, {
        success: false,
        error: (err as Error).message,
        durationMs: 0,
      });
    }
  }

  // 6. Connect WebSocket with proper authentication
  const wsUrl = gatewayUrl.replace(/^http/, 'ws') + GATEWAY_PATH;
  let ws: WebSocket | null = null;

  function connectWs() {
    ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      ws?.send(JSON.stringify(createMessage('connect', {
        clientType: 'worker',
        apiKey,
      })));
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'connected' || msg.type === 'runs:list' || msg.type === 'sessions:list') {
          return;
        }

        if (msg.type === 'worker:task:assigned' && msg.payload?.workerId === workerId) {
          if (ptyWorker.isProcessing) {
            process.stderr.write(chalk.yellow('⚠ 이미 작업 진행 중\n'));
            return;
          }

          const task = msg.payload as TaskPayload;
          handleTask(task);
        }
      } catch { /* ignore parse errors */ }
    });
    ws.on('close', () => {
      setTimeout(connectWs, 5000);
    });
    ws.on('error', () => {});
  }

  connectWs();

  // 7. Graceful shutdown
  async function shutdown(signal: string) {
    logBrief('');
    logBrief(chalk.gray('Shutting down...'));
    clearInterval(heartbeatInterval);

    ptyWorker.destroy();

    ws?.close();
    try {
      await fetch(`${gatewayUrl}/api/workers/${workerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch { /* ignore */ }
    process.exit(0);
  }

  shutdownFn = shutdown;

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  await new Promise(() => {});
}

export const startCommand = new Command('start')
  .description('Start Olympus Worker daemon (PTY mode — Claude CLI TUI visible)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-n, --name <name>', 'Worker name (default: directory name)')
  .action((opts) => startWorker(opts, false));

export const startTrustCommand = new Command('start-trust')
  .description('Start Olympus Worker in trust mode (PTY — Claude CLI TUI visible)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-n, --name <name>', 'Worker name (default: directory name)')
  .action((opts) => startWorker(opts, true));
