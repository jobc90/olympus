import { Telegraf, Context } from 'telegraf';
import { InlineQueryResult } from 'telegraf/types';
import WebSocket from 'ws';
import {
  parseMessage,
  createMessage,
  type PhasePayload,
  type AgentPayload,
  type LogPayload,
} from '@olympus-dev/protocol';
import type { CliRunResult } from '@olympus-dev/protocol';
import { classifyError, structuredLog } from './error-utils.js';
import { TelegramSecurity } from './security.js';
import { DraftStream, DraftStreamManager } from './draft-stream.js';
import type { CliStreamChunk, FilterResult, FilterStage } from '@olympus-dev/protocol';
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
    { command: 'start', description: '환영 메시지와 빠른 시작' },
    { command: 'help', description: '명령어 전체 도움말' },
    { command: 'workers', description: '워커 목록 및 빠른 지시' },
    { command: 'sessions', description: '세션 상태/전환 가이드' },
    { command: 'use', description: '세션/모드 전환' },
    { command: 'close', description: '세션 종료' },
    { command: 'last', description: '현재 세션 마지막 출력' },
    { command: 'health', description: 'Gateway/WS 상태 확인' },
    { command: 'codex', description: 'Codex 오케스트레이터 질의' },
    { command: 'team', description: 'Team Engineering 실행' },
    { command: 'tasks', description: '활성 작업 목록' },
  ] as const;

  private bot: Telegraf;
  private config: BotConfig;
  private ws: WebSocket | null = null;
  private subscribedRuns = new Map<string, number>(); // runId/sessionId -> chatId
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  // Multi-session support: chatId -> Map<sessionName, sessionId>
  private chatSessions = new Map<number, Map<string, string>>();
  private activeSession = new Map<number, string>(); // chatId -> current active session name
  // Per-session message queue to prevent interleaving
  private sendQueues = new Map<string, Promise<void>>(); // sessionId -> queue chain
  // Direct mode: when true, messages go directly to active session (bypass orchestrator)
  private directMode = new Map<number, boolean>(); // chatId -> direct mode
  // Output history buffer per session (last N messages for /last retrieval)
  private outputHistory = new Map<string, string[]>(); // sessionId -> last 10 outputs
  private static readonly OUTPUT_HISTORY_SIZE = 10;
  // Throttle for sessions:list sync (prevent burst REST calls)
  private syncThrottleTimer: NodeJS.Timeout | null = null;
  private syncThrottleMs = 1000;
  // Pending RPC calls (requestId -> resolve/reject)
  private pendingRpc = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private static readonly RPC_TIMEOUT_MS = 30000;
  // Security module (3-layer: DM/Group/Command)
  private security: TelegramSecurity;
  // Draft streaming manager (real-time editMessageText updates)
  private draftManager = new DraftStreamManager();
  // Session key → chatId mapping for stream routing
  private streamChatMap = new Map<string, number>(); // sessionKey → chatId
  // WI-4.4: Track delivered task IDs to prevent duplicate result messages
  private deliveredTasks = new Set<string>();
  // Periodic cleanup timer for deliveredTasks (prevent unbounded growth)
  private deliveredTasksCleanupTimer: NodeJS.Timeout | null = null;
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
    const exampleWorker = workers.length > 0 ? workers[0].name : 'olympus';

    let msg = `⚡ *Olympus*\n\n`;
    msg += `텔레그램에서 워커를 바로 지시하고, 세션 상태를 확인할 수 있습니다.\n\n`;

    if (workers.length > 0) {
      msg += `*활성 워커* (${workers.length}개)\n`;
      for (const w of workers) {
        const icon = w.status === 'idle' ? '🟢' : w.status === 'busy' ? '🔴' : '⚫';
        const shortPath = w.projectPath.replace(/^\/Users\/[^/]+\//, '~/');
        msg += `${icon} \`@${w.name}\` — \`${shortPath}\`\n`;
      }
      msg += '\n';
    }

    msg += `*사용법*\n`;
    msg += `워커에게 지시 → \`@워커이름 작업내용\`\n`;
    msg += `일반 대화 → 그냥 메시지 입력\n\n`;

    msg += `*예시*\n`;
    msg += `\`@${exampleWorker} 현재 브랜치 상태 알려줘\`\n`;
    msg += `\`@${exampleWorker} 테스트 돌려줘\`\n\n`;

    msg += `*명령어*\n`;
    msg += `/help — 전체 명령어 안내\n`;
    msg += `/workers — 워커 목록 + 빠른 지시\n`;
    msg += `/sessions — 세션 상태/전환\n`;
    msg += `/health — 시스템 상태\n\n`;

    if (workers.length > 0) {
      msg += `💡 팁: \`@워커이름\` 뒤에 작업 내용을 입력하면 해당 워커가 바로 실행합니다.`;
    }

    return msg;
  }

  private buildHelpMessage(
    chatId: number,
    workers: Array<{ name: string; status: string; projectPath: string }>,
  ): string {
    const mode = this.directMode.get(chatId) ? '🔗 직접 모드' : '🤖 오케스트레이터 모드';
    const currentSession = this.getActiveSessionName(chatId)?.replace(/^olympus-/, '') ?? '없음';
    const mySessionCount = this.chatSessions.get(chatId)?.size ?? 0;
    const exampleWorker = workers[0]?.name ?? 'olympus';

    let msg = `📘 *Olympus 명령어 가이드*\n\n`;
    msg += `*현재 상태*\n`;
    msg += `모드: ${mode}\n`;
    msg += `현재 세션: ${currentSession}\n`;
    msg += `내 연결 세션: ${mySessionCount}개\n`;
    msg += `활성 워커: ${workers.length}개\n\n`;

    msg += `*추천 시작 순서*\n`;
    msg += `1. \`/workers\` 로 워커 확인\n`;
    msg += `2. \`@${exampleWorker} 상황파악하고 보고해\` 실행\n`;
    msg += `3. \`/sessions\` 로 세션 상태 확인\n\n`;

    msg += `*전체 명령어*\n`;
    for (const cmd of OlympusBot.COMMAND_MENU) {
      msg += `/${cmd.command} — ${cmd.description}\n`;
    }

    msg += `\n*빠른 예시*\n`;
    msg += `\`@${exampleWorker} 빌드하고 테스트 돌려줘\`\n`;
    msg += `\`/use main\` (오케스트레이터 복귀)\n`;
    msg += `\`/use ${exampleWorker}\` (직접 모드 전환)\n`;

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
    if (command.startsWith('s')) suggestions.push('/sessions');
    if (command.startsWith('u')) suggestions.push('/use');
    if (command.startsWith('h')) suggestions.push('/help');
    if (command.startsWith('c')) suggestions.push('/codex');

    for (const fallback of ['/help', '/workers', '/sessions']) {
      if (!suggestions.includes(fallback)) suggestions.push(fallback);
      if (suggestions.length >= 3) break;
    }

    const known = OlympusBot.COMMAND_MENU.map(cmd => `/${cmd.command}`).join(', ');
    return (
      `❓ 알 수 없는 명령어: \`${text.split(/\s+/)[0]}\`\n\n` +
      `추천 명령어: ${suggestions.map(v => `\`${v}\``).join(', ')}\n\n` +
      `전체 목록: ${known}`
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
        const wsStatus = this.isConnected ? '✅ 연결됨' : '❌ 연결 끊김';
        const sessions = this.chatSessions.get(ctx.chat.id);
        const sessionCount = sessions?.size ?? 0;
        const activeName = this.activeSession.get(ctx.chat.id);
        await ctx.reply(
          `✅ Gateway 정상\n\n` +
          `상태: ${data.status}\n` +
          `가동시간: ${Math.floor(data.uptime / 60)}분\n` +
          `WebSocket: ${wsStatus}\n` +
          `활성 세션: ${sessionCount}개\n` +
          `현재 세션: ${activeName ? `'${activeName}'` : '없음'}`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await ctx.reply(`❌ Gateway 연결 실패\n${(err as Error).message}`);
      }
    });

    // /sessions - List sessions (both connected and available tmux sessions)
    this.bot.command('sessions', async (ctx) => {
      try {
        // 1. Get all sessions (Gateway reconciles stale ones automatically)
        const sessionsRes = await fetch(`${this.config.gatewayUrl}/api/sessions`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
        const sessionsData = await sessionsRes.json() as {
          sessions: Array<{ id: string; name?: string; tmuxSession: string; chatId: number; status: string; projectPath: string; createdAt: number }>;
          availableSessions?: Array<{ tmuxSession: string; projectPath: string }>;
        };

        // All active registered sessions (regardless of chatId)
        const activeSessions = sessionsData.sessions.filter(s => s.status === 'active');
        // Available (unregistered) tmux sessions
        const availableTmux = sessionsData.availableSessions ?? [];

        if (activeSessions.length === 0 && availableTmux.length === 0) {
          await ctx.reply(
            '📭 활성 세션이 없습니다.\n\n' +
            '💡 터미널에서 `olympus start`로 Claude CLI 세션을 시작하세요.\n' +
            '💡 또는 `/new 이름`으로 새 세션을 생성하세요.',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        const currentName = this.getActiveSessionName(ctx.chat.id);
        const currentDisplayName = currentName?.replace(/^olympus-/, '');
        const myChatId = ctx.chat.id;
        const modeLabel = this.directMode.get(myChatId) ? '🔗 직접 모드' : '🤖 오케스트레이터 모드';
        const myConnectedSessions = this.chatSessions.get(myChatId)?.size ?? 0;

        let msg = `🧭 *세션 요약*\n`;
        msg += `모드: ${modeLabel}\n`;
        msg += `현재 세션: ${currentDisplayName ?? '없음'}\n`;
        msg += `내 연결 세션: ${myConnectedSessions}개\n`;
        msg += `전체 활성 세션: ${activeSessions.length}개\n\n`;

        // Active registered sessions (all, not just this chat)
        // Show current active session prominently at the top
        if (currentDisplayName) {
          const currentSession = activeSessions.find(s => {
            const name = (s.name ?? s.tmuxSession).replace(/^olympus-/, '');
            return name === currentDisplayName && s.chatId === myChatId;
          });
          if (currentSession) {
            const shortPath = currentSession.projectPath.replace(/^\/Users\/[^/]+\//, '~/');
            const age = this.formatAge(currentSession.createdAt);
            msg += `🟢 *현재 세션: ${currentDisplayName}*\n`;
            msg += `    📂 \`${shortPath}\`  ⏱ ${age}\n`;
            msg += `    💬 메시지를 입력하면 이 세션으로 전송됩니다\n`;
            msg += '─────────────────\n\n';
          }
        }

        if (activeSessions.length > 0) {
          msg += `📋 *전체 세션* (${activeSessions.length}개)\n`;
          msg += '─────────────────\n';
          for (const session of activeSessions) {
            const rawName = session.name ?? session.tmuxSession;
            const displayName = rawName.replace(/^olympus-/, '');
            const isMyChat = session.chatId === myChatId;
            const isCurrent = isMyChat && currentDisplayName === displayName;
            const icon = isCurrent ? '▶️' : isMyChat ? '🔵' : '⚪';
            const suffix = isCurrent ? ' ✓' : isMyChat ? '' : ' (외부)';
            const shortPath = session.projectPath.replace(/^\/Users\/[^/]+\//, '~/');
            const age = this.formatAge(session.createdAt);
            msg += `${icon} *${displayName}*${suffix}\n`;
            msg += `    📂 \`${shortPath}\`\n`;
            msg += `    ⏱ ${age}\n\n`;
          }
        }

        // Available (unregistered) tmux sessions
        if (availableTmux.length > 0) {
          msg += `⬜ *미연결 세션* (${availableTmux.length}개)\n`;
          msg += '─────────────────\n';
          for (const tmux of availableTmux) {
            const displayName = tmux.tmuxSession.replace(/^olympus-/, '');
            const shortPath = tmux.projectPath.replace(/^\/Users\/[^/]+\//, '~/');
            msg += `⚪ *${displayName}*\n`;
            msg += `    📂 \`${shortPath}\`\n`;
            msg += `    → \`/use ${displayName}\`\n\n`;
          }
        }

        msg += '─────────────────\n';

        // Collect all session names for /use examples
        const allNames: string[] = [];
        for (const session of activeSessions) {
          allNames.push((session.name ?? session.tmuxSession).replace(/^olympus-/, ''));
        }
        for (const tmux of availableTmux) {
          const name = tmux.tmuxSession.replace(/^olympus-/, '');
          if (!allNames.includes(name)) allNames.push(name);
        }

        if (allNames.length > 0) {
          msg += '💡 세션 전환:\n';
          for (const name of allNames) {
            msg += `  \`/use ${name}\`\n`;
          }
          msg += '\n';
        }
        msg += `▶️ = 현재 연결 | 🔵 = 내 세션 | ⚪ = 외부/미연결`;

        await ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`❌ 목록 조회 실패: ${(err as Error).message}`);
      }
    });

    // /close [name] - Close session by name
    this.bot.command('close', async (ctx) => {
      let name = ctx.message.text.replace(/^\/close\s*/, '').trim();

      // If no name provided, use current active session
      if (!name) {
        name = this.activeSession.get(ctx.chat.id) ?? '';
        if (!name) {
          await ctx.reply('사용법: `/close 세션이름`\n\n현재 활성 세션이 없습니다.', { parse_mode: 'Markdown' });
          return;
        }
      }

      const sessions = this.chatSessions.get(ctx.chat.id);
      const sessionId = sessions?.get(name);

      if (!sessionId) {
        await ctx.reply(`❌ 세션 '${name}'을 찾을 수 없습니다.\n\n\`/sessions\`로 활성 세션 목록을 확인하세요.`, { parse_mode: 'Markdown' });
        return;
      }

      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });

        if (!res.ok) {
          const error = await res.json() as { message: string };
          throw new Error(error.message);
        }

        // Remove from local state
        sessions?.delete(name);
        this.subscribedRuns.delete(sessionId);

        // If this was the active session, clear it
        if (this.activeSession.get(ctx.chat.id) === name) {
          this.activeSession.delete(ctx.chat.id);
          // Set another session as active if available
          if (sessions && sessions.size > 0) {
            const nextName = sessions.keys().next().value as string;
            if (nextName) {
              this.activeSession.set(ctx.chat.id, nextName);
            }
          }
        }

        await ctx.reply(`🛑 세션 '${name}' 종료됨`, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`❌ 종료 실패: ${(err as Error).message}`);
      }
    });

    // /use <name> - Switch to or connect to session
    // /use main|orchestrator - Switch back to orchestrator mode
    // /use direct <name> - Direct mode (bypass orchestrator)
    this.bot.command('use', async (ctx) => {
      const nameInput = ctx.message.text.replace(/^\/use\s*/, '').trim();

      if (!nameInput) {
        const mode = this.directMode.get(ctx.chat.id) ? '🔗 직접 모드' : '🤖 오케스트레이터 모드';
        const currentSession = this.getActiveSessionName(ctx.chat.id)?.replace(/^olympus-/, '') ?? '없음';
        await ctx.reply(
          `현재 모드: ${mode}\n` +
          `현재 세션: ${currentSession}\n\n` +
          `사용법:\n` +
          `• \`/use main\` — 오케스트레이터 모드\n` +
          `• \`/use direct <세션>\` — 직접 모드\n` +
          `• \`/use <세션>\` — 직접 모드로 전환`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // /use main or /use orchestrator → switch back to orchestrator mode
      if (nameInput === 'main' || nameInput === 'orchestrator') {
        this.directMode.delete(ctx.chat.id);
        this.activeSession.set(ctx.chat.id, 'main');
        await ctx.reply('🤖 오케스트레이터 모드로 전환됨\n\n모든 메시지가 AI 오케스트레이터를 통해 라우팅됩니다.');
        return;
      }

      // /use direct <session> → enable direct mode
      const directMatch = nameInput.match(/^direct\s+(.+)$/);
      const actualName = directMatch ? directMatch[1] : nameInput;

      // Enable direct mode for any /use <session> command
      this.directMode.set(ctx.chat.id, true);

      const sessions = this.chatSessions.get(ctx.chat.id);
      const displayName = actualName.replace(/^olympus-/, '');

      // Check if already connected AND still valid in gateway
      const connectedName = this.resolveSessionName(ctx.chat.id, actualName);
      if (connectedName) {
        const cachedSessionId = sessions?.get(connectedName);
        let sessionStillValid = false;

        // Verify session ID is still valid with gateway
        try {
          const sessionsRes = await fetch(`${this.config.gatewayUrl}/api/sessions`, {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
          });
          const sessionsData = await sessionsRes.json() as { sessions: Array<{ id: string; name: string; projectPath: string; status: string }> };
          const sessionInfo = sessionsData.sessions.find(s => s.id === cachedSessionId && s.status === 'active');

          if (sessionInfo) {
            // Session still valid - just switch
            sessionStillValid = true;
            this.activeSession.set(ctx.chat.id, connectedName);
            const banner = this.getOlympusBanner(displayName, sessionInfo.projectPath);
            await ctx.reply(banner, { parse_mode: 'Markdown' });
            return;
          }

          // Session ID is stale - check if gateway has a session with same tmux name
          const freshSession = sessionsData.sessions.find(s => s.name === connectedName && s.status === 'active');
          if (freshSession) {
            // Re-map to fresh session ID
            sessions?.set(connectedName, freshSession.id);
            this.subscribedRuns.set(freshSession.id, ctx.chat.id);
            if (this.ws?.readyState === 1) {
              this.ws.send(JSON.stringify({ type: 'subscribe', payload: { sessionId: freshSession.id } }));
            }
            this.activeSession.set(ctx.chat.id, connectedName);
            const banner = this.getOlympusBanner(displayName, freshSession.projectPath);
            await ctx.reply(banner, { parse_mode: 'Markdown' });
            return;
          }
        } catch {
          // Gateway unreachable — fall through to connect
        }

        if (!sessionStillValid) {
          // Stale local entry — remove and fall through to connect
          sessions?.delete(connectedName);
          this.subscribedRuns.delete(cachedSessionId ?? '');
        }
      }

      // Not connected - try to connect to tmux session (use name as-is)
      const tmuxSession = actualName;
      const statusMsg = await ctx.reply(`🔗 '${displayName}' 연결 중...`);

      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/sessions/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({ chatId: ctx.chat.id, tmuxSession }),
        });

        if (!res.ok) {
          const error = await res.json() as { message: string };
          throw new Error(error.message);
        }

        const data = await res.json() as { session: { id: string; name: string; projectPath: string } };

        // Store in local state
        let sessionsMap = this.chatSessions.get(ctx.chat.id);
        if (!sessionsMap) {
          sessionsMap = new Map();
          this.chatSessions.set(ctx.chat.id, sessionsMap);
        }
        sessionsMap.set(data.session.name, data.session.id);
        this.activeSession.set(ctx.chat.id, data.session.name);

        // Subscribe to session events
        this.subscribedRuns.set(data.session.id, ctx.chat.id);
        if (this.ws?.readyState === 1) {
          this.ws.send(JSON.stringify({ type: 'subscribe', payload: { sessionId: data.session.id } }));
        }

        const modeLabel = '🔗 직접 모드';
        const banner = this.getOlympusBanner(displayName, data.session.projectPath);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `${banner}\n\n${modeLabel} — /use main 으로 오케스트레이터 복귀`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ '${displayName}' 연결 실패\n\n\`/sessions\`로 연결 가능한 세션을 확인하세요.`,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // /team <prompt> - Team Engineering Protocol via async API + polling
    this.bot.command('team', async (ctx) => {
      const text = ctx.message.text;
      const prompt = text.replace(/^\/team\s*/, '').trim();

      if (!prompt) {
        await ctx.reply(
          '❌ 요청 내용을 입력해주세요.\n\n' +
          '예:\n' +
          '`/team 로그인 UI 개선`\n' +
          '`/team 장바구니 기능 추가`\n' +
          '`/team 결제 시스템 리팩토링`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const statusMsg = await ctx.reply(`🚀 *Team Engineering Protocol* 시작 중...`, { parse_mode: 'Markdown' });
      await ctx.sendChatAction('typing');

      try {
        // 1. 비동기 실행 요청
        const startRes = await fetch(`${this.config.gatewayUrl}/api/cli/run/async`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            prompt: `[TEAM ENGINEERING PROTOCOL] Execute the Team Engineering Protocol defined in your CLAUDE.md for the following task. Activate all On-Demand agents, follow the full workflow (Skill Discovery → Work Decomposition → Team Creation → Consensus → 2-Phase Development → Review → QA). Task: ${prompt}`,
            sessionKey: `telegram:${ctx.chat.id}:team`,
            provider: 'claude',
            timeoutMs: 1_800_000,
            dangerouslySkipPermissions: true,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!startRes.ok) {
          const error = await startRes.json() as { message: string };
          throw new Error(error.message);
        }

        const { taskId } = await startRes.json() as { taskId: string };
        await this.pollTeamTask(ctx, taskId, statusMsg.message_id);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.telegram.editMessageText(
          ctx.chat.id, statusMsg.message_id, undefined,
          `❌ Team 오류: ${msg}`
        ).catch(() => {});
      }
    });

    // /codex - Send query to Codex Orchestrator via RPC
    this.bot.command('codex', async (ctx) => {
      const text = ctx.message.text.replace(/^\/codex\s*/, '').trim();

      if (!text) {
        await this.safeReply(ctx,
          '🤖 *Codex Orchestrator*\n\n' +
          '사용법: `/codex <질문>`\n\n' +
          '예:\n' +
          '`/codex 알파 프로젝트 빌드해줘`\n' +
          '`/codex 모든 프로젝트 상태`\n' +
          '`/codex deploy 관련 작업 검색`',
          'Markdown'
        );
        return;
      }

      if (!this.isConnected) {
        await this.safeReply(ctx, '❌ Gateway에 연결되지 않았습니다.', undefined);
        return;
      }

      const statusMsg = await ctx.reply('🤖 Codex 처리 중...');

      try {
        const result = await this.rpc('codex.route', { text, source: 'telegram' }) as {
          requestId: string;
          decision: { type: string; targetSessions: string[]; processedInput: string; confidence: number; reason: string };
          response?: { type: string; content: string; metadata: Record<string, unknown>; rawOutput?: string; agentInsight?: string };
        };

        const d = result.decision;
        const r = result.response;
        const confPercent = Math.round(d.confidence * 100);

        let reply = `🤖 *Codex 응답*\n\n`;
        reply += `📋 유형: ${d.type} (${confPercent}%)\n`;
        if (d.targetSessions.length > 0) {
          reply += `🎯 대상: ${d.targetSessions.join(', ')}\n`;
        }
        if (r?.content) {
          reply += `\n${r.content}`;
        }
        if (r?.agentInsight) {
          reply += `\n\n💡 ${r.agentInsight}`;
        }

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          reply.slice(0, TELEGRAM_MSG_LIMIT),
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ Codex 오류: ${(err as Error).message}`
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
        await ctx.reply('💡 /tasks 기능은 Codex 작업 추적 시스템과 연동됩니다.\n현재 대시보드에서 실시간 스트리밍으로 작업 진행 상황을 확인할 수 있습니다.');
      }
    });

    // /last - Show last output from active session
    this.bot.command('last', async (ctx) => {
      const targetName = this.getActiveSessionName(ctx.chat.id);
      if (!targetName) {
        await this.safeReply(ctx, '❌ 연결된 세션이 없습니다.', undefined);
        return;
      }

      const sessions = this.chatSessions.get(ctx.chat.id);
      const sessionId = sessions?.get(targetName);
      if (!sessionId) {
        await this.safeReply(ctx, '❌ 세션을 찾을 수 없습니다.', undefined);
        return;
      }

      const history = this.outputHistory.get(sessionId);
      if (!history || history.length === 0) {
        await this.safeReply(ctx, '📭 아직 출력이 없습니다.', undefined);
        return;
      }

      const lastOutput = history[history.length - 1];
      const displayName = targetName.replace(/^olympus-/, '');
      await this.sendLongMessage(ctx.chat.id, `📋 [${displayName}] 마지막 출력\n\n${lastOutput}`);
    });

    // /workers - List registered workers
    this.bot.command('workers', async (ctx) => {
      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/workers`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
        const { workers } = await res.json() as { workers: Array<{ id: string; name: string; projectPath: string; status: string; registeredAt: number; currentTaskPrompt?: string }> };

        if (workers.length === 0) {
          await ctx.reply(
            '📭 등록된 워커가 없습니다.\n\n' +
            '💡 터미널에서 워커를 시작하세요:\n' +
            '`olympus start --name hub --project ~/dev/console`',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        let msg = `⚡ *워커 목록* (${workers.length}개)\n\n`;

        for (const w of workers) {
          const icon = w.status === 'idle' ? '🟢' : w.status === 'busy' ? '🔴' : '⚫';
          const statusText = w.status === 'idle' ? '대기 중' : w.status === 'busy' ? '작업 중' : '오프라인';
          const shortPath = w.projectPath.replace(/^\/Users\/[^/]+\//, '~/');
          const age = this.formatAge(w.registeredAt);

          msg += `*${w.name}* ${icon} ${statusText}\n`;
          msg += `📂 \`${shortPath}\`\n`;
          msg += `⏱ ${age}\n`;
          if (w.currentTaskPrompt) {
            msg += `💬 ${w.currentTaskPrompt.slice(0, 60)}${w.currentTaskPrompt.length > 60 ? '...' : ''}\n`;
          }
          msg += `➡️ \`@${w.name} 명령\`\n\n`;
        }

        msg += `${'─'.repeat(25)}\n`;
        msg += `💡 *사용법*: \`@워커이름 작업내용\`\n`;
        msg += `🧭 모드 전환: \`/use <세션>\`, \`/use main\`\n\n`;
        msg += `*빠른 템플릿*\n`;
        for (const worker of workers.slice(0, 3)) {
          msg += `• \`@${worker.name} 상황파악하고 오늘 우선순위 3개 정리해줘\`\n`;
        }
        msg += `• \`@${workers[0].name} 빌드하고 테스트 돌려줘\``;

        await ctx.reply(msg, { parse_mode: 'Markdown' });
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

      // Direct mode: bypass Codex, send directly to session
      if (this.directMode.get(ctx.chat.id)) {
        await this.handleDirectMessage(ctx, text);
        return;
      }

      // 모든 메시지 → Codex chat
      await ctx.sendChatAction('typing');

      try {
        const chatRes = await fetch(`${this.config.gatewayUrl}/api/codex/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({ message: text, chatId: ctx.chat.id }),
          signal: AbortSignal.timeout(1_800_000),
        });

        if (!chatRes.ok) {
          throw new Error(`Codex chat failed: ${chatRes.status}`);
        }

        const data = await chatRes.json() as { type: string; response?: string; taskId?: string };
        // Skip delegation responses — WebSocket worker:task:assigned handles the notification
        if (data.type !== 'delegation' && data.response) {
          await this.sendLongMessage(ctx.chat.id, data.response);
        }
      } catch (err) {
        structuredLog('warn', 'telegram-bot', 'codex_chat_fallback', { error: (err as Error).message });
        try {
          await this.forwardToCli(ctx, text, `telegram:${ctx.chat.id}`);
        } catch (fallbackErr) {
          if ((fallbackErr as Error).name === 'TimeoutError') {
            await this.safeReply(ctx, '응답 시간 초과', undefined);
          } else {
            await this.safeReply(ctx, `오류: ${(fallbackErr as Error).message}`, undefined);
          }
        }
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
          const statusIcon = w.status === 'idle' ? '🟢' : '🔵';
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
      // Markdown parsing failed — retry with plain text
      try {
        const plainText = text.replace(/[*_`\[\]()~>#+=|{}.!-]/g, '');
        await ctx.reply(plainText);
      } catch (fallbackErr) {
        structuredLog('error', 'telegram-bot', 'reply_failed', {
          chatId: ctx.chat?.id,
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

  private getActiveSessionName(chatId: number): string | null {
    const activeName = this.activeSession.get(chatId);
    const sessions = this.chatSessions.get(chatId);

    // If active session exists and is still connected, use it
    if (activeName && sessions?.has(activeName)) {
      return activeName;
    }

    // Otherwise use first connected session
    if (sessions && sessions.size > 0) {
      const firstName = sessions.keys().next().value as string;
      if (firstName) {
        this.activeSession.set(chatId, firstName);
        return firstName;
      }
    }

    return null;
  }

  /**
   * Resolve session name (handles olympus- prefix)
   */
  private resolveSessionName(chatId: number, name: string): string | null {
    const sessions = this.chatSessions.get(chatId);
    if (!sessions) return null;

    // Try exact match first
    if (sessions.has(name)) return name;

    // Try with olympus- prefix
    const withPrefix = `olympus-${name}`;
    if (sessions.has(withPrefix)) return withPrefix;

    return null;
  }

  /**
   * Ensure the main session (main) is connected for this chat.
   * Auto-connects to Gateway if not already in local state.
   */
  private async ensureMainSessionConnected(chatId: number): Promise<void> {
    const MAIN_SESSION = 'main';
    const sessions = this.chatSessions.get(chatId);

    // Already connected? Verify still alive
    if (sessions?.has(MAIN_SESSION)) {
      const sessionId = sessions.get(MAIN_SESSION)!;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${this.config.gatewayUrl}/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json() as { session: { status: string } };
          if (data.session.status === 'active') return; // Still alive
        }
      } catch { /* fall through to reconnect */ } finally { clearTimeout(timeout); }
      sessions.delete(MAIN_SESSION);
    }

    // Connect to main session via Gateway
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/sessions/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ chatId, tmuxSession: MAIN_SESSION }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json() as { session: { id: string; name: string } };
        let sessionsMap = this.chatSessions.get(chatId);
        if (!sessionsMap) {
          sessionsMap = new Map();
          this.chatSessions.set(chatId, sessionsMap);
        }
        sessionsMap.set(data.session.name, data.session.id);
        this.subscribedRuns.set(data.session.id, chatId);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(createMessage('subscribe', { sessionId: data.session.id })));
        }
        this.activeSession.set(chatId, MAIN_SESSION);
      }
    } catch { /* ignore */ } finally { clearTimeout(timeout); }
  }

  /**
   * Handle text message in direct mode — POST /api/cli/run 동기 호출
   */
  private async handleDirectMessage(ctx: Context & { chat: { id: number }; message: { text: string } }, text: string): Promise<void> {
    // Check for @sessionName prefix: @name message
    const atMatch = text.match(/^@(\S+)\s+(.+)$/s);
    let sessionKey: string;
    let message: string;
    let displayName: string;

    if (atMatch) {
      sessionKey = `telegram:${ctx.chat.id}:${atMatch[1]}`;
      message = atMatch[2];
      displayName = atMatch[1];
    } else {
      const activeName = this.getActiveSessionName(ctx.chat.id);
      displayName = activeName?.replace(/^olympus-/, '') ?? 'default';
      sessionKey = `telegram:${ctx.chat.id}:${displayName}`;
      message = text;
    }

    // "team" or "team:" prefix detection → Team Engineering Protocol (async 30min)
    const teamMatch = message.match(/^team[:\s]\s*(.+)$/is);
    if (teamMatch) {
      const teamPrompt = teamMatch[1].trim();
      const statusMsg = await ctx.reply(`🚀 *Team Engineering Protocol* 시작 중...\n워커: ${displayName}`, { parse_mode: 'Markdown' });
      await ctx.sendChatAction('typing');

      try {
        const startRes = await fetch(`${this.config.gatewayUrl}/api/cli/run/async`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            prompt: `[TEAM ENGINEERING PROTOCOL] Execute the Team Engineering Protocol defined in your CLAUDE.md for the following task. Activate all On-Demand agents, follow the full workflow (Skill Discovery → Work Decomposition → Team Creation → Consensus → 2-Phase Development → Review → QA). Task: ${teamPrompt}`,
            sessionKey: `${sessionKey}:team`,
            provider: 'claude',
            timeoutMs: 1_800_000,
            dangerouslySkipPermissions: true,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!startRes.ok) {
          const error = await startRes.json() as { message: string };
          throw new Error(error.message);
        }

        const { taskId } = await startRes.json() as { taskId: string };
        await this.pollTeamTask(ctx, taskId, statusMsg.message_id);
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
      // Step 1: Codex에 라우팅 요청
      const routeRes = await fetch(`${this.config.gatewayUrl}/api/codex/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ text: message, source: 'telegram', chatId: ctx.chat.id }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!routeRes.ok) throw new Error('Codex route failed');

      const { decision, response: codexResponse } = await routeRes.json() as {
        decision: { type: string; targetSessions: string[]; processedInput: string; confidence: number; reason: string };
        response?: { type: string; content: string; metadata: Record<string, unknown>; rawOutput?: string; agentInsight?: string };
      };

      if (codexResponse && decision.confidence > 0.5) {
        const insight = codexResponse.agentInsight ? `\n\n💡 ${codexResponse.agentInsight}` : '';
        await this.sendLongMessage(ctx.chat.id, `📩 [${displayName}]\n\n${codexResponse.content}${insight}`);
      } else if (codexResponse) {
        // 낮은 confidence SELF_ANSWER → Claude CLI fallback
        await this.forwardToCli(ctx, message, sessionKey, `📩 [${displayName}]`);
      } else if (decision.type === 'MULTI_SESSION') {
        const sessions = decision.targetSessions;
        await this.safeReply(ctx, `🔄 ${sessions.length}개 작업을 병렬로 실행합니다...`, undefined);
        const promises = sessions.map((sid: string, idx: number) =>
          this.forwardToCliAsync(ctx, decision.processedInput, `parallel:${sid}`, `[작업 ${idx + 1}/${sessions.length}]`)
            .catch((err: Error) => this.safeReply(ctx, `❌ 작업 ${idx + 1} 실패: ${err.message}`, undefined))
        );
        await Promise.allSettled(promises);
      } else if (decision.type === 'SESSION_FORWARD') {
        await this.forwardToCli(ctx, decision.processedInput, sessionKey, `📩 [${displayName}]`);
      } else {
        await this.safeReply(ctx, '🤔 요청을 처리할 수 없습니다.', undefined);
      }
    } catch {
      // Codex route 실패 시 fallback: 기존 방식으로 직접 Claude 호출
      try {
        await this.forwardToCli(ctx, message, sessionKey, `📩 [${displayName}]`);
      } catch (err) {
        if ((err as Error).name === 'TimeoutError') {
          await ctx.reply('⏰ 응답 시간 초과 (10분)');
        } else {
          await ctx.reply(`❌ 오류: ${(err as Error).message}`);
        }
      }
    }
  }

  /**
   * Forward a prompt to Claude CLI via async API.
   * R2: Non-blocking — starts async task, returns immediately after initial message,
   * then polls for completion in the background.
   */
  private async forwardToCli(
    ctx: Context & { chat: { id: number } },
    prompt: string,
    sessionKey: string,
    prefix?: string,
  ): Promise<void> {
    // Register DraftStream for real-time Telegram message streaming via editMessageText
    this.streamChatMap.set(sessionKey, ctx.chat.id);
    const draft = this.draftManager.create(this.bot.telegram, ctx.chat.id, sessionKey);

    // Step 1: Start async CLI execution
    const startRes = await fetch(`${this.config.gatewayUrl}/api/cli/run/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        sessionKey,
        provider: 'claude',
        dangerouslySkipPermissions: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!startRes.ok) {
      const error = await startRes.json() as { message: string };
      await draft.cancel(error.message);
      this.draftManager.remove(sessionKey);
      this.streamChatMap.delete(sessionKey);
      throw new Error(error.message);
    }

    const { taskId } = await startRes.json() as { taskId: string };

    // Track this task for duplicate prevention (WI-4.4)
    this.deliveredTasks.add(taskId);

    // Step 2: Fire-and-forget background polling + result delivery
    // Handler returns immediately — DraftStream handles real-time streaming via cli:stream events
    this.pollAndDeliverResult(ctx.chat.id, taskId, sessionKey, draft, prefix).catch(err => {
      structuredLog('error', 'telegram-bot', 'poll_deliver_error', { taskId, error: (err as Error).message });
    });
  }

  /**
   * Background polling: wait for CLI task completion, then deliver final result.
   * Called fire-and-forget from forwardToCli.
   */
  private async pollAndDeliverResult(
    chatId: number,
    taskId: string,
    sessionKey: string,
    draft: DraftStream,
    prefix?: string,
  ): Promise<void> {
    try {
      const result = await this.pollTaskStatus(taskId);

      // Flush any remaining streamed content
      await this.draftManager.handleComplete(sessionKey);
      this.streamChatMap.delete(sessionKey);

      if (!result) {
        await this.bot.telegram.sendMessage(chatId, '⏰ 응답 시간 초과 (30분)');
        return;
      }

      if (!result.success) {
        await this.bot.telegram.sendMessage(chatId, `❌ ${result.error?.type}: ${result.error?.message}`);
        return;
      }

      const footer = result.usage
        ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`
        : '';

      const draftState = draft.getState();
      // If DraftStream sent real-time updates, just append footer
      if (draftState.messageId) {
        if (footer.trim()) {
          await this.bot.telegram.sendMessage(chatId, footer.trim());
        }
      } else {
        // No streaming received — fallback to full message send
        const text = prefix ? `${prefix}\n\n${result.text}${footer}` : `${result.text}${footer}`;
        await this.sendLongMessage(chatId, text);
      }
    } catch (err) {
      this.draftManager.remove(sessionKey);
      this.streamChatMap.delete(sessionKey);
      structuredLog('error', 'telegram-bot', 'poll_deliver_error', { taskId, error: (err as Error).message });
    }
  }

  /**
   * Poll a team task for completion (30min max, 10s interval).
   * Shared by /team command and @worker team prefix.
   */
  private async pollTeamTask(
    ctx: Context & { chat: { id: number } },
    taskId: string,
    statusMsgId: number,
  ): Promise<void> {
    const POLL_INTERVAL = 10_000;
    const MAX_POLLS = 180; // 30분

    for (let polls = 1; polls <= MAX_POLLS; polls++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      try {
        const statusRes = await fetch(
          `${this.config.gatewayUrl}/api/cli/run/${taskId}/status`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(10_000),
          }
        );
        const data = await statusRes.json() as {
          status: string;
          result?: CliRunResult;
          error?: string;
          elapsedMs?: number;
        };

        if (data.status === 'completed' && data.result) {
          const result = data.result;
          const footer = result.usage
            ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`
            : '';

          const fullText = `✅ *Team 완료*\n\n${result.text}${footer}`;
          const chunks = splitLongMessage(fullText, 4000);
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            chunks[0], { parse_mode: 'Markdown' }
          ).catch(() => {});
          for (let i = 1; i < chunks.length; i++) {
            await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => {});
          }
          return;
        }

        if (data.status === 'failed') {
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            `❌ Team 실패: ${data.error}`
          ).catch(() => {});
          return;
        }

        // Progress update every 60초
        if (polls % 6 === 0) {
          const elapsed = Math.round((data.elapsedMs ?? polls * POLL_INTERVAL) / 1000);
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            `🔄 *Team 진행 중...* (${elapsed}초 경과)`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      } catch {
        // 네트워크 에러 시 다음 폴링까지 대기
        continue;
      }
    }

    // 타임아웃
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsgId, undefined,
      '⏰ Team 타임아웃 (30분)'
    ).catch(() => {});
  }

  /**
   * Forward a prompt to Claude CLI via async API (non-blocking).
   * Used for parallel/long-running tasks.
   */
  private async forwardToCliAsync(
    ctx: Context & { chat: { id: number } },
    prompt: string,
    sessionKey: string,
    prefix?: string,
  ): Promise<void> {
    const startRes = await fetch(`${this.config.gatewayUrl}/api/cli/run/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        sessionKey,
        provider: 'claude',
        dangerouslySkipPermissions: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!startRes.ok) {
      const error = await startRes.json() as { message: string };
      throw new Error(error.message);
    }

    const { taskId } = await startRes.json() as { taskId: string };
    await this.safeReply(ctx, `${prefix ? prefix + ' ' : ''}⏳ 작업 시작 (${taskId.slice(0, 8)})`, undefined);

    const result = await this.pollTaskStatus(taskId);

    if (!result) {
      await this.safeReply(ctx, `${prefix ? prefix + ' ' : ''}⏰ 작업 시간 초과 (30분)`, undefined);
      return;
    }

    if (!result.success) {
      await this.safeReply(ctx, `${prefix ? prefix + ' ' : ''}❌ ${result.error?.type}: ${result.error?.message}`, undefined);
      return;
    }

    const footer = result.usage
      ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`
      : '';

    const text = prefix ? `${prefix}\n\n${result.text}${footer}` : `${result.text}${footer}`;
    await this.sendLongMessage(ctx.chat.id, text);
  }

  /**
   * Poll async task status until completion (sleep-last pattern: check first, sleep after).
   */
  private async pollTaskStatus(taskId: string): Promise<CliRunResult | null> {
    const maxPolls = 180;
    const pollInterval = 10_000;

    for (let i = 0; i < maxPolls; i++) {
      try {
        const res = await fetch(
          `${this.config.gatewayUrl}/api/cli/run/${taskId}/status`,
          {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (res.ok) {
          const data = await res.json() as { status: string; result?: CliRunResult; error?: string };

          if (data.status === 'completed' && data.result) {
            return data.result;
          }
          if (data.status === 'failed') {
            return {
              success: false,
              text: '',
              sessionId: '',
              model: '',
              usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
              cost: 0,
              durationMs: 0,
              numTurns: 0,
              error: { type: 'unknown', message: data.error ?? 'Task failed' },
            };
          }
        }
      } catch {
        // Network error -> continue polling
      }

      // Sleep after check (sleep-last pattern)
      await new Promise(r => setTimeout(r, pollInterval));
    }

    return null;
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
   * Enqueue a message for a session to prevent interleaving across sessions.
   * Messages for the same session are sent sequentially.
   */
  private enqueueSessionMessage(sessionId: string, chatId: number, text: string, sessionPrefix?: string): void {
    const prev = this.sendQueues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(() =>
      this.sendLongMessage(chatId, text, sessionPrefix).catch(console.error)
    );
    this.sendQueues.set(sessionId, next);
    // Clean up resolved promise to prevent memory leak
    next.then(() => {
      if (this.sendQueues.get(sessionId) === next) {
        this.sendQueues.delete(sessionId);
      }
    });
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

      // Re-subscribe to all sessions
      for (const sessionId of this.subscribedRuns.keys()) {
        this.ws?.send(JSON.stringify(createMessage('subscribe', { sessionId })));
      }

      // Start ping interval to keep connection alive
      this.startPing();

      // Re-sync sessions from gateway on reconnect to prune stale sessions
      // Sync for all known chats + allowedUsers
      const chatIds = new Set([...this.config.allowedUsers, ...this.chatSessions.keys()]);
      for (const chatId of chatIds) {
        this.syncSessionsFromGateway(chatId).catch(() => {});
      }

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

    // Handle broadcast events (no sessionId) before the sessionId guard
    if (msg.type === 'sessions:list') {
      this.throttledSyncAllChats();
      return;
    }

    // Handle CLI stream chunks — route to DraftStream for real-time Telegram updates
    if (msg.type === 'cli:stream') {
      const chunk = msg.payload as { sessionKey: string; chunk: string };
      if (chunk.sessionKey && this.streamChatMap.has(chunk.sessionKey)) {
        this.draftManager.handleStreamChunk(chunk.sessionKey, chunk.chunk).catch(err => {
          structuredLog('error', 'telegram-bot', 'draft_stream_error', { error: (err as Error).message });
        });
      }
      return;
    }

    // Handle CLI complete — flush DraftStream
    if (msg.type === 'cli:complete') {
      const completePayload = msg.payload as { sessionKey?: string };
      if (completePayload.sessionKey && this.streamChatMap.has(completePayload.sessionKey)) {
        this.draftManager.handleComplete(completePayload.sessionKey).catch(err => {
          structuredLog('error', 'telegram-bot', 'draft_complete_error', { error: (err as Error).message });
        });
        this.streamChatMap.delete(completePayload.sessionKey);
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
        const text = `🔄 [${taskPayload.workerName}] 작업 시작${promptText}`;

        this.sendLongMessage(targetChatId, text).catch((err) => {
          structuredLog('error', 'telegram-bot', 'task_assigned_send_failed', { error: (err as Error).message });
        });
      }
    }

    // Handle worker task:completed — Codex가 요약한 결과를 텔레그램에 전달
    if (msg.type === 'worker:task:completed') {
      const taskPayload = msg.payload as {
        taskId: string;
        workerName: string;
        chatId?: number;
        summary?: string;
        filteredText?: string;
        success: boolean;
        durationMs?: number;
        geminiReview?: { quality: string; summary: string; concerns: string[] };
      };

      // WI-4.5: Update last seen task timestamp for catch-up
      this.lastSeenTaskTimestamp = Date.now();

      // WI-4.4: Skip if already delivered via forwardToCli polling
      if (this.deliveredTasks.has(taskPayload.taskId)) {
        this.deliveredTasks.delete(taskPayload.taskId);
        return;
      }

      const targetChatId = taskPayload.chatId ?? this.config.allowedUsers[0];
      if (targetChatId) {
        const durationSec = Math.round((taskPayload.durationMs ?? 0) / 1000);
        const icon = taskPayload.success ? '✅' : '❌';
        // R5: Prefer filteredText (pre-filtered by gateway) over raw summary
        const summaryText = taskPayload.filteredText ?? taskPayload.summary ?? (taskPayload.success ? '작업 완료' : '작업 실패');
        let text = `[${taskPayload.workerName}] ${icon} 완료 (${durationSec}초)\n\n${summaryText}`;

        // Append Gemini review badge if available
        if (taskPayload.geminiReview) {
          const qualityIcon = taskPayload.geminiReview.quality === 'critical' ? '🔴' : taskPayload.geminiReview.quality === 'warning' ? '🟡' : '🟢';
          text += `\n\n${qualityIcon} Gemini 검토: ${taskPayload.geminiReview.summary}`;
          if (taskPayload.geminiReview.concerns.length > 0) {
            text += `\n⚠️ ${taskPayload.geminiReview.concerns.join('\n⚠️ ')}`;
          }
        }

        this.sendLongMessage(targetChatId, text).catch((err) => {
          structuredLog('error', 'telegram-bot', 'task_completed_send_failed', { error: (err as Error).message });
        });
      }
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

    // Handle worker task:final_after_timeout — 타임아웃 후 최종 완료
    if (msg.type === 'worker:task:final_after_timeout') {
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
        const icon = taskPayload.success ? '✅' : '❌';
        const summaryText = taskPayload.summary ?? (taskPayload.success ? '작업 완료' : '작업 실패');
        const text = `[${taskPayload.workerName}] ${icon} 최종 완료 (${durationMin}분)\n\n${summaryText}`;
        this.sendLongMessage(targetChatId, text).catch((err) => {
          structuredLog('error', 'telegram-bot', 'task_final_send_failed', { error: (err as Error).message });
        });
      }
      return;
    }

    // Handle codex:greeting — proactive startup briefing from Codex
    if (msg.type === 'codex:greeting') {
      const greetingPayload = msg.payload as { type: string; text: string; timestamp: number };
      if (greetingPayload.text) {
        const targetChatId = this.config.allowedUsers[0];
        if (targetChatId) {
          this.sendLongMessage(targetChatId, `🏛️ **Olympus 브리핑**\n\n${greetingPayload.text}`)
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
        const text = `📝 [${summaryPayload.workerName}] 작업 요약\n\n${summaryPayload.summary}`;
        this.sendLongMessage(chatId, text).catch(() => {});
      }
      return;
    }

    const payload = msg.payload as { sessionId?: string; runId?: string };
    const sessionId = payload.sessionId ?? payload.runId;

    if (!sessionId) return;

    const chatId = this.subscribedRuns.get(sessionId);
    if (!chatId) return;

    switch (msg.type) {
      case 'session:screen': {
        const content = (payload as { content?: string }).content;
        if (content && content.trim()) {
          // Find session name
          let sessionName = '';
          const sessions = this.chatSessions.get(chatId);
          if (sessions) {
            for (const [name, sId] of sessions) {
              if (sId === sessionId) {
                sessionName = name;
                break;
              }
            }
          }
          const displayName = sessionName.replace(/^olympus-/, '') || sessionId.slice(0, 8);
          const prefix = `📩 [${displayName}]`;

          // Store in output history (always, for /last command)
          let history = this.outputHistory.get(sessionId);
          if (!history) {
            history = [];
            this.outputHistory.set(sessionId, history);
          }
          history.push(content);
          if (history.length > OlympusBot.OUTPUT_HISTORY_SIZE) {
            history.shift();
          }

          // Raw 전달 (digest 제거됨 — 동기 HTTP가 메인 경로)
          this.enqueueSessionMessage(sessionId, chatId, `${prefix}\n\n${content}`, prefix);
        }
        break;
      }

      case 'session:error': {
        const error = (payload as { error?: string }).error;
        if (error) {
          this.enqueueSessionMessage(sessionId, chatId, `❌ 오류: ${error}`);
        }
        break;
      }

      case 'session:closed': {
        // Find session name for the closed session
        let closedName = '';
        for (const [cId, sessions] of this.chatSessions.entries()) {
          for (const [name, sId] of sessions) {
            if (sId === sessionId) {
              closedName = name;
              sessions.delete(name);
              // If this was the active session, clear it
              if (this.activeSession.get(cId) === name) {
                this.activeSession.delete(cId);
                // Set another session as active if available
                if (sessions.size > 0) {
                  const nextName = sessions.keys().next().value as string;
                  if (nextName) {
                    this.activeSession.set(cId, nextName);
                  }
                }
              }
              break;
            }
          }
        }
        this.subscribedRuns.delete(sessionId);
        this.outputHistory.delete(sessionId);
        this.sendQueues.delete(sessionId);

        const displayClosed = (closedName || sessionId.slice(0, 8)).replace(/^olympus-/, '');
        this.bot.telegram.sendMessage(
          chatId,
          `🛑 세션 '${displayClosed}' 종료됨`
        ).catch(console.error);
        break;
      }

      // Legacy support for existing run events (for team protocol)
      case 'phase:change': {
        const p = payload as PhasePayload;
        if (p.status === 'completed') {
          this.enqueueSessionMessage(sessionId, chatId, `📍 Phase ${p.phase} 완료: ${p.phaseName}`);
        }
        break;
      }

      case 'agent:complete': {
        const a = payload as AgentPayload;
        const content = a.content ?? '';
        // Agent results: show brief summary only
        const summary = content.length > 200 ? safeSlice(content, 200) + '...' : content;
        this.enqueueSessionMessage(sessionId, chatId, `✅ *${a.agentId}* 완료\n\n${summary}`);
        break;
      }

      case 'agent:error': {
        const a = payload as AgentPayload;
        this.enqueueSessionMessage(sessionId, chatId, `❌ ${a.agentId} 오류: ${safeSlice(a.error ?? '', 200)}`);
        break;
      }

      case 'run:complete': {
        this.enqueueSessionMessage(sessionId, chatId, `🎉 작업 완료!`);
        break;
      }

      case 'log': {
        const l = payload as LogPayload;
        if (l.level === 'error') {
          this.enqueueSessionMessage(sessionId, chatId, `⚠️ ${safeSlice(l.message, 300)}`);
        }
        break;
      }
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

    // Periodic cleanup of deliveredTasks set (every 30 minutes)
    this.deliveredTasksCleanupTimer = setInterval(() => {
      this.deliveredTasks.clear();
    }, 30 * 60_000);

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

      // Sync sessions from Gateway for all allowed users + known chats
      const chatIds = new Set([...this.config.allowedUsers, ...this.chatSessions.keys()]);
      for (const chatId of chatIds) {
        await this.syncSessionsFromGateway(chatId);
      }

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
    if (this.deliveredTasksCleanupTimer) clearInterval(this.deliveredTasksCleanupTimer);
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
   * Sync ALL active sessions from Gateway for a specific chat.
   * Single-user tool: subscribe to all sessions regardless of chatId ownership.
   */
  /**
   * Throttled sync for all known chats — triggered by sessions:list WS broadcast.
   * Coalesces rapid-fire events into a single sync cycle (1s throttle).
   */
  private throttledSyncAllChats(): void {
    if (this.syncThrottleTimer) return; // Already scheduled
    this.syncThrottleTimer = setTimeout(() => {
      this.syncThrottleTimer = null;
      // Collect all chat IDs: existing sessions + allowed users (for empty-state recovery)
      const chatIds = new Set<number>([
        ...this.chatSessions.keys(),
        ...this.config.allowedUsers,
      ]);
      for (const chatId of chatIds) {
        if (chatId > 0) {
          this.syncSessionsFromGateway(chatId).catch((err) => {
            structuredLog('warn', 'telegram', 'sessions:list sync failed', { chatId, error: String(err) });
          });
        }
      }
    }, this.syncThrottleMs);
  }

  /**
   * WI-4.5: Catch up on missed worker task completions after WebSocket reconnect.
   */
  private async catchUpMissedWorkerTasks(): Promise<void> {
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/workers/tasks`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;

      const { tasks } = await res.json() as { tasks: Array<{ taskId: string; workerName: string; status: string; completedAt?: number; chatId?: number; result?: { success: boolean; text?: string } }> };

      for (const task of tasks) {
        if (!task.completedAt || !task.chatId) continue;
        if (task.completedAt <= this.lastSeenTaskTimestamp) continue;
        if (this.deliveredTasks.has(task.taskId)) continue;
        if (task.status !== 'completed' && task.status !== 'failed') continue;

        const icon = task.result?.success ? '✅' : '❌';
        const filtered = filterForTelegram(task.result?.text ?? '');
        const text = `[${task.workerName}] ${icon} 완료 (재접속 중 수신)\n\n${safeSlice(filtered.text, 2000)}`;
        await this.sendLongMessage(task.chatId, text).catch(() => {});
      }

      this.lastSeenTaskTimestamp = Date.now();
    } catch { /* ignore */ }
  }

  private async syncSessionsFromGateway(chatId: number): Promise<void> {
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/sessions`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });

      if (!res.ok) return;

      const data = await res.json() as { sessions: Array<{ id: string; name: string; chatId: number; status: string }> };
      // Subscribe to ALL active sessions (not just this chatId — single-user tool)
      const activeSessions = data.sessions.filter(s => s.status === 'active');

      // Get or create sessions map for this chat
      let sessionsMap = this.chatSessions.get(chatId);
      if (!sessionsMap) {
        sessionsMap = new Map();
        this.chatSessions.set(chatId, sessionsMap);
      }

      // If gateway returns no active sessions, clear all local sessions for this chat
      if (activeSessions.length === 0) {
        for (const [, sessionId] of sessionsMap) {
          this.subscribedRuns.delete(sessionId);
          this.outputHistory.delete(sessionId);
        }
        sessionsMap.clear();
        this.activeSession.delete(chatId);
        return;
      }

      // Build set of active session IDs from gateway
      const activeSessionIds = new Set(activeSessions.map(s => s.id));

      // Prune stale sessions (sessions in local state that gateway doesn't have)
      for (const [name, sessionId] of sessionsMap) {
        if (!activeSessionIds.has(sessionId)) {
          sessionsMap.delete(name);
          this.subscribedRuns.delete(sessionId);
          this.outputHistory.delete(sessionId);

          if (this.activeSession.get(chatId) === name) {
            this.activeSession.delete(chatId);
          }
        }
      }

      // Add NEW sessions from gateway that aren't in local state
      for (const session of activeSessions) {
        if (!sessionsMap.has(session.name)) {
          sessionsMap.set(session.name, session.id);

          // Subscribe to session events via WebSocket
          this.subscribedRuns.set(session.id, chatId);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(createMessage('subscribe', { sessionId: session.id })));
          }
        }
      }

      // Set active session: prefer main session in orchestrator mode
      if (!this.directMode.get(chatId) && sessionsMap.has('main')) {
        this.activeSession.set(chatId, 'main');
      } else if (!this.activeSession.get(chatId) && sessionsMap.size > 0) {
        const firstName = sessionsMap.keys().next().value as string;
        if (firstName) {
          this.activeSession.set(chatId, firstName);
        }
      }
    } catch {
      // Ignore errors
    }
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
