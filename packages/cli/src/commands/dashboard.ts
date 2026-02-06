import { Command } from 'commander';
import chalk from 'chalk';

export const dashboardCommand = new Command('dashboard')
  .alias('ui')
  .description('Launch the Olympus web dashboard')
  .option('-p, --port <port>', 'Dashboard port', '18791')
  .option('--gateway-port <port>', 'Gateway port', '18790')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (opts) => {
    const port = parseInt(opts.port) || 18791;
    const gatewayPort = parseInt(opts.gatewayPort) || 18790;

    console.log(chalk.cyan.bold('\n🌐 Olympus Dashboard\n'));

    // Check if gateway is running
    try {
      const res = await fetch(`http://127.0.0.1:${gatewayPort}/healthz`);
      if (res.ok) {
        console.log(chalk.green('  ✓ Gateway 연결됨'));
      }
    } catch {
      console.log(chalk.yellow('  ⚠ Gateway가 실행 중이 아닙니다.'));
      console.log(chalk.gray('    먼저 실행하세요: olympus server start'));
      console.log();
    }

    // Check if dashboard is already running
    try {
      const res = await fetch(`http://127.0.0.1:${port}`);
      if (res.ok) {
        const url = `http://127.0.0.1:${port}`;
        console.log(chalk.green(`  ✓ Dashboard 이미 실행 중: ${url}`));
        if (opts.open !== false) {
          const { exec } = await import('child_process');
          const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          exec(`${openCmd} ${url}`);
          console.log(chalk.gray('  브라우저에서 열었습니다.'));
        }
        return;
      }
    } catch {
      // Dashboard not running, start it via server
    }

    // Dashboard not running - start server with dashboard only
    console.log(chalk.gray('  Dashboard를 시작합니다...\n'));

    // Dynamically import and run server start with --dashboard flag
    const { serverCommand } = await import('./server.js');
    await serverCommand.parseAsync(['node', 'olympus', 'start', '--dashboard', '--skip-update', '--web-port', String(port)], { from: 'user' });
  });
