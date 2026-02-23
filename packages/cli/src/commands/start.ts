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
  projectPath?: string;
  /** 'terminal' when task originates from dashboard PTY input */
  source?: string;
}

interface WorkerInputPayload {
  workerId: string;
  input: string;
}

interface WorkerResizePayload {
  workerId: string;
  cols: number;
  rows: number;
}

interface WorkerTaskSnapshot {
  taskId: string;
  workerId: string;
  workerName: string;
  prompt: string;
  status: 'running' | 'timeout' | 'completed' | 'failed';
}

/**
 * Select one recoverable pending task for this worker.
 * Used as a fallback when WS assignment events are missed.
 */
export function selectPendingTaskForWorker(
  tasks: WorkerTaskSnapshot[],
  workerId: string,
  handledTaskIds: Set<string>,
): WorkerTaskSnapshot | null {
  for (const task of tasks) {
    if (task.workerId !== workerId) continue;
    if (task.status !== 'running' && task.status !== 'timeout') continue;
    if (handledTaskIds.has(task.taskId)) continue;
    return task;
  }
  return null;
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
  let workerId = '';
  let shuttingDown = false;
  let streamBuffer = '';
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  const STREAM_FLUSH_MS = 30;
  const STREAM_FLUSH_SIZE = 2048;

  // shutdown 함수를 먼저 선언 (onExit에서 참조)
  let shutdownFn: ((signal: string) => Promise<void>) | null = null;

  async function flushWorkerStream(): Promise<void> {
    if (!workerId || !streamBuffer) return;
    const content = streamBuffer;
    streamBuffer = '';

    try {
      await fetch(`${gatewayUrl}/api/workers/${workerId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          content,
          timestamp: Date.now(),
        }),
      });
    } catch {
      // Stream relay is best-effort.
    }
  }

  function queueWorkerStream(chunk: string): void {
    if (shuttingDown || !chunk) return;
    streamBuffer += chunk;

    if (streamBuffer.length >= STREAM_FLUSH_SIZE) {
      if (streamFlushTimer) {
        clearTimeout(streamFlushTimer);
        streamFlushTimer = null;
      }
      void flushWorkerStream();
      return;
    }

    if (!streamFlushTimer) {
      streamFlushTimer = setTimeout(() => {
        streamFlushTimer = null;
        void flushWorkerStream();
      }, STREAM_FLUSH_MS);
    }
  }

  try {
    const { PtyWorker } = await import('../pty-worker.js');
    ptyWorker = new PtyWorker({
      projectPath,
      trustMode: forceTrust,
      onData: queueWorkerStream,
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
    await flushWorkerStream();
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

  const handledTaskIds = new Set<string>();

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
    if (handledTaskIds.has(task.taskId)) {
      return;
    }
    handledTaskIds.add(task.taskId);

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

  async function recoverMissedTaskViaPolling(): Promise<void> {
    if (ptyWorker.isProcessing) return;

    try {
      const res = await fetch(`${gatewayUrl}/api/workers/tasks`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return;

      const body = await res.json() as { tasks?: WorkerTaskSnapshot[] };
      const tasks = body.tasks ?? [];
      const pending = selectPendingTaskForWorker(tasks, workerId, handledTaskIds);
      if (!pending) return;

      process.stderr.write(chalk.gray(`[worker] 누락된 작업 복구: ${pending.taskId.slice(0, 8)} (${pending.workerName})\n`));
      await handleTask({
        taskId: pending.taskId,
        workerId: pending.workerId,
        workerName: pending.workerName,
        prompt: pending.prompt,
        projectPath,
      });
    } catch {
      // polling errors are non-fatal
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

      // Recover tasks that might have been assigned while WS was disconnected.
      recoverMissedTaskViaPolling().catch(() => {});
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

          // Terminal-sourced tasks: input already sent via sendInput — just monitor completion
          if (task.source === 'terminal') {
            handledTaskIds.add(task.taskId);
            ptyWorker.monitorForCompletion(task.prompt)
              .then(result => reportResult(task.taskId, {
                success: result.success,
                text: result.text.slice(0, 50000),
                durationMs: result.durationMs,
              }))
              .catch(err => reportResult(task.taskId, {
                success: false,
                error: (err as Error).message,
                durationMs: 0,
              }));
            return;
          }

          handleTask(task);
          return;
        }

        if (msg.type === 'worker:input' && msg.payload?.workerId === workerId) {
          const payload = msg.payload as WorkerInputPayload;
          if (typeof payload.input === 'string' && payload.input.length > 0) {
            ptyWorker.sendInput(payload.input);
          }
          return;
        }

        if (msg.type === 'worker:resize' && msg.payload?.workerId === workerId) {
          const payload = msg.payload as WorkerResizePayload;
          ptyWorker.resize(payload.cols, payload.rows);
          return;
        }
      } catch { /* ignore parse errors */ }
    });
    ws.on('close', () => {
      setTimeout(connectWs, 5000);
    });
    ws.on('error', () => {});
  }

  connectWs();

  const recoveryPollInterval = setInterval(() => {
    recoverMissedTaskViaPolling().catch(() => {});
  }, 5_000);

  // 7. Graceful shutdown
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeatInterval);
    clearInterval(recoveryPollInterval);
    if (streamFlushTimer) {
      clearTimeout(streamFlushTimer);
      streamFlushTimer = null;
    }
    await flushWorkerStream();

    ptyWorker.destroy();
    // After destroy(), alternate screen is restored — safe to print
    logBrief('');
    logBrief(chalk.gray('Shutting down...'));

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
  process.on('SIGHUP', () => shutdown('SIGHUP'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));

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
