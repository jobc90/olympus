import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, basename } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { createMessage, GATEWAY_PATH } from '@olympus-dev/protocol';
import type { PtyWorker as PtyWorkerType, TaskResult, TimeoutAwareResult } from '../pty-worker.js';

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

  logBrief(chalk.gray('⚡ Olympus Worker'));

  // 2. Check gateway health
  try {
    const healthRes = await fetch(`${gatewayUrl}/healthz`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
  } catch {
    logBrief(chalk.red(`  Gateway 연결 실패: ${gatewayUrl}`));
    logBrief(chalk.gray('  olympus server start로 Gateway를 먼저 시작하세요.'));
    process.exit(1);
  }

  // 3. PtyWorker 로드 시도
  let ptyWorker: PtyWorkerType | null = null;

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
    await ptyWorker.start();
  } catch (err) {
    ptyWorker = null;
    logBrief(chalk.yellow(`  PTY 불가: ${(err as Error).message}`));
    logBrief(chalk.gray('  spawn 모드로 실행합니다.'));
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
    logBrief(chalk.gray(`  Worker: ${workerName} (${ptyWorker ? 'PTY' : 'Spawn'})`));
  } catch (err) {
    logBrief(chalk.red(`  워커 등록 실패: ${(err as Error).message}`));
    if (ptyWorker) ptyWorker.destroy();
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

  // ─── PTY 모드: 작업 처리 ───

  async function handleTaskPty(task: TaskPayload): Promise<void> {
    try {
      const { result } = await ptyWorker!.executeTaskWithTimeout(task.prompt);

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

  // ─── Spawn 폴백 모드: 작업 처리 ───

  let activeProc: ChildProcess | null = null;

  function executeTaskSpawn(task: TaskPayload): void {
    const cliCommand = task.provider === 'codex' ? 'codex' : 'claude';
    const args: string[] = [];

    if (task.provider === 'codex') {
      args.push('exec');
      if (forceTrust || task.dangerouslySkipPermissions) {
        args.push('--dangerously-bypass-approvals-and-sandbox');
      }
      args.push(task.prompt);
    } else {
      args.push(task.prompt);
      if (forceTrust || task.dangerouslySkipPermissions) {
        args.push('--dangerously-skip-permissions');
      }
    }

    console.log(chalk.blue(`\n📋 작업 시작 (Spawn): "${task.prompt.slice(0, 80)}${task.prompt.length > 80 ? '...' : ''}"`));
    console.log(chalk.gray(`   provider: ${cliCommand} | project: ${task.projectPath}`));
    console.log(chalk.gray('─'.repeat(60) + '\n'));

    const startTime = Date.now();

    const proc = spawn(cliCommand, args, {
      stdio: 'inherit',
      cwd: task.projectPath,
    });
    activeProc = proc;

    proc.on('close', (code) => {
      activeProc = null;
      const durationMs = Date.now() - startTime;
      const success = code === 0;

      console.log(chalk.gray('\n' + '─'.repeat(60)));
      if (success) {
        console.log(chalk.green(`✅ 작업 완료 (${Math.round(durationMs / 1000)}초)`));
      } else {
        console.log(chalk.red(`❌ 작업 실패 (exit: ${code})`));
      }

      reportResult(task.taskId, {
        success,
        text: success ? '작업이 완료되었습니다.' : `CLI 종료 코드: ${code}`,
        durationMs,
      }).catch(() => {});

      printStatus('idle');
    });

    proc.on('error', (err) => {
      activeProc = null;
      console.log(chalk.red(`❌ CLI 실행 실패: ${err.message}`));
      reportResult(task.taskId, {
        success: false,
        error: err.message,
        durationMs: Date.now() - startTime,
      }).catch(() => {});
      printStatus('idle');
    });
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
          if (ptyWorker?.isProcessing) {
            process.stderr.write(chalk.yellow('⚠ 이미 작업 진행 중\n'));
            return;
          }
          if (activeProc) {
            console.log(chalk.yellow('\n⚠ 이미 작업 진행 중입니다.'));
            return;
          }

          const task = msg.payload as TaskPayload;
          if (ptyWorker) {
            handleTaskPty(task);
          } else {
            executeTaskSpawn(task);
          }
        }
      } catch { /* ignore parse errors */ }
    });
    ws.on('close', () => {
      setTimeout(connectWs, 5000);
    });
    ws.on('error', () => {});
  }

  connectWs();

  // 7. Print status (Spawn 모드만 — PTY 모드는 TUI가 자체 표시)
  function printStatus(status: 'idle' | 'busy') {
    if (status === 'idle' && !ptyWorker) {
      console.log(chalk.green(`\n  ${workerName} — ready`));
      console.log(chalk.gray('  Waiting for tasks... (Ctrl+C to exit)\n'));
    }
  }

  printStatus('idle');

  // 8. Graceful shutdown
  async function shutdown(signal: string) {
    logBrief('');
    logBrief(chalk.gray('Shutting down...'));
    clearInterval(heartbeatInterval);

    if (ptyWorker) {
      ptyWorker.destroy();
    }
    if (activeProc) {
      activeProc.kill('SIGTERM');
    }

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
  .description('Start Olympus Worker daemon (register with Gateway, wait for tasks)')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-n, --name <name>', 'Worker name (default: directory name)')
  .action((opts) => startWorker(opts, false));

export const startTrustCommand = new Command('start-trust')
  .description('Start Olympus Worker in trust mode')
  .option('-p, --project <path>', 'Project directory path', process.cwd())
  .option('-n, --name <name>', 'Worker name (default: directory name)')
  .action((opts) => startWorker(opts, true));
