import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  isTelegramConfigured,
  getConfigPath,
} from '@olympus-dev/gateway';

export const startCommand = new Command('start')
  .description('Start Olympus Gateway (and Telegram bot if configured)')
  .option('--no-telegram', 'Do not start Telegram bot')
  .option('--gateway-only', 'Only start Gateway (alias for --no-telegram)')
  .action(async (opts) => {
    const config = loadConfig();

    console.log(chalk.cyan.bold('\n⚡ Olympus Start\n'));

    // Determine what to start
    const startTelegram =
      opts.telegram !== false &&
      !opts.gatewayOnly &&
      isTelegramConfigured();

    if (!isTelegramConfigured() && opts.telegram !== false && !opts.gatewayOnly) {
      console.log(chalk.yellow('💡 Telegram 봇이 설정되지 않았습니다.'));
      console.log(chalk.gray('   설정하려면: olympus setup --telegram\n'));
    }

    // Display startup info
    console.log(chalk.white('Starting:'));
    console.log(chalk.green('  ✓ Gateway'));
    if (startTelegram) {
      console.log(chalk.green('  ✓ Telegram Bot'));
    }
    console.log();

    // Set environment variables for telegram bot
    if (startTelegram && config.telegram) {
      process.env.TELEGRAM_BOT_TOKEN = config.telegram.token;
      process.env.ALLOWED_USERS = config.telegram.allowedUsers.join(',');
      process.env.OLYMPUS_GATEWAY_URL = config.gatewayUrl;
      process.env.OLYMPUS_API_KEY = config.apiKey;
    }

    // Import and start Gateway
    const { Gateway } = await import('@olympus-dev/gateway');

    const gateway = new Gateway({
      host: config.gatewayHost,
      port: config.gatewayPort,
    });

    await gateway.start();

    console.log(chalk.cyan('\n📡 Gateway 시작됨'));
    console.log(chalk.gray(`   URL: http://${config.gatewayHost}:${config.gatewayPort}`));
    console.log(chalk.gray(`   API Key: ${config.apiKey}`));
    console.log(chalk.gray(`   WebSocket: ws://${config.gatewayHost}:${config.gatewayPort}/ws`));

    // Start Telegram bot if configured
    if (startTelegram) {
      console.log(chalk.cyan('\n🤖 Telegram 봇 시작 중...'));

      try {
        // Dynamic import telegram bot
        await import('@olympus-dev/telegram-bot');
        console.log(chalk.green('   ✓ Telegram 봇 연결됨'));
        console.log(chalk.gray(`   허용된 사용자: ${config.telegram?.allowedUsers.join(', ')}`));
      } catch (err) {
        console.log(chalk.red(`   ✗ Telegram 봇 시작 실패: ${(err as Error).message}`));
      }
    }

    // Final instructions
    console.log(chalk.cyan.bold('\n✅ Olympus 준비 완료!\n'));

    if (startTelegram) {
      console.log(chalk.white('Telegram에서 봇에게 /start 메시지를 보내세요.'));
    } else {
      console.log(chalk.white('사용 방법:'));
      console.log(chalk.yellow('  olympus run "작업 프롬프트"'));
      console.log(chalk.gray('  → Gateway에 작업 요청\n'));
    }

    console.log(chalk.gray('종료: Ctrl+C'));
    console.log(chalk.gray(`설정: ${getConfigPath()}`));

    // Keep running
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nShutting down...'));
      gateway.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      gateway.stop();
      process.exit(0);
    });
  });
