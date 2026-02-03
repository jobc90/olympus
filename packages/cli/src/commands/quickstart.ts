import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import {
  loadConfig,
  updateConfig,
  getConfigPath,
} from '@olympus-dev/gateway';

function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function ask(rl: ReturnType<typeof createPrompt>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export const quickstartCommand = new Command('quickstart')
  .description('Quick setup: Configure and start Olympus with Telegram bot')
  .action(async () => {
    console.log(chalk.cyan.bold('\n⚡ Olympus Quickstart\n'));
    console.log(chalk.white('이 마법사를 통해 Olympus를 빠르게 설정하고 시작합니다.\n'));

    const config = loadConfig();
    const rl = createPrompt();

    try {
      // Check if Telegram is already configured
      if (config.telegram?.token && config.telegram.allowedUsers.length > 0) {
        console.log(chalk.green('✓ Telegram 설정이 이미 완료되어 있습니다.'));
        console.log(chalk.gray(`  Token: ${config.telegram.token.slice(0, 20)}...`));
        console.log(chalk.gray(`  Users: ${config.telegram.allowedUsers.join(', ')}`));
        console.log();

        const useExisting = await ask(rl, '기존 설정으로 시작할까요? (Y/n): ');
        if (useExisting.toLowerCase() !== 'n') {
          rl.close();
          await startOlympus(config);
          return;
        }
      }

      // Telegram setup instructions
      console.log(chalk.bold('📱 Telegram 봇 설정'));
      console.log();
      console.log(chalk.white('다음 단계를 따라 Telegram 봇을 만드세요:'));
      console.log();
      console.log(chalk.cyan('1. Telegram에서 @BotFather를 검색하여 채팅 시작'));
      console.log(chalk.gray('   https://t.me/BotFather'));
      console.log();
      console.log(chalk.cyan('2. /newbot 명령어 입력 후 봇 이름 설정'));
      console.log(chalk.gray('   예: "My Olympus Bot"'));
      console.log();
      console.log(chalk.cyan('3. 받은 토큰을 아래에 입력'));
      console.log(chalk.gray('   예: 1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ'));
      console.log();

      const token = await ask(rl, '봇 토큰: ');
      if (!token || !token.includes(':')) {
        console.log(chalk.red('❌ 올바른 토큰 형식이 아닙니다.'));
        rl.close();
        return;
      }

      console.log();
      console.log(chalk.bold('👤 사용자 ID 설정'));
      console.log();
      console.log(chalk.white('본인의 Telegram User ID를 확인하세요:'));
      console.log();
      console.log(chalk.cyan('1. Telegram에서 @userinfobot을 검색'));
      console.log(chalk.gray('   https://t.me/userinfobot'));
      console.log();
      console.log(chalk.cyan('2. 아무 메시지나 보내면 User ID가 표시됨'));
      console.log(chalk.gray('   예: Your user ID: 123456789'));
      console.log();

      const userId = await ask(rl, 'User ID (숫자): ');
      const userIdNum = parseInt(userId, 10);
      if (isNaN(userIdNum)) {
        console.log(chalk.red('❌ 올바른 숫자가 아닙니다.'));
        rl.close();
        return;
      }

      // Save config
      updateConfig({
        telegram: {
          token,
          allowedUsers: [userIdNum],
        },
      });

      console.log();
      console.log(chalk.green('✅ 설정 완료!'));
      console.log(chalk.gray(`   저장 위치: ${getConfigPath()}`));
      console.log();

      rl.close();

      // Start Olympus
      await startOlympus(loadConfig());
    } catch (err) {
      console.error(chalk.red('오류:'), (err as Error).message);
      rl.close();
      process.exit(1);
    }
  });

async function startOlympus(config: ReturnType<typeof loadConfig>) {
  const chalk = (await import('chalk')).default;

  console.log(chalk.cyan.bold('\n🚀 Olympus 시작 중...\n'));

  // Set environment variables
  if (config.telegram) {
    process.env.TELEGRAM_BOT_TOKEN = config.telegram.token;
    process.env.ALLOWED_USERS = config.telegram.allowedUsers.join(',');
  }
  process.env.OLYMPUS_GATEWAY_URL = config.gatewayUrl;
  process.env.OLYMPUS_API_KEY = config.apiKey;

  // Import and start Gateway
  const { Gateway } = await import('@olympus-dev/gateway');

  const gateway = new Gateway({
    host: config.gatewayHost,
    port: config.gatewayPort,
  });

  await gateway.start();

  console.log(chalk.green('✓ Gateway 시작됨'));
  console.log(chalk.gray(`  URL: http://${config.gatewayHost}:${config.gatewayPort}`));

  // Start Telegram bot
  if (config.telegram) {
    console.log(chalk.yellow('\n🤖 Telegram 봇 연결 중...'));

    try {
      await import('@olympus-dev/telegram-bot');
      console.log(chalk.green('✓ Telegram 봇 시작됨'));
    } catch (err) {
      console.log(chalk.red(`✗ Telegram 봇 실패: ${(err as Error).message}`));
    }
  }

  console.log(chalk.cyan.bold('\n✨ 준비 완료!\n'));
  console.log(chalk.white('다음 단계:'));
  console.log(chalk.yellow('  1. Telegram에서 봇에게 /start 메시지 보내기'));
  console.log(chalk.yellow('  2. /health 명령어로 연결 상태 확인'));
  console.log(chalk.yellow('  3. /run <프롬프트>로 작업 실행'));
  console.log();
  console.log(chalk.gray('종료: Ctrl+C'));

  // Keep running
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\nShutting down...'));
    gateway.stop();
    process.exit(0);
  });
}
