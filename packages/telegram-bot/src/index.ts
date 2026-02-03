import { Telegraf, Context, Markup } from 'telegraf';
import WebSocket from 'ws';
import {
  parseMessage,
  createMessage,
  type PhasePayload,
  type AgentPayload,
  type TaskPayload,
  type LogPayload,
  type RunStatus,
} from '@olympus-dev/protocol';

// Configuration
interface BotConfig {
  telegramToken: string;
  gatewayUrl: string;
  apiKey: string;
  allowedUsers: number[]; // Telegram user IDs allowed to use the bot
}

// Load config from environment (set by CLI's start command or manually)
function loadConfig(): BotConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const gatewayUrl = process.env.OLYMPUS_GATEWAY_URL ?? 'http://127.0.0.1:18790';
  const apiKey = process.env.OLYMPUS_API_KEY ?? '';
  const allowedUsers = process.env.ALLOWED_USERS?.split(',').map(Number).filter(n => !isNaN(n)) ?? [];

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is required');
    console.error('');
    console.error('쉬운 설정 방법:');
    console.error('  1. olympus setup --telegram');
    console.error('  2. olympus start');
    console.error('');
    console.error('수동 설정:');
    console.error('  1. @BotFather에서 봇 생성 후 토큰 받기');
    console.error('  2. @userinfobot에서 User ID 확인');
    console.error('  3. export TELEGRAM_BOT_TOKEN="your-token"');
    console.error('  4. export ALLOWED_USERS="123456789"');
    console.error('  5. export OLYMPUS_API_KEY="oly_xxx"');
    process.exit(1);
  }

  return { telegramToken: token, gatewayUrl, apiKey, allowedUsers };
}

class OlympusBot {
  private bot: Telegraf;
  private config: BotConfig;
  private ws: WebSocket | null = null;
  private subscribedRuns = new Map<string, number>(); // runId -> chatId
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(config: BotConfig) {
    this.config = config;
    this.bot = new Telegraf(config.telegramToken);
    this.setupCommands();
  }

  private isAllowed(ctx: Context): boolean {
    const userId = ctx.from?.id;
    if (!userId) return false;
    if (this.config.allowedUsers.length === 0) return true; // No restriction
    return this.config.allowedUsers.includes(userId);
  }

  private setupCommands() {
    // Auth middleware
    this.bot.use(async (ctx, next) => {
      if (!this.isAllowed(ctx)) {
        await ctx.reply('⛔ 접근 권한이 없습니다. ALLOWED_USERS에 등록되지 않았습니다.');
        return;
      }
      return next();
    });

    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        `⚡ *Olympus Bot*\n\n` +
        `AI 개발 플랫폼을 원격으로 제어합니다.\n\n` +
        `*명령어:*\n` +
        `/run <prompt> - 새 작업 실행\n` +
        `/runs - 실행 중인 작업 목록\n` +
        `/status <runId> - 작업 상태 확인\n` +
        `/cancel <runId> - 작업 취소\n` +
        `/health - Gateway 상태 확인\n\n` +
        `Gateway: ${this.config.gatewayUrl}`,
        { parse_mode: 'Markdown' }
      );
    });

    // /health - Check gateway health
    this.bot.command('health', async (ctx) => {
      try {
        const res = await fetch(`${this.config.gatewayUrl}/healthz`);
        const data = await res.json() as { status: string; uptime: number };
        const wsStatus = this.isConnected ? '✅ 연결됨' : '❌ 연결 끊김';
        await ctx.reply(
          `✅ Gateway 정상\n\n` +
          `상태: ${data.status}\n` +
          `가동시간: ${Math.floor(data.uptime / 60)}분\n` +
          `WebSocket: ${wsStatus}`
        );
      } catch (err) {
        await ctx.reply(`❌ Gateway 연결 실패\n${(err as Error).message}`);
      }
    });

    // /runs - List runs
    this.bot.command('runs', async (ctx) => {
      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/runs`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json() as { runs: RunStatus[] };

        if (data.runs.length === 0) {
          await ctx.reply('📭 실행 중인 작업이 없습니다.');
          return;
        }

        let msg = '📋 *작업 목록*\n\n';
        for (const run of data.runs) {
          const statusIcon = run.status === 'running' ? '🔄' :
                            run.status === 'completed' ? '✅' : '❌';
          msg += `${statusIcon} \`${run.runId}\`\n`;
          msg += `   ${run.prompt.slice(0, 50)}${run.prompt.length > 50 ? '...' : ''}\n`;
          msg += `   Phase ${run.phase}: ${run.phaseName}\n\n`;
        }

        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`❌ 목록 조회 실패: ${(err as Error).message}`);
      }
    });

    // /run <prompt> - Create new run
    this.bot.command('run', async (ctx) => {
      const prompt = ctx.message.text.replace(/^\/run\s*/, '').trim();

      if (!prompt) {
        await ctx.reply('사용법: /run <프롬프트>\n\n예: /run TypeScript 코드 분석해줘');
        return;
      }

      const statusMsg = await ctx.reply('🚀 작업 시작 중...');

      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            prompt,
            agents: ['gemini', 'gpt'],
          }),
        });

        if (!res.ok) {
          const error = await res.json() as { message: string };
          throw new Error(error.message);
        }

        const data = await res.json() as { runId: string };

        // Subscribe to this run's events
        this.subscribeToRun(data.runId, ctx.chat.id);

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `✅ 작업 시작됨\n\n` +
          `Run ID: \`${data.runId}\`\n` +
          `프롬프트: ${prompt.slice(0, 100)}\n\n` +
          `실시간 업데이트를 받습니다...`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ 작업 시작 실패: ${(err as Error).message}`
        );
      }
    });

    // /status <runId> - Get run status
    this.bot.command('status', async (ctx) => {
      const runId = ctx.message.text.replace(/^\/status\s*/, '').trim();

      if (!runId) {
        await ctx.reply('사용법: /status <runId>');
        return;
      }

      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/runs/${runId}`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });

        if (!res.ok) {
          if (res.status === 404) {
            await ctx.reply(`❌ Run \`${runId}\` 를 찾을 수 없습니다.`, { parse_mode: 'Markdown' });
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const run = await res.json() as RunStatus;
        const statusIcon = run.status === 'running' ? '🔄' :
                          run.status === 'completed' ? '✅' : '❌';

        let msg = `${statusIcon} *Run ${run.runId}*\n\n`;
        msg += `상태: ${run.status}\n`;
        msg += `Phase: ${run.phase} (${run.phaseName})\n`;
        msg += `프롬프트: ${run.prompt.slice(0, 100)}\n\n`;

        if (run.tasks.length > 0) {
          msg += '*Tasks:*\n';
          for (const task of run.tasks) {
            const icon = task.status === 'completed' ? '✅' :
                        task.status === 'in_progress' ? '🔄' :
                        task.status === 'failed' ? '❌' : '⏳';
            msg += `${icon} ${task.subject}\n`;
          }
        }

        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`❌ 상태 조회 실패: ${(err as Error).message}`);
      }
    });

    // /cancel <runId> - Cancel run
    this.bot.command('cancel', async (ctx) => {
      const runId = ctx.message.text.replace(/^\/cancel\s*/, '').trim();

      if (!runId) {
        await ctx.reply('사용법: /cancel <runId>');
        return;
      }

      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/runs/${runId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });

        if (!res.ok) {
          const error = await res.json() as { message: string };
          throw new Error(error.message);
        }

        await ctx.reply(`🛑 Run \`${runId}\` 취소됨`, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`❌ 취소 실패: ${(err as Error).message}`);
      }
    });

    // Handle text messages as prompts
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // If it starts with /, it's an unknown command
      if (text.startsWith('/')) {
        await ctx.reply('알 수 없는 명령어입니다. /start 로 도움말을 확인하세요.');
        return;
      }

      // Treat as run prompt
      await ctx.reply(
        `💡 이 메시지로 작업을 실행하시겠습니까?\n\n"${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`,
        Markup.inlineKeyboard([
          Markup.button.callback('✅ 실행', `run:${ctx.message.message_id}`),
          Markup.button.callback('❌ 취소', 'cancel_prompt'),
        ])
      );
    });

    // Callback: Run from inline button
    this.bot.action(/^run:(\d+)$/, async (ctx) => {
      const messageId = parseInt(ctx.match[1]);
      // @ts-ignore - accessing message
      const originalMessage = ctx.callbackQuery.message?.reply_to_message;

      await ctx.answerCbQuery('작업 시작 중...');

      // Get the original text (this is a workaround - in production you'd store it)
      await ctx.reply('작업을 시작하려면 /run <프롬프트> 명령어를 사용해주세요.');
    });

    this.bot.action('cancel_prompt', async (ctx) => {
      await ctx.answerCbQuery('취소됨');
      await ctx.deleteMessage();
    });
  }

  private connectWebSocket() {
    const wsUrl = this.config.gatewayUrl.replace('http', 'ws') + '/ws';

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket connection failed:', (err as Error).message);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log('WebSocket connected');

      // Send connect message
      this.ws?.send(JSON.stringify(createMessage('connect', {
        clientType: 'telegram-bot',
        protocolVersion: '0.2.0',
        apiKey: this.config.apiKey,
      })));

      // Re-subscribe to all runs
      for (const runId of this.subscribedRuns.keys()) {
        this.ws?.send(JSON.stringify(createMessage('subscribe', { runId })));
      }

      // Start ping interval to keep connection alive
      this.startPing();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = parseMessage(data.toString());
        if (!msg) return;

        // Handle pong (keep-alive response)
        if (msg.type === 'pong') {
          return;
        }

        this.handleWebSocketMessage(msg);
      } catch (err) {
        console.error('Error parsing WebSocket message:', (err as Error).message);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      console.log(`WebSocket disconnected (code: ${code})`);
      this.stopPing();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  }

  private startPing() {
    this.stopPing();
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(createMessage('ping', {})));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    console.log('Reconnecting in 5s...');
    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
  }

  private handleWebSocketMessage(msg: { type: string; payload: unknown }) {
    const payload = msg.payload as { runId?: string };
    const runId = payload.runId;

    if (!runId) return;

    const chatId = this.subscribedRuns.get(runId);
    if (!chatId) return;

    switch (msg.type) {
      case 'phase:change': {
        const p = payload as PhasePayload;
        if (p.status === 'completed') {
          this.bot.telegram.sendMessage(
            chatId,
            `📍 *Phase ${p.phase} 완료*: ${p.phaseName}`,
            { parse_mode: 'Markdown' }
          ).catch(console.error);
        }
        break;
      }

      case 'agent:complete': {
        const a = payload as AgentPayload;
        this.bot.telegram.sendMessage(
          chatId,
          `✅ *${a.agentId}* 완료\n\n${(a.content ?? '').slice(0, 500)}${(a.content?.length ?? 0) > 500 ? '...' : ''}`,
          { parse_mode: 'Markdown' }
        ).catch(console.error);
        break;
      }

      case 'agent:error': {
        const a = payload as AgentPayload;
        this.bot.telegram.sendMessage(
          chatId,
          `❌ *${a.agentId}* 오류\n\n${a.error}`,
          { parse_mode: 'Markdown' }
        ).catch(console.error);
        break;
      }

      case 'run:complete': {
        this.bot.telegram.sendMessage(
          chatId,
          `🎉 *작업 완료!*\n\nRun ID: \`${runId}\``,
          { parse_mode: 'Markdown' }
        ).catch(console.error);
        // Unsubscribe from completed run
        this.subscribedRuns.delete(runId);
        break;
      }

      case 'log': {
        const l = payload as LogPayload;
        if (l.level === 'error') {
          this.bot.telegram.sendMessage(chatId, `⚠️ ${l.message}`).catch(console.error);
        }
        break;
      }
    }
  }

  private subscribeToRun(runId: string, chatId: number) {
    this.subscribedRuns.set(runId, chatId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(createMessage('subscribe', { runId })));
    }
  }

  async start() {
    // Connect to Gateway WebSocket
    this.connectWebSocket();

    // Start Telegram bot
    console.log('Starting Olympus Telegram Bot...');
    console.log(`Gateway: ${this.config.gatewayUrl}`);
    console.log(`Allowed users: ${this.config.allowedUsers.length > 0 ? this.config.allowedUsers.join(', ') : 'All'}`);

    await this.bot.launch();
    console.log('Bot started! Send /start to begin.');

    // Graceful shutdown
    process.once('SIGINT', () => this.stop('SIGINT'));
    process.once('SIGTERM', () => this.stop('SIGTERM'));
  }

  private stop(signal: string) {
    console.log(`\nReceived ${signal}, shutting down...`);
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.bot.stop(signal);
  }
}

// Main
const config = loadConfig();
const bot = new OlympusBot(config);
bot.start();
