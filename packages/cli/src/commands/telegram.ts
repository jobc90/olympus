import { Command } from 'commander';

export const telegramCommand = new Command('telegram')
  .description('Start Olympus Telegram bot for remote control')
  .option('--gateway <url>', 'Gateway URL')
  .option('--api-key <key>', 'Olympus API key')
  .option('--token <token>', 'Telegram bot token')
  .option('--users <ids>', 'Allowed Telegram user IDs, comma-separated')
  .action(async (opts) => {
    const chalk = (await import('chalk')).default;

    // Load config from file first
    const { loadConfig } = await import('@olympus-dev/gateway');
    const config = loadConfig();

    // Environment variables (can override config file)
    // Priority: CLI options > env vars > config file

    // Telegram token
    const telegramToken =
      opts.token ??
      process.env.TELEGRAM_BOT_TOKEN ??
      config.telegram?.token;

    // Gateway URL
    const gatewayUrl =
      opts.gateway ??
      process.env.OLYMPUS_GATEWAY_URL ??
      config.gatewayUrl;

    // API key
    const apiKey =
      opts.apiKey ??
      process.env.OLYMPUS_API_KEY ??
      config.apiKey;

    // Allowed users
    const allowedUsersStr = opts.users ?? process.env.ALLOWED_USERS;
    const allowedUsers = allowedUsersStr
      ? allowedUsersStr.split(',').map(Number).filter((n: number) => !isNaN(n))
      : config.telegram?.allowedUsers ?? [];

    // Set environment variables for the bot
    if (telegramToken) process.env.TELEGRAM_BOT_TOKEN = telegramToken;
    process.env.OLYMPUS_GATEWAY_URL = gatewayUrl;
    process.env.OLYMPUS_API_KEY = apiKey;
    if (allowedUsers.length > 0) {
      process.env.ALLOWED_USERS = allowedUsers.join(',');
    }

    console.log(chalk.cyan('⚡ Olympus Telegram Bot'));
    console.log();

    if (!telegramToken) {
      console.log(chalk.red('❌ Telegram 봇 토큰이 설정되지 않았습니다.'));
      console.log();
      console.log(chalk.white('설정 방법:'));
      console.log(chalk.yellow('  olympus setup --telegram'));
      console.log(chalk.gray('  → 대화형 설정 마법사'));
      console.log();
      console.log(chalk.white('또는 수동 설정:'));
      console.log(chalk.gray('1. Telegram에서 @BotFather에게 /newbot 명령'));
      console.log(chalk.gray('2. 봇 이름 설정 후 토큰 받기'));
      console.log(chalk.gray('3. @userinfobot에게 메시지 보내서 본인 User ID 확인'));
      console.log();
      console.log(chalk.yellow('  export TELEGRAM_BOT_TOKEN="your-token"'));
      console.log(chalk.yellow('  export ALLOWED_USERS="your-user-id"'));
      console.log(chalk.yellow('  olympus telegram'));
      process.exit(1);
    }

    console.log(chalk.green('🤖 봇 시작 중...'));
    console.log(chalk.gray(`Gateway: ${gatewayUrl}`));
    console.log(chalk.gray(`Allowed users: ${allowedUsers.join(', ') || 'All'}`));
    console.log();

    // Dynamic import to run the bot
    try {
      await import('@olympus-dev/telegram-bot');
    } catch (err) {
      console.error(chalk.red('봇 시작 실패:'), (err as Error).message);
      process.exit(1);
    }
  });
