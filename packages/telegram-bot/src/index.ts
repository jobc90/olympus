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

class OlympusBot {
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
      await ctx.reply(
        `⚡ *Olympus Bot*\n\n` +
        `메시지를 입력하면 Claude CLI가 동기적으로 처리하고 결과를 반환합니다.\n\n` +
        `*사용법:*\n` +
        `• 메시지 입력 → Claude CLI 실행 → 결과 수신\n` +
        `• \`@세션 메시지\` → 특정 세션으로 전송 (직접 모드)\n\n` +
        `*명령어:*\n` +
        `/sessions - 세션 목록\n` +
        `/use direct <이름> - 직접 모드\n` +
        `/use main - 오케스트레이터 모드 복귀\n` +
        `/orchestration <요청> - Multi-AI Orchestration\n` +
        `/close [이름] - 세션 해제\n` +
        `/health - 상태 확인\n` +
        `/codex <질문> - Codex Orchestrator\n` +
        `/last - 마지막 출력 확인\n\n` +
        `*모드:*\n` +
        `• 🤖 오케스트레이터 (기본): 동기 CLI 호출\n` +
        `• 🔗 직접: 특정 세션에 바로 전송`,
        { parse_mode: 'Markdown' }
      );
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
        let msg = '';

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
        const mode = this.directMode.get(ctx.chat.id) ? '🔗 직접' : '🤖 오케스트레이터';
        await ctx.reply(
          `현재 모드: ${mode}\n\n` +
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

    // /orchestration <prompt> - Multi-AI orchestration via async API + polling
    this.bot.command('orchestration', async (ctx) => {
      const text = ctx.message.text;
      const prompt = text.replace(/^\/orchestration\s*/, '').trim();

      if (!prompt) {
        await ctx.reply(
          '❌ 요청 내용을 입력해주세요.\n\n' +
          '예:\n' +
          '`/orchestration 로그인 UI 개선` (Auto)\n' +
          '`/orchestration --plan 장바구니 추가` (확인)\n' +
          '`/orchestration --strict 결제 리팩토링` (엄격)',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const statusMsg = await ctx.reply(`🚀 *Multi-AI Orchestration* 시작 중...`, { parse_mode: 'Markdown' });
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
            prompt: `/orchestration "${prompt}"`,
            sessionKey: `telegram:${ctx.chat.id}:orchestration`,
            provider: 'claude',
            timeoutMs: 1_800_000,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!startRes.ok) {
          const error = await startRes.json() as { message: string };
          throw new Error(error.message);
        }

        const { taskId } = await startRes.json() as { taskId: string };

        // 2. 폴링으로 결과 대기
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

              const fullText = `✅ *Orchestration 완료*\n\n${result.text}${footer}`;
              const chunks = splitLongMessage(fullText, 4000);
              await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsg.message_id, undefined,
                chunks[0], { parse_mode: 'Markdown' }
              ).catch(() => {});
              for (let i = 1; i < chunks.length; i++) {
                await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => {});
              }
              return;
            }

            if (data.status === 'failed') {
              await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsg.message_id, undefined,
                `❌ Orchestration 실패: ${data.error}`
              ).catch(() => {});
              return;
            }

            // Progress update every 60초
            if (polls % 6 === 0) {
              const elapsed = Math.round((data.elapsedMs ?? polls * POLL_INTERVAL) / 1000);
              await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsg.message_id, undefined,
                `🔄 *Orchestration 진행 중...* (${elapsed}초 경과)`,
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
          ctx.chat.id, statusMsg.message_id, undefined,
          '⏰ Orchestration 타임아웃 (30분)'
        ).catch(() => {});
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.telegram.editMessageText(
          ctx.chat.id, statusMsg.message_id, undefined,
          `❌ Orchestration 오류: ${msg}`
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

    // Handle text messages — orchestrator mode (default) or direct mode
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // If it starts with /, it's an unknown command
      if (text.startsWith('/')) {
        await ctx.reply('알 수 없는 명령어입니다. /start 로 도움말을 확인하세요.');
        return;
      }

      // Direct mode: POST /api/cli/run with session routing
      if (this.directMode.get(ctx.chat.id)) {
        await this.handleDirectMessage(ctx, text);
        return;
      }

      // Orchestrator mode (default): POST /api/cli/run 동기 호출
      await ctx.sendChatAction('typing');

      try {
        const response = await fetch(`${this.config.gatewayUrl}/api/cli/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            prompt: text,
            sessionKey: `telegram:${ctx.chat.id}`,
            provider: 'claude',
          }),
          signal: AbortSignal.timeout(600_000),
        });

        if (!response.ok) {
          const error = await response.json() as { message: string };
          throw new Error(error.message);
        }

        const { result } = await response.json() as { result: CliRunResult };

        if (!result.success) {
          await this.safeReply(ctx, `❌ ${result.error?.type}: ${result.error?.message}`, undefined);
          return;
        }

        const footer = result.usage
          ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`
          : '';

        await this.sendLongMessage(ctx.chat.id, `${result.text}${footer}`);
      } catch (err) {
        if ((err as Error).name === 'TimeoutError') {
          await this.safeReply(ctx, '⏰ 응답 시간 초과 (10분)', undefined);
        } else {
          await this.safeReply(ctx, `❌ 오류: ${(err as Error).message}`, undefined);
        }
      }
    });

    // Inline query handler - show available sessions
    this.bot.on('inline_query', async (ctx) => {
      const query = ctx.inlineQuery.query;
      const chatId = ctx.from.id;

      // Get sessions for this user
      const sessions = this.chatSessions.get(chatId);
      const results: InlineQueryResult[] = [];

      if (sessions && sessions.size > 0) {
        for (const [name, sessionId] of sessions) {
          // Filter by query if provided
          if (query && !name.toLowerCase().includes(query.toLowerCase())) {
            continue;
          }

          const isActive = this.activeSession.get(chatId) === name;
          results.push({
            type: 'article',
            id: sessionId,
            title: `${isActive ? '✨ ' : ''}${name}`,
            description: isActive ? '현재 활성 세션' : '클릭하여 메시지 전송',
            input_message_content: {
              message_text: `@${name} `,
            },
          });
        }
      }

      // Always add option to create new session
      results.push({
        type: 'article',
        id: 'new-session',
        title: '➕ 새 세션 생성',
        description: query ? `'${query}' 이름으로 새 세션 생성` : '새 세션 생성',
        input_message_content: {
          message_text: `/new ${query || 'main'}`,
        },
      });

      await ctx.answerInlineQuery(results, {
        cache_time: 5, // Short cache for real-time updates
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

    await ctx.sendChatAction('typing');

    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/cli/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          prompt: message,
          sessionKey,
          provider: 'claude',
        }),
        signal: AbortSignal.timeout(600_000),
      });

      if (!response.ok) {
        const error = await response.json() as { message: string };
        throw new Error(error.message);
      }

      const { result } = await response.json() as { result: CliRunResult };

      if (!result.success) {
        await ctx.reply(`❌ ${result.error?.type}: ${result.error?.message}`);
        return;
      }

      const footer = result.usage
        ? `\n\n📊 ${result.usage.inputTokens + result.usage.outputTokens} 토큰 | $${result.cost?.toFixed(4)} | ${Math.round((result.durationMs ?? 0) / 1000)}초`
        : '';

      await this.sendLongMessage(ctx.chat.id, `📩 [${displayName}]\n\n${result.text}${footer}`);
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        await ctx.reply('⏰ 응답 시간 초과 (10분)');
      } else {
        await ctx.reply(`❌ 오류: ${(err as Error).message}`);
      }
    }
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
  private async sendLongMessage(chatId: number, text: string, sessionPrefix?: string): Promise<void> {
    if (text.length <= TELEGRAM_MSG_LIMIT) {
      await this.bot.telegram.sendMessage(chatId, text);
      return;
    }

    // Split on line boundaries
    const lines = text.split('\n');
    let chunk = '';
    let partNum = 1;

    for (const line of lines) {
      if (chunk.length + line.length + 1 > TELEGRAM_MSG_LIMIT) {
        if (chunk) {
          await this.bot.telegram.sendMessage(chatId, chunk.trimEnd());
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
            await this.bot.telegram.sendMessage(chatId, line.slice(i, i + TELEGRAM_MSG_LIMIT));
            partNum++;
          }
          continue;
        }
      }
      chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk.trim()) {
      await this.bot.telegram.sendMessage(chatId, chunk.trimEnd());
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

    // Handle codex:session-event (broadcast to all chats)
    if (msg.type === 'codex:session-event') {
      const event = msg.payload as { sessionId?: string; status?: string; projectName?: string };
      if (event.sessionId && event.status) {
        const statusIcon = event.status === 'ready' ? '🟢' : event.status === 'busy' ? '🔵' : event.status === 'closed' ? '🔴' : '⚪';
        const text = `${statusIcon} Codex 세션 [${event.projectName ?? event.sessionId.slice(0, 8)}]: ${event.status}`;
        // Notify all known chats
        for (const chatId of this.chatSessions.keys()) {
          this.bot.telegram.sendMessage(chatId, text).catch(() => {});
        }
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

      // Legacy support for existing run events (for orchestration)
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
        const summary = content.length > 200 ? content.slice(0, 200) + '...' : content;
        this.enqueueSessionMessage(sessionId, chatId, `✅ *${a.agentId}* 완료\n\n${summary}`);
        break;
      }

      case 'agent:error': {
        const a = payload as AgentPayload;
        this.enqueueSessionMessage(sessionId, chatId, `❌ ${a.agentId} 오류: ${(a.error ?? '').slice(0, 200)}`);
        break;
      }

      case 'run:complete': {
        this.enqueueSessionMessage(sessionId, chatId, `🎉 작업 완료!`);
        break;
      }

      case 'log': {
        const l = payload as LogPayload;
        if (l.level === 'error') {
          this.enqueueSessionMessage(sessionId, chatId, `⚠️ ${l.message.slice(0, 300)}`);
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

    // Start Telegram bot
    console.log('Starting Olympus Telegram Bot...');
    console.log(`Gateway: ${this.config.gatewayUrl}`);
    console.log(`Allowed users: ${this.config.allowedUsers.length > 0 ? this.config.allowedUsers.join(', ') : 'All'}`);

    try {
      // bot.launch() returns a Promise that resolves only when the bot stops.
      // We fire-and-forget it and detect readiness via a short delay after launch starts.
      let launchErrorMsg: string | null = null;
      this.bot.launch().catch((err: Error) => {
        launchErrorMsg = err.message;
        structuredLog('error', 'telegram-bot', 'bot_launch_failed', {
          category: classifyError(err).category,
          message: err.message,
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

      // Sync sessions from Gateway for all allowed users + known chats
      const chatIds = new Set([...this.config.allowedUsers, ...this.chatSessions.keys()]);
      for (const chatId of chatIds) {
        await this.syncSessionsFromGateway(chatId);
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
