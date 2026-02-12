/**
 * Claude CLI Wrapper
 *
 * Olympus의 핵심: Claude CLI를 그대로 실행하되 브랜딩만 Olympus로 표시
 */

import { spawn } from 'child_process';
import { which } from './utils/which.js';

const OLYMPUS_BANNER = `\x1b[90m⚡ Olympus\x1b[0m\n`;

/**
 * Launch Claude CLI in passthrough mode
 * All Claude CLI features work as-is
 */
export async function launchClaude(args: string[] = []): Promise<void> {
  // Show Olympus banner
  console.log(OLYMPUS_BANNER);

  // Find claude CLI
  const claudePath = await which('claude');

  if (!claudePath) {
    console.error('\x1b[31mError: Claude CLI not found.\x1b[0m');
    console.error('Install it with: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  // Spawn claude with PTY passthrough (inherit stdio)
  const child = spawn(claudePath, args, {
    stdio: 'inherit',
    shell: false,
  });

  // Forward signals
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  // Wait for claude to exit
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        process.exit(code);
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start Claude CLI:', err.message);
      reject(err);
    });
  });
}
