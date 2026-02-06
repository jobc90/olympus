import { Command } from 'commander';

export const gatewayCommand = new Command('gateway')
  .description('Start the Olympus gateway server')
  .option('-p, --port <port>', 'Gateway port', '18790')
  .option('-h, --host <host>', 'Gateway host', '127.0.0.1')
  .option('--demo', 'Run demo event sequence for testing')
  .action(async (opts) => {
    const chalk = (await import('chalk')).default;
    const { Gateway } = await import('@olympus-dev/gateway');

    const gw = new Gateway({ port: Number(opts.port), host: opts.host });
    const info = await gw.start();

    console.log(chalk.green(`⚡ Olympus Gateway started`));
    console.log();
    console.log(chalk.white('  HTTP API:  ') + chalk.cyan(`http://${info.host}:${info.port}`));
    console.log(chalk.white('  WebSocket: ') + chalk.cyan(`ws://${info.host}:${info.port}/ws`));
    console.log(chalk.white('  API Key:   ') + chalk.yellow(info.apiKey));
    console.log();
    console.log(chalk.dim('Endpoints:'));
    console.log(chalk.dim('  GET  /healthz        - Health check'));
    console.log(chalk.dim('  POST /api/runs       - Create new run'));
    console.log(chalk.dim('  GET  /api/runs       - List all runs'));
    console.log(chalk.dim('  GET  /api/runs/:id   - Get run status'));
    console.log(chalk.dim('  DELETE /api/runs/:id - Cancel run'));
    console.log();

    if (opts.demo) {
      console.log(chalk.cyan('🎬 Demo mode: creating a test run...'));

      // Create a demo run through RunManager
      const runManager = gw.getRunManager();
        const demoRun = runManager.createRun({
          prompt: 'Demo: Analyze best practices for TypeScript monorepo',
          agents: ['gemini', 'codex'],
        });

      const bus = demoRun.bus;

      // Demo sequence
      setTimeout(() => {
        bus.emitLog('info', 'Demo started', 'demo');
        bus.emitPhase(-1, 'Smart Intake', 'started');
      }, 1000);

      setTimeout(() => {
        bus.emitTaskUpdate('task-1', 'Analyze requirements', 'pending');
        bus.emitTaskUpdate('task-2', 'Run Gemini', 'pending');
        bus.emitTaskUpdate('task-3', 'Run Codex', 'pending');
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
        bus.emitTaskUpdate('task-3', 'Run Codex', 'in_progress');
        bus.emitAgentStart('codex', 'task-3');
      }, 4500);

      setTimeout(() => {
        bus.emitAgentChunk('codex', 'task-3', 'Backend analysis complete. Recommendations:...');
      }, 5000);

      setTimeout(() => {
        bus.emitAgentComplete('gemini', 'task-2', 'Analysis complete');
        bus.emitTaskUpdate('task-2', 'Run Gemini', 'completed');
        bus.emitLog('info', 'Gemini finished in 2500ms', 'orchestrator');
      }, 5500);

      setTimeout(() => {
        bus.emitAgentComplete('codex', 'task-3', 'Analysis complete');
        bus.emitTaskUpdate('task-3', 'Run Codex', 'completed');
        bus.emitLog('info', 'Codex finished in 2000ms', 'orchestrator');
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

      console.log(chalk.dim(`Demo run ID: ${demoRun.id}`));
      console.log(chalk.dim('Connect TUI or Web dashboard to see events'));
    }

    console.log(chalk.gray('Press Ctrl+C to stop'));

    const shutdown = async () => {
      console.log(chalk.yellow('\nShutting down...'));
      await gw.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
