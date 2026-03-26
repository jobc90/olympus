import { Telegraf, Context } from 'telegraf';
import { homedir } from 'os';
import { InlineQueryResult } from 'telegraf/types';
import WebSocket from 'ws';
import {
  parseMessage,
  createMessage,
} from '@olympus-dev/protocol';
import { classifyError, structuredLog } from './error-utils.js';
import { TelegramSecurity } from './security.js';
import type { FilterResult, FilterStage } from '@olympus-dev/protocol';
import { TELEGRAM_FILTER_CONFIG } from '@olympus-dev/protocol';

// --- Lightweight Telegram filter (mirrors gateway/response-filter.ts) ---
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\)?|\([A-Z0-9]|[NO].)/g;

const SYSTEM_MARKER_PATTERNS = [
  /^⏺\s*/,
  /HEARTBEAT(?:_OK)?/,
  /^\[(?:SYSTEM|DEBUG|INTERNAL)\]/i,
  /^(?:Compiling|Building|Bundling)\.\.\./i,
  /^\s*\[\d+\/\d+\]\s+/,
];

const TUI_ARTIFACT_PATTERNS = [
  /^[✢✳✶✻✽·\s]+$/,
  /^\(thinking\)\s*$/i,
  /\(thinking\)/i,
  /Flowing…?\s*$/,
  /Forming…?\s*$/i,
  /Deliberating…?\s*$/i,
  /Topsy-turvying…?\s*$/i,
  /^\([\dm\s]+s?\s*[·•]\s*↓/,
  /^\(\d+s?\s*[·•]\s*timeout\s+\d+m\)\s*$/i,
  /ctrl\+o\s*to\s*expand/i,
  /shift\+tab\s*to\s*cycle/i,
  /bypass\s*permissions?\s*on/i,
  /↓\s*[\d.]+k?\s*tokens?/i,
  /\d+K?\/\d+K?\s*tokens?/i,
  /[│|].*gemini.*preview/i,
  /[│|].*gpt-[\w.-]+/i,
  /🤖\s*(?:Opus|Sonnet|Haiku)/i,
  /[█▓▒░]{2,}\s*\d+%/,
  /^\s*[A-Za-z]\s*$/,
  /^\s*\d{1,5}\s*$/,
  /^[✢✳✶✻✽·]?\s*[A-Za-z][A-Za-z-]{2,24}…(?:\s*\(thinking\))?$/i,
  /^[✢✳✶✻✽·]?\s*(?:Processing|Forming|Flowing|Deliberating|Effecting|Thinking)…?(?:\s*thinking)?\s*$/i,
  /^[✢✳✶✻✽·]?\s*[A-Za-z][A-Za-z-]{2,24}…?thinking\s*$/i,
  /^[✢✳✶✻✽·]?\s*[A-Za-z][A-Za-z-]{2,24}…?\(thought[^)]*\)\s*$/i,
  /tip:\s*run\s*claude\s*--(?:continue|resume)/i,
  /^[-─═]{3,}\s*$/,
  /^\s*\d+\s*[│|]\s*$/,
];

function filterForTelegram(text: string): FilterResult {
  const originalLength = text.length;
  const stagesApplied: FilterStage[] = [];
  const removedMarkers: string[] = [];
  let result = text;

  for (const stage of TELEGRAM_FILTER_CONFIG.enabledStages) {
    const before = result;
    switch (stage) {
      case 'ansi_strip':
        result = result.replace(ANSI_RE, '');
        break;
      case 'marker_removal': {
        const lines = result.split('\n');
        const filtered = lines.filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return true;
          for (const pat of SYSTEM_MARKER_PATTERNS) {
            if (pat.test(trimmed)) { removedMarkers.push(trimmed.slice(0, 50)); return false; }
          }
          return true;
        });
        // Collapse excessive blank lines
        result = filtered.join('\n').replace(/(\n\s*){3,}/g, '\n\n');
        break;
      }
      case 'tui_artifact': {
        const lines = result.split('\n');
        result = lines.filter(line => {
          for (const pat of TUI_ARTIFACT_PATTERNS) {
            if (pat.test(line)) { removedMarkers.push(`[TUI] ${line.trim().slice(0, 30)}`); return false; }
          }
          return true;
        }).join('\n');
        break;
      }
      case 'truncation': {
        const maxLen = TELEGRAM_FILTER_CONFIG.telegramMaxLength;
        if (maxLen > 0 && result.length > maxLen) {
          let cutPoint = maxLen;
          const lineEnd = result.lastIndexOf('\n', cutPoint);
          if (lineEnd > cutPoint * 0.8) cutPoint = lineEnd;
          result = result.slice(0, cutPoint).trimEnd() + '\n\n... (truncated)';
        }
        break;
      }
      case 'markdown_format': {
        const backtickCount = (result.match(/```/g) || []).length;
        if (backtickCount % 2 !== 0) result += '\n```';
        break;
      }
    }
    if (result !== before) stagesApplied.push(stage);
  }

  return { text: result, originalLength, truncated: result.length < originalLength && TELEGRAM_FILTER_CONFIG.enabledStages.includes('truncation'), stagesApplied, removedMarkers };
}

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
  const gatewayUrl = process.env.OLYMPUS_GATEWAY_URL ?? 'http://127.0.0.1:8200';
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

  if (allowedUsers.length === 0) {
    console.warn('[Telegram Bot] ⚠️  ALLOWED_USERS가 설정되지 않았습니다.');
    console.warn('  모든 사용자의 명령이 거부됩니다. User ID를 확인하세요:');
    console.warn('  Telegram에서 @userinfobot 검색 → /start → ID 확인');
    console.warn('  export ALLOWED_USERS="<your-telegram-user-id>"');
  }

  return { telegramToken: token, gatewayUrl, apiKey, allowedUsers };
}

// Telegram message limit (with some margin for safety)
const TELEGRAM_MSG_LIMIT = 4000;

function splitLongMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  return chunks;
}

/** UTF-8 safe text truncation (handles surrogate pairs correctly) */
function safeSlice(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  return chars.slice(0, maxLength).join('');
}

class OlympusBot {
  private static readonly COMMAND_MENU = [
    { command: 'start', description: '시작 화면' },
    { command: 'help', description: '사용법 안내' },
    { command: 'workers', description: '연결된 워커 목록' },
    { command: 'tasks', description: '진행 중인 작업' },
    { command: 'health', description: '시스템 상태' },
  ] as const;

  private bot: Telegraf;
  private config: BotConfig;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  // Pending RPC calls (requestId -> resolve/reject)
  private pendingRpc = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private static readonly RPC_TIMEOUT_MS = 30000;
  // Security module (3-layer: DM/Group/Command)
  private security: TelegramSecurity;
  // WI-4.5: Timestamp of last seen worker task for catch-up after reconnect
  private lastSeenTaskTimestamp = Date.now();

  constructor(config: BotConfig) {
    this.config = config;
    this.bot = new Telegraf(config.telegramToken, { handlerTimeout: 1_800_000 });  // 30분
    this.security = new TelegramSecurity(TelegramSecurity.fromEnv());
    this.setupCommands();
  }

  private async isAllowed(ctx: Context): Promise<boolean> {
    const userId = ctx.from?.id;
    if (!userId) return false;
    const chatId = ctx.chat?.id ?? 0;
    const chatType = (ctx.chat?.type ?? 'private') as 'private' | 'group' | 'supergroup' | 'channel';

    // WI-4.1: Extract actual command from message text
    const msg = (ctx as any).message;
    const command = msg?.text?.startsWith('/') ? msg.text.split(/\s/)[0].slice(1).split('@')[0] : undefined;

    const botMentioned = this.isBotMentioned(ctx);

    // WI-4.2: Detect admin status in group/supergroup chats
    let isAdmin = false;
    if (chatType === 'group' || chatType === 'supergroup') {
      try {
        const member = await ctx.telegram.getChatMember(chatId, userId);
        isAdmin = ['creator', 'administrator'].includes(member.status);
      } catch { /* ignore */ }
    }

    const decision = this.security.authorize({ userId, chatId, chatType, command, isAdmin, botMentioned });
    return decision.allowed;
  }

  private isBotMentioned(ctx: Context): boolean {
    const msg = (ctx as any).message;
    if (!msg?.entities || !msg?.text) return false;
    const botUsername = this.bot.botInfo?.username;
    if (!botUsername) return false;
    return msg.entities.some((e: any) =>
      e.type === 'mention' && msg.text.slice(e.offset, e.offset + e.length) === `@${botUsername}`
    );
  }

  private async fetchWorkersForStart(): Promise<Array<{ name: string; status: string; projectPath: string }>> {
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/workers`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) return [];
      const data = await res.json() as { workers: Array<{ name: string; status: string; projectPath: string }> };
      return data.workers ?? [];
    } catch {
      return [];
    }
  }

  private buildStartMessage(workers: Array<{ name: string; status: string; projectPath: string }>): string {
    let msg = `⚡ *Olympus*\n\n`;

    if (workers.length > 0) {
      for (const w of workers) {
        const icon = w.status === 'idle' ? '🟢' : w.status === 'busy' ? '🔴' : '⚫';
        const shortPath = w.projectPath.replace(homedir(), '~');
        msg += `${icon} \`@${w.name}\` — \`${shortPath}\`\n`;
      }
      msg += '\n';

      const exampleWorker = workers.find(w => w.status === 'idle')?.name ?? workers[0].name;
      msg += `*워커에게 지시하기*\n`;
      msg += `\`@${exampleWorker} 최근 변경사항 요약해줘\`\n`;
      msg += `\`@${exampleWorker} team API 엔드포인트 추가\`\n\n`;

      msg += `/workers — 워커 목록 · /help — 사용법`;
    } else {
      msg += `워커가 없습니다. 터미널에서 직접 실행하세요:\n`;
      msg += `\`olympus start-trust\`\n\n`;
      msg += `워커가 등록되면 \`@워커이름 작업내용\`으로 지시할 수 있습니다.\n\n`;
      msg += `/help — 사용법 안내`;
    }

    return msg;
  }

  private buildHelpMessage(
    _chatId: number,
    workers: Array<{ name: string; status: string; projectPath: string }>,
  ): string {
    const exampleWorker = workers[0]?.name ?? 'hub';

    let msg = `📘 *사용법*\n\n`;

    msg += `*1. 일반 채팅 — Codex와 대화*\n`;
    msg += `메시지를 그냥 입력하면 Codex가 응답합니다.\n`;
    msg += `\`전체 프로젝트 상태 알려줘\`\n\n`;

    msg += `*2. 워커에게 작업 지시*\n`;
    msg += `\`@워커이름 작업내용\` 형식으로 입력하면\n`;
    msg += `Codex가 해당 워커에게 작업을 할당합니다.\n`;
    msg += `\`@${exampleWorker} 빌드하고 테스트 돌려줘\`\n`;
    msg += `\`@${exampleWorker} 최근 변경사항 요약해줘\`\n\n`;

    msg += `*3. 팀 프로토콜 실행*\n`;
    msg += `\`@워커이름 team 작업내용\` 형식으로 입력하면\n`;
    msg += `팀 프로토콜(병렬 에이전트)로 작업을 실행합니다.\n`;
    msg += `\`@${exampleWorker} team API 엔드포인트 추가하고 테스트 작성\`\n\n`;

    msg += `*편의 명령어*\n`;
    msg += `/workers — 연결된 워커 목록 (탭으로 @멘션 복사)\n`;
    msg += `/tasks — 현재 진행 중인 작업\n`;
    msg += `/health — 시스템 상태`;

    return msg;
  }

  private async sendStartGuide(chatId: number): Promise<void> {
    const workers = await this.fetchWorkersForStart();
    const msg = this.buildStartMessage(workers);
    try {
      await this.bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch {
      await this.bot.telegram.sendMessage(chatId, msg);
    }
  }

  private async sendHelpGuide(chatId: number): Promise<void> {
    const workers = await this.fetchWorkersForStart();
    const msg = this.buildHelpMessage(chatId, workers);
    try {
      await this.bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch {
      await this.bot.telegram.sendMessage(chatId, msg);
    }
  }

  private buildUnknownCommandMessage(text: string): string {
    const command = text.slice(1).split(/\s+/)[0].split('@')[0].toLowerCase();
    const suggestions: string[] = [];

    if (command.startsWith('w')) suggestions.push('/workers');
    if (command.startsWith('h')) suggestions.push('/help', '/health');
    if (command.startsWith('t')) suggestions.push('/tasks');

    for (const fallback of ['/help', '/workers']) {
      if (!suggestions.includes(fallback)) suggestions.push(fallback);
      if (suggestions.length >= 2) break;
    }

    return (
      `\`${text.split(/\s+/)[0]}\` — 없는 명령어입니다.\n\n` +
      `혹시? ${suggestions.slice(0, 2).map(v => `\`${v}\``).join('  ')}\n` +
      `/help — 사용법 확인`
    );
  }

  private async registerBotCommands(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(
        OlympusBot.COMMAND_MENU.map(cmd => ({ command: cmd.command, description: cmd.description })),
      );
      structuredLog('info', 'telegram-bot', 'commands_registered', {
        count: OlympusBot.COMMAND_MENU.length,
      });
    } catch (err) {
      structuredLog('warn', 'telegram-bot', 'commands_register_failed', {
        error: (err as Error).message,
      });
    }
  }

  private setupCommands() {
    // Auth middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      const updateType = ctx.updateType;
      structuredLog('info', 'telegram-bot', 'update_received', { userId, updateType });

      if (!(await this.isAllowed(ctx))) {
        structuredLog('warn', 'telegram-bot', 'unauthorized_access', { userId });
        await ctx.reply('⛔ 접근 권한이 없습니다. ALLOWED_USERS에 등록되지 않았습니다.');
        return;
      }
      return next();
    });

    // Global error handler - catch all unhandled errors in update processing
    this.bot.catch((err: unknown, ctx: Context) => {
      const classified = classifyError(err);
      structuredLog('error', 'telegram-bot', 'unhandled_update_error', {
        category: classified.category,
        code: classified.code,
        message: classified.message,
        retryable: classified.retryable,
        chatId: ctx.chat?.id,
        updateId: ctx.update?.update_id,
      });

      // Try to notify user (fallback to plain text)
      const errorMsg = classified.retryable
        ? '⚠️ 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        : '❌ 오류가 발생했습니다. 지속되면 관리자에게 문의하세요.';

      try {
        ctx.reply(errorMsg).catch(() => {
          // Even plain text reply failed - give up notifying user
        });
      } catch {
        // ctx might be invalid
      }
    });

    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      await this.sendStartGuide(ctx.chat.id);
    });

    // /help - Full command guide
    this.bot.command('help', async (ctx) => {
      await this.sendHelpGuide(ctx.chat.id);
    });

    // /health - Check gateway health
    this.bot.command('health', async (ctx) => {
      try {
        const res = await fetch(`${this.config.gatewayUrl}/healthz`);
        const data = await res.json() as { status: string; uptime: number };
        const wsOk = this.isConnected;
        const uptimeMin = Math.floor(data.uptime / 60);
        const uptimeStr = uptimeMin >= 60 ? `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}m` : `${uptimeMin}m`;

        let msg = `✅ 정상 — 가동 ${uptimeStr}, WS ${wsOk ? '연결' : '끊김'}`;
        if (!wsOk || data.status !== 'ok') {
          msg = `⚠️ 점검 필요\n\n`;
          msg += `Gateway: ${data.status}\n`;
          msg += `WebSocket: ${wsOk ? '✅' : '❌ 끊김'}\n`;
          msg += `가동시간: ${uptimeStr}`;
          if (!wsOk) {
            msg += `\n\n💡 해결: \`olympus server stop && olympus server start\``;
          }
        }
        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(
          `❌ Gateway 연결 실패\n${(err as Error).message}\n\n💡 해결: \`olympus server start\``,
          { parse_mode: 'Markdown' }
        );
      }
    });


    // /tasks - Show active tasks
    this.bot.command('tasks', async (ctx) => {
      try {
        if (!this.isConnected) {
          await ctx.reply('❌ Gateway에 연결되지 않았습니다.');
          return;
        }

        const result = await this.rpc('codex.activeTasks', {}) as Array<{
          sessionId: string;
          task: string;
          startedAt: number;
        }>;

        if (!Array.isArray(result) || result.length === 0) {
          await ctx.reply('📭 현재 활성 작업이 없습니다.');
          return;
        }

        let msg = `📋 *활성 작업* (${result.length}개)\n─────────────────\n`;
        for (const task of result) {
          const elapsed = Math.round((Date.now() - task.startedAt) / 1000);
          msg += `🔵 \`${task.sessionId.slice(0, 8)}\`: ${task.task}\n    ⏱ ${elapsed}초 경과\n`;
        }
        await this.safeReply(ctx, msg, 'Markdown');
      } catch {
        // Codex RPC unavailable — fall back to showing busy workers
        try {
          const workersRes = await fetch(`${this.config.gatewayUrl}/api/workers`, {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(5_000),
          });
          if (workersRes.ok) {
            const { workers } = await workersRes.json() as { workers: Array<{ name: string; status: string; currentTaskPrompt?: string }> };
            const busyWorkers = workers.filter(w => w.status === 'busy');
            if (busyWorkers.length === 0) {
              await ctx.reply('📭 현재 진행 중인 작업이 없습니다.');
            } else {
              let msg = `📋 *진행 중인 작업* (${busyWorkers.length}개)\n─────────────────\n`;
              for (const w of busyWorkers) {
                msg += `🔴 *@${w.name}*`;
                if (w.currentTaskPrompt) msg += `: ${w.currentTaskPrompt.slice(0, 100)}`;
                msg += '\n';
              }
              await this.safeReply(ctx, msg, 'Markdown');
            }
          } else {
            await ctx.reply('❌ Gateway에 연결할 수 없습니다. olympus server start로 서버를 시작하세요.');
          }
        } catch {
          await ctx.reply('❌ 작업 목록을 가져올 수 없습니다.\nGateway가 실행 중인지 확인하세요: `olympus server start`', { parse_mode: 'Markdown' });
        }
      }
    });

    // /workers - List registered workers with @mention copy buttons
    this.bot.command('workers', async (ctx) => {
      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/workers`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
        const { workers } = await res.json() as { workers: Array<{ id: string; name: string; projectPath: string; status: string; registeredAt: number; currentTaskPrompt?: string }> };

        if (workers.length === 0) {
          await ctx.reply(
            '워커가 없습니다.\n\n' +
            '터미널에서 직접 실행하세요:\n' +
            '```\ncd ~/dev/프로젝트\nolympus start-trust\n```',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        let msg = `⚡ *워커* (${workers.length})\n`;
        msg += `버튼을 탭하면 @멘션이 입력창에 붙여넣어집니다.\n\n`;

        for (const w of workers) {
          const icon = w.status === 'idle' ? '🟢' : w.status === 'busy' ? '🔴' : '⚫';
          const shortPath = w.projectPath.replace(homedir(), '~');
          msg += `${icon} *${w.name}* — \`${shortPath}\`\n`;
          if (w.status === 'busy' && w.currentTaskPrompt) {
            msg += `  💬 ${w.currentTaskPrompt.slice(0, 60)}${w.currentTaskPrompt.length > 60 ? '...' : ''}\n`;
          }
          msg += '\n';
        }

        // Inline keyboard: one button per worker — tap to pre-fill @workerName in chat
        const keyboard = workers.map(w => [{
          text: `${w.status === 'idle' ? '🟢' : '🔴'} @${w.name}`,
          switch_inline_query_current_chat: `@${w.name} `,
        }]);

        await ctx.reply(msg, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      } catch (err) {
        await ctx.reply(`❌ 워커 목록 조회 실패: ${(err as Error).message}`);
      }
    });

    // Handle text messages — Codex chat or work delegation
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // Unknown commands
      if (text.startsWith('/')) {
        await this.safeReply(ctx, this.buildUnknownCommandMessage(text), 'Markdown');
        return;
      }

      // @worker mention — delegate to worker via Codex
      if (/^@\S+\s/.test(text)) {
        await this.handleDirectMessage(ctx, text);
        return;
      }

      // 모든 메시지 → Codex chat
      await ctx.sendChatAction('typing');

      try {
        const data = await this.submitCodexChat(text, ctx.chat.id);
        if (data.type === 'delegation') {
          // Show brief confirmation — detailed result arrives via worker:task:summary event
          const workerLabel = data.workerName ? `\`@${data.workerName}\`` : '워커';
          await this.safeReply(ctx, `🔄 ${workerLabel}에게 작업을 위임했습니다. 완료 시 결과를 알려드립니다.`, 'Markdown');
        } else if (data.response) {
          await this.sendLongMessage(ctx.chat.id, data.response);
        }
      } catch (err) {
        await this.safeReply(ctx, `오류: ${(err as Error).message}`, undefined);
      }
    });

    // Inline query handler - show available workers for @mention
    this.bot.on('inline_query', async (ctx) => {
      const query = ctx.inlineQuery.query;
      const results: InlineQueryResult[] = [];

      // Fetch workers from gateway
      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/workers`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          signal: AbortSignal.timeout(5_000),
        });
        const { workers } = await res.json() as { workers: Array<{ id: string; name: string; projectPath: string; status: string }> };

        for (const w of workers) {
          if (query && !w.name.toLowerCase().includes(query.toLowerCase())) {
            continue;
          }
          const statusIcon = w.status === 'idle' ? '🟢' : w.status === 'busy' ? '🔴' : '⚫';
          results.push({
            type: 'article',
            id: w.id,
            title: `${statusIcon} @${w.name}`,
            description: `${w.status === 'idle' ? '대기 중' : '작업 중'} — ${w.projectPath}`,
            input_message_content: {
              message_text: `@${w.name} `,
            },
          });
        }
      } catch {
        // Gateway unavailable — skip workers
      }

      if (results.length === 0) {
        results.push({
          type: 'article',
          id: 'no-workers',
          title: '워커 없음',
          description: 'olympus start로 워커를 시작하세요',
          input_message_content: {
            message_text: '/workers',
          },
        });
      }

      await ctx.answerInlineQuery(results, {
        cache_time: 5,
        is_personal: true,
      });
    });
  }

  /**
   * Safely reply to a Telegram message, falling back to plain text if Markdown fails
   */
  private async safeReply(ctx: Context, text: string, parseMode: 'Markdown' | 'HTML' | undefined = 'Markdown'): Promise<void> {
    try {
      await ctx.reply(text, parseMode ? { parse_mode: parseMode } : {});
    } catch {
      // Markdown parsing failed — retry without parse_mode (preserves all content)
      try {
        await ctx.reply(text);
      } catch (fallbackErr) {
        structuredLog('error', 'telegram-bot', 'reply_failed', {
          chatId: ctx.chat?.id,
          error: (fallbackErr as Error).message,
        });
      }
    }
  }

  /**
   * Safely edit a Telegram message, falling back to plain text if Markdown parse fails
   */
  private async safeEditMessage(chatId: number, msgId: number, text: string): Promise<void> {
    try {
      await this.bot.telegram.editMessageText(chatId, msgId, undefined, text, { parse_mode: 'Markdown' });
    } catch {
      // Markdown parsing failed — retry without parse_mode (preserves content integrity)
      try {
        await this.bot.telegram.editMessageText(chatId, msgId, undefined, text);
      } catch (fallbackErr) {
        structuredLog('error', 'telegram-bot', 'edit_message_failed', {
          chatId,
          error: (fallbackErr as Error).message,
        });
      }
    }
  }

  /**
   * Get active session name, or first connected session if none active
   */
  private formatAge(createdAt: number): string {
    const diff = Date.now() - createdAt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return `${mins}분 전 시작`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전 시작`;
    return `${Math.floor(hours / 24)}일 전 시작`;
  }

  private async submitCodexChat(message: string, chatId: number): Promise<
    | { type: 'delegation'; workerName?: string }
    | { type: 'chat'; response: string }
  > {
    const chatRes = await fetch(`${this.config.gatewayUrl}/api/codex/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ message, chatId, source: 'telegram' }),
      signal: AbortSignal.timeout(1_800_000),
    });

    if (!chatRes.ok) {
      let detail = `Codex chat failed: ${chatRes.status}`;
      try {
        const payload = await chatRes.json() as { error?: string; message?: string };
        detail = payload.message ?? payload.error ?? detail;
      } catch {
        // Keep status-based fallback message.
      }
      throw new Error(detail);
    }

    const data = await chatRes.json() as { type: string; response?: string; workerName?: string };
    if (data.type === 'delegation') {
      return { type: 'delegation', workerName: data.workerName };
    }

    return { type: 'chat', response: data.response ?? '' };
  }

  /**
   * Handle @worker message — route via Codex
   */
  private async handleDirectMessage(ctx: Context & { chat: { id: number }; message: { text: string } }, text: string): Promise<void> {
    // Check for @sessionName prefix: @name message
    const atMatch = text.match(/^@(\S+)\s+(.+)$/s);
    let message: string;
    let displayName: string;

    if (atMatch) {
      const workerName = atMatch[1];
      // Validate worker exists (skip for 'main' session which is always valid)
      if (workerName !== 'main') {
        try {
          const res = await fetch(`${this.config.gatewayUrl}/api/workers`, {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(5_000),
          });
          if (res.ok) {
            const { workers } = await res.json() as { workers: Array<{ name: string }> };
            const found = workers.some((w) => w.name === workerName);
            if (!found && workers.length > 0) {
              const available = workers.map((w) => `\`@${w.name}\``).join(', ');
              await this.safeReply(ctx, `❌ 워커 \`@${workerName}\`를 찾을 수 없습니다.\n사용 가능한 워커: ${available}`, 'Markdown');
              return;
            } else if (!found && workers.length === 0) {
              await this.safeReply(ctx, '❌ 등록된 워커가 없습니다. 터미널에서 `olympus start-trust`를 실행하세요.', 'Markdown');
              return;
            }
          }
        } catch {
          // Gateway unreachable — proceed anyway (don't block on validation failure)
        }
      }
      message = atMatch[2];
      displayName = workerName;
      // Immediate acknowledgment — before async routing (avoids silent delay)
      await ctx.sendChatAction('typing');
    } else {
      displayName = 'default';
      message = text;
    }

    // "team" or "team:" prefix detection → Team v4 (git worktree isolation)
    const teamMatch = message.match(/^team[:\s]\s*(.+)$/is);
    if (teamMatch) {
      const teamPrompt = teamMatch[1].trim();
      const statusMsg = await ctx.reply(`🚀 *Team v4* 시작 중...\n워커: ${displayName}`, { parse_mode: 'Markdown' });
      await ctx.sendChatAction('typing');

      try {
        const startRes = await fetch(`${this.config.gatewayUrl}/api/team/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            prompt: teamPrompt,
            chatId: ctx.chat.id,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!startRes.ok) {
          const error = await startRes.json() as { message: string };
          throw new Error(error.message);
        }

        const { teamId } = await startRes.json() as { teamId: string };
        await this.pollTeamSession(ctx, teamId, statusMsg.message_id);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.telegram.editMessageText(
          ctx.chat.id, statusMsg.message_id, undefined,
          `❌ Team 오류: ${msg}`
        ).catch(() => {});
      }
      return;
    }

    await ctx.sendChatAction('typing');

    try {
      const data = await this.submitCodexChat(text, ctx.chat.id);

      if (data.type === 'delegation') {
        const workerLabel = data.workerName ? `\`@${data.workerName}\`` : `\`${displayName}\``;
        await this.safeReply(ctx, `🔄 ${workerLabel}에게 작업을 위임했습니다. 완료 시 결과를 알려드립니다.`, 'Markdown');
      } else if (data.response) {
        await this.sendLongMessage(ctx.chat.id, `📩 [${displayName}]\n\n${data.response}`);
      } else {
        await this.safeReply(ctx, '🤔 요청을 처리할 수 없습니다.', undefined);
      }
    } catch (err) {
      await ctx.reply(`❌ 오류: ${(err as Error).message}`);
    }
  }

  /**
   * Poll a team task for completion (30min max, 10s interval).
   * Shared by /team command and @worker team prefix.
   */
  private async pollTeamSession(
    ctx: Context & { chat: { id: number } },
    teamId: string,
    statusMsgId: number,
  ): Promise<void> {
    const POLL_INTERVAL = 5_000;
    const MAX_POLLS = 360; // 30분

    let lastText = '';

    for (let polls = 1; polls <= MAX_POLLS; polls++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      try {
        const statusRes = await fetch(
          `${this.config.gatewayUrl}/api/team/${teamId}/status`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!statusRes.ok) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            `❌ Team API 오류 (${statusRes.status}) — Gateway가 실행 중인지 확인하세요.`
          ).catch(() => {});
          return;
        }
        const data = await statusRes.json() as {
          teamId: string;
          phase: string;
          workItems: Array<{ id: string; title: string; status: string; durationMs?: number; error?: string }>;
          mergeProgress?: { merged: number; total: number; conflicts: number };
          error?: string;
          summary?: string;
          totalCost?: number;
          elapsedMs: number;
        };

        const elapsed = Math.round(data.elapsedMs / 1000);

        if (data.phase === 'completed') {
          let text = `✅ *Team v4 완료* (${elapsed}초`;
          if (data.totalCost) text += `, $${data.totalCost.toFixed(4)}`;
          text += ')\n\n';

          for (const wi of data.workItems) {
            const icon = wi.status === 'completed' ? '✅' : '❌';
            const dur = wi.durationMs ? ` (${Math.round(wi.durationMs / 1000)}초)` : '';
            text += `${icon} ${wi.id}: ${wi.title}${dur}\n`;
          }

          const chunks = splitLongMessage(text, 4000);
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            chunks[0], { parse_mode: 'Markdown' }
          ).catch(() => {});
          for (let i = 1; i < chunks.length; i++) {
            await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => {});
          }
          return;
        }

        if (data.phase === 'failed' || data.phase === 'cancelled') {
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            `❌ Team ${data.phase === 'cancelled' ? '취소됨' : '실패'}: ${data.error ?? 'unknown'}`
          ).catch(() => {});
          return;
        }

        // Build progress text
        let text = `🔄 *Team v4* \\[${data.phase}\\] (${elapsed}초)\n\n`;
        for (const wi of data.workItems) {
          let icon = '⬜';
          if (wi.status === 'completed') icon = '✅';
          else if (wi.status === 'running') icon = '🔄';
          else if (wi.status === 'failed') icon = '❌';
          else if (wi.status === 'ready') icon = '⏳';
          text += `${icon} ${wi.id}: ${wi.title}\n`;
        }

        if (data.mergeProgress) {
          text += `\n🔀 Merge: ${data.mergeProgress.merged}/${data.mergeProgress.total}`;
          if (data.mergeProgress.conflicts > 0) text += ` (충돌 ${data.mergeProgress.conflicts})`;
        }

        // Only update if text changed
        if (text !== lastText) {
          lastText = text;
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            text.slice(0, TELEGRAM_MSG_LIMIT),
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      } catch {
        continue;
      }
    }

    // 타임아웃
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsgId, undefined,
      '⏰ Team v4 타임아웃 (30분)'
    ).catch(() => {});
  }

  /**
   * Generate Olympus banner for session connection
   */
  private getOlympusBanner(sessionName: string, projectPath: string): string {
    // Lightning bolt mascot based on sparky.png
    // Wide top → 3 bends → narrow bottom
    const banner = `
\`\`\`
        ███████████
      ▄███████████
    ▄███████████
    ▄█████ ◐  ◐ ███▄  OLYMPUS  
      ██████ v ████▀ ╱
  o───▄█████████▀   ╱ Connected!
       ▄███████▀
      ▄██████▀
        ███▀
      ╱ █▀  ╲\
     ╱  ▀    ╲
    -         -
\`\`\`
*${sessionName}*
\`${projectPath}\`
`;
    return banner.trim();
  }

  /**
   * Send a long message to Telegram, splitting into multiple parts if needed.
   * Each part includes the session prefix for multi-session clarity.
   */
  private isTableLikeText(text: string): boolean {
    if (/[┌┬┐├┼┤└┴┘│]/.test(text)) return true;
    const lines = text.split('\n');
    let pipeLike = 0;
    for (const line of lines) {
      if (/\|/.test(line)) pipeLike++;
      if (pipeLike >= 3) return true;
    }
    return false;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async sendMessageChunk(chatId: number, text: string, usePre: boolean): Promise<void> {
    if (!usePre) {
      await this.bot.telegram.sendMessage(chatId, text);
      return;
    }
    const wrapped = `<pre>${this.escapeHtml(text)}</pre>`;
    try {
      await this.bot.telegram.sendMessage(chatId, wrapped, { parse_mode: 'HTML' });
    } catch {
      await this.bot.telegram.sendMessage(chatId, text);
    }
  }

  private async sendLongMessage(chatId: number, text: string, sessionPrefix?: string): Promise<void> {
    // R3: Apply Telegram response filter before sending
    const filtered = filterForTelegram(text);
    text = filtered.text;
    const usePre = this.isTableLikeText(text);

    if (text.length <= TELEGRAM_MSG_LIMIT) {
      await this.sendMessageChunk(chatId, text, usePre);
      return;
    }

    // Split on line boundaries
    const lines = text.split('\n');
    let chunk = '';
    let partNum = 1;

    for (const line of lines) {
      if (chunk.length + line.length + 1 > TELEGRAM_MSG_LIMIT) {
        if (chunk) {
          await this.sendMessageChunk(chatId, chunk.trimEnd(), usePre);
          partNum++;
          chunk = '';
          // Add prefix to continuation parts
          if (sessionPrefix) {
            chunk = `${sessionPrefix} (${partNum}부)\n\n`;
          }
        }
        // Single line exceeds limit - force split
        if (line.length > TELEGRAM_MSG_LIMIT) {
          for (let i = 0; i < line.length; i += TELEGRAM_MSG_LIMIT) {
            await this.sendMessageChunk(chatId, line.slice(i, i + TELEGRAM_MSG_LIMIT), usePre);
            partNum++;
          }
          continue;
        }
      }
      chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk.trim()) {
      await this.sendMessageChunk(chatId, chunk.trimEnd(), usePre);
    }
  }

  /**
   * Send an RPC call via WebSocket and wait for result.
   */
  private rpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const msg = createMessage('rpc', { method, params });
      const requestId = msg.id;

      const timer = setTimeout(() => {
        this.pendingRpc.delete(requestId);
        reject(new Error(`RPC timeout: ${method}`));
      }, OlympusBot.RPC_TIMEOUT_MS);

      this.pendingRpc.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify(msg));
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

      // Start ping interval to keep connection alive
      this.startPing();

      // WI-4.5: Catch up on worker tasks completed during disconnection
      this.catchUpMissedWorkerTasks().catch(() => {});
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

    this.ws.on('close', (code) => {
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

  private handleWebSocketMessage(msg: { type: string; payload: unknown; id?: string }) {
    // Handle RPC responses — requestId is in payload (gateway uses msg.id of original request)
    if (msg.type === 'rpc:result' || msg.type === 'rpc:error' || msg.type === 'rpc:ack') {
      const requestId = (msg.payload as { requestId?: string }).requestId;
      if (msg.type === 'rpc:ack') return; // Ignore ack, wait for result
      if (requestId && this.pendingRpc.has(requestId)) {
        const pending = this.pendingRpc.get(requestId)!;
        this.pendingRpc.delete(requestId);
        clearTimeout(pending.timer);
        if (msg.type === 'rpc:result') {
          pending.resolve((msg.payload as { result: unknown }).result);
        } else {
          pending.reject(new Error((msg.payload as { message: string }).message ?? 'RPC error'));
        }
      }
      return;
    }

    // Handle worker task:assigned — 작업 시작 알림 (R1, R3)
    if (msg.type === 'worker:task:assigned') {
      const taskPayload = msg.payload as {
        taskId: string;
        workerName: string;
        chatId?: number;
        prompt?: string;
      };

      // R3: Fallback to admin if no chatId
      const targetChatId = taskPayload.chatId ?? this.config.allowedUsers[0];

      if (targetChatId) {
        const promptText = taskPayload.prompt
          ? `\n> ${safeSlice(taskPayload.prompt, 100)}${taskPayload.prompt.length > 100 ? '...' : ''}`
          : '';
        const text = `▶️ \`@${taskPayload.workerName}\` 시작${promptText}`;

        this.sendLongMessage(targetChatId, text).catch((err) => {
          structuredLog('error', 'telegram-bot', 'task_assigned_send_failed', { error: (err as Error).message });
        });
      }
    }

    // Handle worker task:completed
    // Telegram UX rule: do NOT send raw completion body here.
    // Users should receive only worker:task:summary (Codex summary).
    if (msg.type === 'worker:task:completed') {
      // Update last seen task timestamp for catch-up and rely on summary events for delivery.
      this.lastSeenTaskTimestamp = Date.now();
      return;
    }

    // Handle worker task:failed — zombie worker died
    if (msg.type === 'worker:task:failed') {
      const failPayload = msg.payload as { workerId: string; taskIds: string[] };
      this.lastSeenTaskTimestamp = Date.now();
      const adminChatId = this.config.allowedUsers[0];
      if (adminChatId) {
        this.sendLongMessage(adminChatId, `⚠️ 워커 오프라인: ${failPayload.workerId}\n실패 작업: ${failPayload.taskIds.length}개`).catch(() => {});
      }
      return;
    }

    // Handle worker task:timeout — 30분 타임아웃 중간 결과
    if (msg.type === 'worker:task:timeout') {
      const taskPayload = msg.payload as {
        taskId: string;
        workerName: string;
        chatId?: number;
        summary?: string;
        success: boolean;
        durationMs?: number;
      };

      const targetChatId = taskPayload.chatId ?? this.config.allowedUsers[0];
      if (targetChatId) {
        const durationMin = Math.round((taskPayload.durationMs ?? 0) / 60000);
        const summaryText = taskPayload.summary ?? '(결과 추출 중)';
        const text = `[${taskPayload.workerName}] ⏰ ${durationMin}분 타임아웃 — 계속 모니터링 중\n\n중간 결과:\n${summaryText}\n\n_실제 완료 시 최종 결과가 전송됩니다._`;
        this.sendLongMessage(targetChatId, text).catch((err) => {
          structuredLog('error', 'telegram-bot', 'task_timeout_send_failed', { error: (err as Error).message });
        });
      }
      return;
    }

    // Handle worker task:final_after_timeout
    // Telegram UX rule: suppress raw final body; summary event will deliver concise result.
    if (msg.type === 'worker:task:final_after_timeout') {
      this.lastSeenTaskTimestamp = Date.now();
      return;
    }

    // Handle dashboard:chat:mirror — mirror dashboard Codex/Gemini chat to Telegram
    if (msg.type === 'dashboard:chat:mirror') {
      const payload = msg.payload as {
        source?: string;
        agent?: 'codex' | 'gemini';
        query?: string;
        answer?: string;
        chatId?: number;
      };

      const chatId = payload.chatId ?? this.config.allowedUsers[0];
      if (chatId) {
        const agentName = payload.agent === 'gemini' ? 'Hera' : 'Zeus';
        const q = safeSlice((payload.query ?? '').trim(), 140);
        const filtered = filterForTelegram(payload.answer ?? '');
        const a = safeSlice(filtered.text.trim(), 2000);
        let text = `🖥️ [Dashboard→${agentName}]`;
        if (q) text += `\nQ: ${q}${(payload.query ?? '').length > 140 ? '...' : ''}`;
        if (a) text += `\n\n${a}`;
        this.sendLongMessage(chatId, text).catch(() => {});
      }
      return;
    }

    // Handle codex:greeting — proactive startup briefing from Codex
    if (msg.type === 'codex:greeting') {
      const greetingPayload = msg.payload as { type: string; text: string; timestamp: number };
      if (greetingPayload.text) {
        const targetChatId = this.config.allowedUsers[0];
        if (targetChatId) {
          this.sendLongMessage(targetChatId, `📋 *브리핑*\n\n${greetingPayload.text}`)
            .catch((err: Error) => console.warn('[TelegramBot] Failed to send greeting:', err.message));
        }
      }
      return;
    }

    // Handle gemini:alert — Proactive alert from Gemini Advisor
    if (msg.type === 'gemini:alert') {
      const alert = msg.payload as { id: string; severity: string; message: string; projectPath: string; timestamp: number };
      const severityIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️';
      const text = `${severityIcon} [Gemini Alert] ${alert.message}\n📁 ${alert.projectPath}`;

      // Broadcast to first allowed user (admin)
      const adminChatId = this.config.allowedUsers[0];
      if (adminChatId) {
        this.sendLongMessage(adminChatId, text).catch(() => {});
      }
      return;
    }

    // WI-4.6: Handle gemini:review — Post-task quality review from Gemini Advisor
    if (msg.type === 'gemini:review') {
      const review = msg.payload as { taskId: string; workerName: string; chatId?: number; quality: string; summary: string; concerns: string[] };
      const chatId = review.chatId ?? this.config.allowedUsers[0];
      if (chatId) {
        const qualityIcon = review.quality === 'critical' ? '🔴' : review.quality === 'warning' ? '🟡' : '🟢';
        let text = `${qualityIcon} [Gemini Review] ${review.workerName}\n${review.summary}`;
        if (review.concerns.length > 0) {
          text += `\n⚠️ ${review.concerns.join('\n⚠️ ')}`;
        }
        this.sendLongMessage(chatId, text).catch(() => {});
      }
      return;
    }

    // WI-4.6: Handle worker:task:summary — Append/update summary to existing task message
    if (msg.type === 'worker:task:summary') {
      const summaryPayload = msg.payload as { taskId: string; workerName: string; chatId?: number; summary: string };
      const chatId = summaryPayload.chatId ?? this.config.allowedUsers[0];
      if (chatId) {
        const text = `✅ \`@${summaryPayload.workerName}\` 완료\n\n${summaryPayload.summary}`;
        this.sendLongMessage(chatId, text).catch(() => {});
      }
      return;
    }
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    // Process-level error handlers
    process.once('unhandledRejection', (reason) => {
      structuredLog('error', 'telegram-bot', 'unhandled_rejection', {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    process.once('uncaughtException', (err) => {
      structuredLog('error', 'telegram-bot', 'uncaught_exception', {
        message: err.message,
        stack: err.stack,
      });
      // Don't exit — let the bot try to recover
    });

    // Connect to Gateway WebSocket
    this.connectWebSocket();

    // Start Telegram bot
    console.log('Starting Olympus Telegram Bot...');
    console.log(`Gateway: ${this.config.gatewayUrl}`);
    console.log(`Allowed users: ${this.config.allowedUsers.length > 0 ? this.config.allowedUsers.join(', ') : 'All'}`);

    try {
      // bot.launch() returns a Promise that resolves only when the bot stops.
      // We fire-and-forget it and detect readiness via a short delay after launch starts.
      let launchErrorMsg: string | null = null;
      this.bot.launch({ dropPendingUpdates: true }).then(() => {
        // bot stopped
      }).catch((err: Error) => {
        launchErrorMsg = err.message;
        structuredLog('error', 'telegram-bot', 'bot_launch_failed', {
          category: classifyError(err).category,
          message: err.message,
          stack: err.stack,
        });
      });

      // Wait briefly for any immediate launch errors (auth failure, etc.)
      await new Promise(resolve => setTimeout(resolve, 3000));

      if (launchErrorMsg) {
        return { success: false, error: launchErrorMsg };
      }

      structuredLog('info', 'telegram-bot', 'bot_started', {
        gateway: this.config.gatewayUrl,
        allowedUsers: this.config.allowedUsers,
      });

      await this.registerBotCommands();

      // Auto-run /start equivalent after bot startup (for allowed users).
      for (const chatId of this.config.allowedUsers) {
        await this.sendStartGuide(chatId).catch(() => {});
      }

      // Graceful shutdown
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));

      return { success: true };
    } catch (err) {
      const classified = classifyError(err);
      structuredLog('error', 'telegram-bot', 'bot_launch_failed', {
        category: classified.category,
        message: classified.message,
      });
      return { success: false, error: classified.message };
    }
  }

  private stop(signal: string) {
    console.log(`\nReceived ${signal}, shutting down...`);
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Reject all pending RPC calls
    for (const [id, pending] of this.pendingRpc) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bot shutting down'));
      this.pendingRpc.delete(id);
    }
    this.ws?.close();
    this.bot.stop(signal);
  }

  /**
   * WI-4.5: Catch up on missed worker task completions after WebSocket reconnect.
   * Telegram UX rule: no raw completion replay. Summary-only delivery is handled
   * by live worker:task:summary events.
   */
  private async catchUpMissedWorkerTasks(): Promise<void> {
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/workers/tasks`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;

      const { tasks } = await res.json() as { tasks: Array<{ taskId: string; workerName: string; status: string; completedAt?: number; chatId?: number; result?: { success: boolean; text?: string } }> };

      // Intentionally no Telegram send here (summary-only policy).
      this.lastSeenTaskTimestamp = Date.now();
    } catch { /* ignore */ }
  }

}

// Export for programmatic use (CLI startup handshake)
export { OlympusBot, loadConfig };
export type { BotConfig };

// Auto-start when imported directly
const config = loadConfig();
const bot = new OlympusBot(config);
const startResult = await bot.start();

export { startResult };
