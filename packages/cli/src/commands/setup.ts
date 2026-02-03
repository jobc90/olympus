import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import {
  loadConfig,
  updateConfig,
  getConfigPath,
  isTelegramConfigured,
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

async function askWithDefault(
  rl: ReturnType<typeof createPrompt>,
  question: string,
  defaultValue: string
): Promise<string> {
  const answer = await ask(rl, `${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

export const setupCommand = new Command('setup')
  .description('Interactive setup wizard for Olympus')
  .option('--telegram', 'Configure Telegram bot only')
  .option('--reset', 'Reset all configuration to defaults')
  .action(async (opts) => {
    console.log(chalk.cyan.bold('\n⚡ Olympus Setup Wizard\n'));

    const rl = createPrompt();
    const config = loadConfig();

    try {
      if (opts.reset) {
        console.log(chalk.yellow('Resetting configuration...'));
        updateConfig({
          gatewayHost: '127.0.0.1',
          gatewayPort: 18790,
          gatewayUrl: 'http://127.0.0.1:18790',
          telegram: undefined,
        });
        console.log(chalk.green('✓ Configuration reset to defaults'));
        console.log(chalk.gray(`  Config file: ${getConfigPath()}`));
        rl.close();
        return;
      }

      if (opts.telegram) {
        // Telegram only setup
        await setupTelegram(rl, config);
      } else {
        // Full setup
        console.log(chalk.white('이 마법사는 Olympus Gateway와 Telegram 봇을 설정합니다.\n'));

        // Step 1: Gateway settings
        console.log(chalk.bold('1. Gateway 설정'));
        console.log(chalk.gray('   로컬에서만 사용: 127.0.0.1'));
        console.log(chalk.gray('   같은 네트워크에서 접속: 0.0.0.0'));

        const host = await askWithDefault(rl, '   Host', config.gatewayHost);
        const portStr = await askWithDefault(rl, '   Port', String(config.gatewayPort));
        const port = parseInt(portStr, 10);

        updateConfig({
          gatewayHost: host,
          gatewayPort: port,
          gatewayUrl: `http://${host}:${port}`,
        });

        console.log(chalk.green('   ✓ Gateway 설정 완료\n'));

        // Step 2: Telegram setup (optional)
        console.log(chalk.bold('2. Telegram 봇 설정 (선택)'));
        console.log(chalk.gray('   외부에서 접속하려면 Telegram 봇이 필요합니다.'));

        const setupTg = await ask(rl, '   Telegram 봇을 설정하시겠습니까? (y/N): ');

        if (setupTg.toLowerCase() === 'y') {
          await setupTelegram(rl, loadConfig());
        } else {
          console.log(chalk.gray('   Telegram 설정 건너뜀\n'));
        }
      }

      // Summary
      const finalConfig = loadConfig();
      console.log(chalk.cyan.bold('\n📋 설정 완료!\n'));
      console.log(chalk.white('Gateway:'));
      console.log(chalk.gray(`  URL: ${finalConfig.gatewayUrl}`));
      console.log(chalk.gray(`  API Key: ${finalConfig.apiKey}`));

      if (finalConfig.telegram) {
        console.log(chalk.white('\nTelegram:'));
        console.log(chalk.gray(`  Token: ${finalConfig.telegram.token.slice(0, 20)}...`));
        console.log(chalk.gray(`  Users: ${finalConfig.telegram.allowedUsers.join(', ')}`));
      }

      console.log(chalk.white('\n다음 단계:'));

      if (finalConfig.telegram) {
        console.log(chalk.yellow('  olympus start'));
        console.log(chalk.gray('  → Gateway + Telegram 봇 동시 시작\n'));
      } else {
        console.log(chalk.yellow('  olympus gateway'));
        console.log(chalk.gray('  → Gateway 시작\n'));
      }

      console.log(chalk.gray(`Config: ${getConfigPath()}`));
    } finally {
      rl.close();
    }
  });

async function setupTelegram(
  rl: ReturnType<typeof createPrompt>,
  config: ReturnType<typeof loadConfig>
) {
  console.log(chalk.white('\nTelegram 봇 설정 방법:'));
  console.log(chalk.gray('  1. Telegram에서 @BotFather에게 /newbot 명령'));
  console.log(chalk.gray('  2. 봇 이름 설정 후 토큰 받기'));
  console.log(chalk.gray('  3. @userinfobot에게 메시지 보내서 본인 User ID 확인\n'));

  const existingToken = config.telegram?.token;
  const existingUsers = config.telegram?.allowedUsers?.join(', ');

  let token: string;
  if (existingToken) {
    const useExisting = await ask(
      rl,
      `   기존 토큰 사용? (${existingToken.slice(0, 20)}...) (Y/n): `
    );
    if (useExisting.toLowerCase() !== 'n') {
      token = existingToken;
    } else {
      token = await ask(rl, '   Bot Token: ');
    }
  } else {
    token = await ask(rl, '   Bot Token: ');
  }

  if (!token) {
    console.log(chalk.red('   ✗ 토큰이 필요합니다.'));
    return;
  }

  let usersStr: string;
  if (existingUsers) {
    usersStr = await askWithDefault(rl, '   Allowed User IDs (쉼표로 구분)', existingUsers);
  } else {
    usersStr = await ask(rl, '   Allowed User IDs (쉼표로 구분): ');
  }

  const allowedUsers = usersStr
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (allowedUsers.length === 0) {
    console.log(chalk.red('   ✗ 최소 하나의 User ID가 필요합니다.'));
    return;
  }

  updateConfig({
    telegram: {
      token,
      allowedUsers,
    },
  });

  console.log(chalk.green('   ✓ Telegram 설정 완료\n'));
}
