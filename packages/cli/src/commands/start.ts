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

  const trustLabel = forceTrust ? chalk.yellow('trust') : chalk.gray('interactive');
  logBrief(chalk.gray(`⚡ Olympus Worker (PTY mode, ${trustLabel})`));

  // 2. Check gateway health
  try {
    const healthRes = await fetch(`${gatewayUrl}/healthz`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
  } catch {
    logBrief(chalk.red(`  Gateway 연결 실패: ${gatewayUrl}`));
    logBrief(chalk.gray('  olympus server start로 Gateway를 먼저 시작하세요.'));
    process.exit(1);
  }

  // 2.5. Check for worker name conflict
  if (!opts.name) {
    try {
      const listRes = await fetch(`${gatewayUrl}/api/workers`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (listRes.ok) {
        const data = await listRes.json() as { workers?: Array<{ name: string }> };
        const existing = (data.workers ?? []).find((w) => w.name === workerName);
        if (existing) {
          logBrief(chalk.yellow(`  ⚠ 워커 이름 '${workerName}'이 이미 등록되어 있습니다.`));
          logBrief(chalk.gray('    다른 이름으로 시작: olympus start-trust --name worker2'));
          logBrief(chalk.gray('    또는 다른 프로젝트 디렉토리에서 실행하세요.'));
          logBrief('');
        }
      }
    } catch {
      // Non-fatal — proceed even if check fails
    }
  }

  // 3. Setup PTY worker state
  let ptyWorker: PtyWorkerType;
  let workerId = '';
  let shuttingDown = false;
  let streamBuffer = '';
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  // true after ptyWorker.start() — Claude TUI owns the screen; suppress stderr writes
  let ptyActive = false;
  const STREAM_FLUSH_MS = 30;
  const STREAM_FLUSH_SIZE = 2048;
  // Guards against double-handling of local PTY input (race condition between
  // WS broadcast and HTTP response — see onLocalInput handler below).
  let localPtyTaskPending = false;

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

  // 4. Register worker BEFORE starting PTY so all logBrief messages appear
  //    in the normal terminal before Claude TUI takes over the screen.
  const { PtyWorker } = await import('../pty-worker.js');
  ptyWorker = new PtyWorker({
    projectPath,
    trustMode: forceTrust,
    onData: queueWorkerStream,
    onReady: () => {},
    onExit: () => {
      if (shutdownFn) shutdownFn('Ctrl+C');
    },
    // Cross-channel input sync: when the user types a command in the local PTY
    // terminal, notify Telegram (Ch1) and Dashboard Chat (Ch3) by creating a
    // tracked task record. The input is already in the PTY — we just monitor
    // for completion and report the result (same as dashboard terminal input).
    onLocalInput: async (line: string) => {
      if (shuttingDown || !workerId || localPtyTaskPending) return;
      // Guard: don't create a new task if the PTY is already processing
      if (ptyWorker.isProcessing) return;

      localPtyTaskPending = true;
      try {
        const taskRes = await fetch(`${gatewayUrl}/api/workers/${workerId}/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            prompt: line,
            source: 'local-pty',
            dangerouslySkipPermissions: forceTrust,
          }),
        });
        if (!taskRes.ok) return;

        const { taskId } = await taskRes.json() as { taskId: string };
        // Add to handledTaskIds before WS event is processed to prevent
        // the WS handler from calling executeTaskWithTimeout (re-writing prompt to PTY)
        handledTaskIds.add(taskId);

        // Monitor completion — input already in PTY, don't write again
        try {
          const result = await ptyWorker.monitorForCompletion(line);
          await reportResult(taskId, {
            success: result.success,
            text: result.text.slice(0, 50000),
            durationMs: result.durationMs,
          });
        } catch (err) {
          await reportResult(taskId, {
            success: false,
            error: (err as Error).message,
            durationMs: 0,
          });
        }
      } catch {
        // Non-fatal — local PTY input sync is best-effort
      } finally {
        localPtyTaskPending = false;
      }
    },
  });

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
    logBrief(chalk.green(`  ✅ Gateway에 등록 완료 — Telegram/Dashboard에서 작업을 받을 수 있습니다`));
    if (forceTrust) {
      logBrief(chalk.gray(`  💡 Telegram: @${workerName} git status`));
    }
    logBrief(''); // blank line before Claude TUI starts
    await flushWorkerStream();
  } catch (err) {
    logBrief(chalk.red(`  워커 등록 실패: ${(err as Error).message}`));
    process.exit(1);
  }

  // 5. Start PTY — alternate screen enters here; terminal belongs to Claude from now on
  // Claude CLI v2.x + MCP servers can take 30-60s to fully initialize
  // PtyWorker has 15s time-based fallback; 120s is the absolute maximum
  try {
    await Promise.race([
      ptyWorker.start(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PTY init timeout (120s) — Claude CLI not ready')), 120_000),
      ),
    ]);
    ptyActive = true;
  } catch (err) {
    // Deregister the worker since PTY failed to start
    await fetch(`${gatewayUrl}/api/workers/${workerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
    logBrief(chalk.red(`\n  ❌ PTY 시작 실패: ${(err as Error).message}`));
    logBrief(chalk.gray(''));
    logBrief(chalk.gray('  해결 방법:'));
    logBrief(chalk.gray('  1. claude 명령어가 설치되어 있는지 확인: which claude'));
    logBrief(chalk.gray('  2. node-pty가 설치되어 있는지 확인: ls node_modules/node-pty'));
    logBrief(chalk.gray('  3. Claude CLI를 직접 실행해 정상 동작하는지 확인: claude'));
    logBrief(chalk.gray(''));
    process.exit(1);
  }

  // 6. Start heartbeat
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

      const TEXT_LIMIT = 50000;
      const truncated = result.text.length > TEXT_LIMIT;
      await reportResult(task.taskId, {
        success: result.success,
        text: result.text.slice(0, TEXT_LIMIT),
        truncated,
        originalLength: truncated ? result.text.length : undefined,
        durationMs: result.durationMs,
      });
    } catch (err) {
      // Don't write to stderr when PTY is active — it would corrupt Claude TUI
      if (!ptyActive) {
        process.stderr.write(`[worker] 작업 실행 실패: ${(err as Error).message}\n`);
      }
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

      // Suppress when PTY is active to avoid corrupting Claude TUI
      if (!ptyActive) {
        process.stderr.write(chalk.gray(`[worker] 누락된 작업 복구: ${pending.taskId.slice(0, 8)} (${pending.workerName})\n`));
      }
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

  // 7. Connect WebSocket with proper authentication
  const wsUrl = gatewayUrl.replace(/^http/, 'ws') + GATEWAY_PATH;
  let ws: WebSocket | null = null;

  // WS ping timer — keeps the connection alive.
  // Gateway terminates clients that don't respond to heartbeat within 60s.
  // Send application-level ping every 25s to keep alive flag set.
  let wsPingTimer: ReturnType<typeof setInterval> | null = null;

  function connectWs() {
    ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      ws?.send(JSON.stringify(createMessage('connect', {
        clientType: 'worker',
        apiKey,
      })));

      // Start ping loop to prevent gateway from terminating this WS connection.
      // Gateway heartbeat runs every 30s and terminates clients with alive=false.
      // Sending ping every 25s ensures alive=true at every heartbeat check.
      if (wsPingTimer) clearInterval(wsPingTimer);
      wsPingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(createMessage('ping', {})));
        }
      }, 25_000);

      // Recover tasks that might have been assigned while WS was disconnected.
      recoverMissedTaskViaPolling().catch(() => {});
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'connected' || msg.type === 'runs:list' || msg.type === 'sessions:list' || msg.type === 'pong') {
          return;
        }

        if (msg.type === 'worker:task:assigned' && msg.payload?.workerId === workerId) {
          if (ptyWorker.isProcessing) {
            // Don't write to stderr when PTY is active — it would corrupt Claude TUI
            if (!ptyActive) {
              process.stderr.write(chalk.yellow('⚠ 이미 작업 진행 중\n'));
            }
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

          // Local PTY input: onLocalInput() already sent to PTY and is monitoring.
          // Just dedup — prevents executeTaskWithTimeout from writing to PTY again.
          if (task.source === 'local-pty') {
            handledTaskIds.add(task.taskId);
            // onLocalInput handler owns monitorForCompletion + reportResult for this task
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
      if (wsPingTimer) {
        clearInterval(wsPingTimer);
        wsPingTimer = null;
      }
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
    if (wsPingTimer) {
      clearInterval(wsPingTimer);
      wsPingTimer = null;
    }
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
