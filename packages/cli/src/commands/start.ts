import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, basename } from 'path';
import WebSocket from 'ws';

async function startWorker(opts: Record<string, unknown>, forceTrust: boolean): Promise<void> {
  const projectPath = resolve(opts.project as string);
  const workerName = (opts.name as string) || basename(projectPath);

  // 1. Load config
  const { loadConfig } = await import('@olympus-dev/gateway');
  const config = loadConfig();
  const gatewayUrl = config.gatewayUrl || `http://${config.gatewayHost}:${config.gatewayPort}`;
  const apiKey = config.apiKey;

  console.log(chalk.cyan.bold('\n⚡ Olympus Worker\n'));

  // 2. Check gateway health
  try {
    const healthRes = await fetch(`${gatewayUrl}/healthz`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    console.log(chalk.green(`  ✓ Gateway: ${gatewayUrl}`));
  } catch {
    console.log(chalk.red(`  ✗ Gateway 연결 실패: ${gatewayUrl}`));
    console.log(chalk.gray('    olympus server start로 Gateway를 먼저 시작하세요.'));
    process.exit(1);
  }

  // 3. Register worker
  let workerId: string;
  try {
    const regRes = await fetch(`${gatewayUrl}/api/workers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ name: workerName, projectPath, pid: process.pid }),
    });
    if (!regRes.ok) throw new Error(`HTTP ${regRes.status}`);
    const data = await regRes.json() as { worker: { id: string } };
    workerId = data.worker.id;
    console.log(chalk.green(`  ✓ Worker "${workerName}" 등록됨 (${workerId.slice(0, 8)})`));
  } catch (err) {
    console.log(chalk.red(`  ✗ 워커 등록 실패: ${(err as Error).message}`));
    process.exit(1);
  }

  console.log(chalk.green(`  ✓ Project: ${projectPath}`));
  if (forceTrust) console.log(chalk.yellow('  ⚠ Trust mode 활성화'));
  console.log();

  // 4. Start heartbeat
  const heartbeatInterval = setInterval(async () => {
    try {
      await fetch(`${gatewayUrl}/api/workers/${workerId}/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch { /* ignore heartbeat failures */ }
  }, 30_000);

  // 5. Connect WebSocket for streaming output
  const wsUrl = gatewayUrl.replace(/^http/, 'ws');
  let ws: WebSocket | null = null;

  function connectWs() {
    ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      // Subscribe to events for this worker
      ws?.send(JSON.stringify({ type: 'subscribe', payload: { runId: `worker:${workerId}` } }));
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Handle task:assigned event
        if (msg.type === 'task:assigned' && msg.payload?.workerId === workerId) {
          const prompt = msg.payload.prompt || '';
          console.log(chalk.blue(`\n📋 작업 수신: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}"`));
          console.log(chalk.gray('─'.repeat(60)));
        }
        // Handle cli:stream for this worker's tasks
        if (msg.type === 'cli:stream') {
          const chunk = msg.payload?.chunk;
          if (chunk) process.stdout.write(chunk);
        }
        // Handle task:completed
        if (msg.type === 'task:completed' && msg.payload?.workerId === workerId) {
          const { success, durationMs } = msg.payload;
          console.log(chalk.gray('\n' + '─'.repeat(60)));
          if (success) {
            console.log(chalk.green(`✅ 작업 완료 (${Math.round((durationMs || 0) / 1000)}초)`));
          } else {
            console.log(chalk.red(`❌ 작업 실패`));
          }
          printStatus('idle');
        }
      } catch { /* ignore parse errors */ }
    });
    ws.on('close', () => {
      setTimeout(connectWs, 5000); // Reconnect
    });
    ws.on('error', () => {}); // Suppress unhandled errors
  }

  connectWs();

  // 6. Print status
  function printStatus(status: 'idle' | 'busy') {
    if (status === 'idle') {
      console.log(chalk.green(`\n🟢 "${workerName}" 대기 중 @ ${projectPath}`));
      console.log(chalk.gray('   작업을 기다리는 중... (Ctrl+C로 종료)\n'));
    }
  }

  printStatus('idle');

  // 7. Graceful shutdown
  async function shutdown(signal: string) {
    console.log(chalk.yellow(`\n${signal} 수신, 종료 중...`));
    clearInterval(heartbeatInterval);
    ws?.close();
    try {
      await fetch(`${gatewayUrl}/api/workers/${workerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      console.log(chalk.green('✓ 워커 등록 해제 완료'));
    } catch { /* ignore */ }
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  await new Promise(() => {}); // Never resolves
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
