import { Command } from 'commander';

export const tuiCommand = new Command('tui')
  .description('Start the Olympus TUI (Terminal UI)')
  .option('-p, --port <port>', 'Gateway port to connect', '18790')
  .option('-h, --host <host>', 'Gateway host', '127.0.0.1')
  .option('--api-key <key>', 'API key for gateway authentication')
  .option('--with-gateway', 'Also start gateway server')
  .option('--demo', 'Run demo event sequence (requires --with-gateway)')
  .action(async (opts) => {
    const { default: WebSocket } = await import('ws');
    const chalk = (await import('chalk')).default;

    let apiKey = opts.apiKey;
    let demoRunId: string | undefined;

    if (opts.withGateway) {
      const { Gateway } = await import('@olympus-dev/gateway');

      const gw = new Gateway({ port: Number(opts.port), host: opts.host });
      const info = await gw.start();
      apiKey = info.apiKey;

      console.log(chalk.green(`⚡ Gateway started at ws://${info.host}:${info.port}/ws`));

      if (opts.demo) {
        console.log(chalk.cyan('🎬 Demo mode: creating a test run...'));

        // Create a demo run through RunManager
        const runManager = gw.getRunManager();
        const demoRun = runManager.createRun({
          prompt: 'Demo: Analyze best practices for TypeScript monorepo',
          agents: ['gemini', 'gpt'],
        });

        demoRunId = demoRun.id;
        const bus = demoRun.bus;

        // Demo sequence
        setTimeout(() => {
          bus.emitLog('info', 'Demo started', 'demo');
          bus.emitPhase(-1, 'Smart Intake', 'started');
        }, 1000);

        setTimeout(() => {
          bus.emitTaskUpdate('task-1', 'Analyze requirements', 'pending');
          bus.emitTaskUpdate('task-2', 'Run Gemini', 'pending');
          bus.emitTaskUpdate('task-3', 'Run GPT', 'pending');
        }, 2000);

        setTimeout(() => {
          bus.emitPhase(0, 'Analysis', 'started');
          bus.emitTaskUpdate('task-1', 'Analyze requirements', 'completed');
          bus.emitTaskUpdate('task-2', 'Run Gemini', 'in_progress');
          bus.emitAgentStart('gemini', 'task-2');
        }, 3000);

        setTimeout(() => {
          bus.emitAgentChunk('gemini', 'task-2', 'Analyzing the code structure...\n');
        }, 3500);

        setTimeout(() => {
          bus.emitAgentChunk('gemini', 'task-2', 'Found 3 potential improvements:\n1. ');
        }, 4000);

        setTimeout(() => {
          bus.emitAgentChunk('gemini', 'task-2', 'Optimize imports\n2. Add caching\n3. Refactor utils');
          bus.emitTaskUpdate('task-3', 'Run GPT', 'in_progress');
          bus.emitAgentStart('gpt', 'task-3');
        }, 4500);

        setTimeout(() => {
          bus.emitAgentChunk('gpt', 'task-3', 'Backend analysis complete. Recommendations:...');
        }, 5000);

        setTimeout(() => {
          bus.emitAgentComplete('gemini', 'task-2', 'Analysis complete');
          bus.emitTaskUpdate('task-2', 'Run Gemini', 'completed');
          bus.emitLog('info', 'Gemini finished in 2500ms', 'orchestrator');
        }, 5500);

        setTimeout(() => {
          bus.emitAgentComplete('gpt', 'task-3', 'Analysis complete');
          bus.emitTaskUpdate('task-3', 'Run GPT', 'completed');
          bus.emitLog('info', 'GPT finished in 2000ms', 'orchestrator');
        }, 6000);

        setTimeout(() => {
          bus.emitPhase(0, 'Analysis', 'completed');
          bus.emitPhase(1, 'Multi-Layer DAG', 'started');
          bus.emitLog('info', 'All agents completed successfully', 'orchestrator');
        }, 6500);

        setTimeout(() => {
          bus.emitPhase(1, 'Multi-Layer DAG', 'completed');
          bus.emitLog('info', 'Demo sequence finished', 'demo');
          runManager.completeRun(demoRun.id, true);
        }, 8000);
      }
    } else if (!apiKey) {
      // Try to load API key from config
      try {
        const { loadConfig } = await import('@olympus-dev/gateway');
        const config = loadConfig();
        apiKey = config.apiKey;
      } catch {
        console.log(chalk.yellow('⚠ No API key provided. Use --api-key or --with-gateway'));
      }
    }

    const { startTui } = await import('@olympus-dev/tui');
    const { waitUntilExit } = startTui({
      port: Number(opts.port),
      host: opts.host,
      apiKey,
      demoRunId, // Auto-subscribe to demo run if provided
      WebSocket: WebSocket as any,
    });
    await waitUntilExit();
  });
