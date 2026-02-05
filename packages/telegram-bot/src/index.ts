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
  private subscribedRuns = new Map<string, number>(); // runId/sessionId -> chatId
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  // Multi-session support: chatId -> Map<sessionName, sessionId>
  private chatSessions = new Map<number, Map<string, string>>();
  private activeSession = new Map<number, string>(); // chatId -> current active session name

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
        `Claude CLI를 원격으로 제어합니다.\n\n` +
        `*세션 시작:*\n` +
        `터미널에서 \`olympus start\`\n\n` +
        `*명령어:*\n` +
        `/sessions - 세션 목록\n` +
        `/use <이름> - 세션 연결/전환\n` +
        `/close [이름] - 세션 해제\n` +
        `/health - 상태 확인\n` +
        `/orchestration <요청> - Multi-AI 협업 모드\n\n` +
        `*메시지 전송:*\n` +
        `• 일반 텍스트 → 활성 세션\n` +
        `• \`@이름 메시지\` → 특정 세션`,
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
        // 1. Get connected sessions
        const sessionsRes = await fetch(`${this.config.gatewayUrl}/api/sessions`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
        const sessionsData = await sessionsRes.json() as { sessions: Array<{ id: string; name?: string; tmuxSession: string; chatId: number; status: string; projectPath: string; createdAt: number }> };
        const connectedSessions = sessionsData.sessions.filter(s => s.chatId === ctx.chat.id && s.status === 'active');

        // 2. Discover available tmux sessions (olympus-*)
        const discoverRes = await fetch(`${this.config.gatewayUrl}/api/sessions/discover`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
        const discoverData = await discoverRes.json() as { tmuxSessions: Array<{ tmuxSession: string; projectPath: string }> };

        // 3. Find unconnected tmux sessions
        const connectedTmux = new Set(connectedSessions.map(s => s.tmuxSession));
        const availableTmux = discoverData.tmuxSessions.filter(t => !connectedTmux.has(t.tmuxSession));

        if (connectedSessions.length === 0 && availableTmux.length === 0) {
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
        let msg = '';

        // Connected sessions
        if (connectedSessions.length > 0) {
          msg += '📋 *연결된 세션*\n\n';
          for (const session of connectedSessions) {
            const rawName = session.name ?? session.tmuxSession;
            const displayName = rawName.replace(/^olympus-/, '');
            const isCurrent = currentDisplayName === displayName;
            const marker = isCurrent ? '✨ ' : '• ';
            const current = isCurrent ? ' _(현재)_' : '';
            msg += `${marker}*${displayName}*${current}\n`;
            msg += `   경로: \`${session.projectPath}\`\n\n`;
          }
        }

        // Available (unconnected) tmux sessions
        if (availableTmux.length > 0) {
          msg += '🖥️ *연결 가능한 세션* (olympus start로 생성됨)\n\n';
          for (const tmux of availableTmux) {
            const displayName = tmux.tmuxSession.replace(/^olympus-/, '');
            msg += `• *${displayName}*\n`;
            msg += `   경로: \`${tmux.projectPath}\`\n\n`;
          }
          const firstDisplayName = availableTmux[0].tmuxSession.replace(/^olympus-/, '');
          msg += `💡 \`/use ${firstDisplayName}\`로 연결\n`;
        }

        msg += `\n💡 \`/use 이름\`으로 세션 전환`;

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

    // /new [name] - Create new named session
    // /use <name> - Switch to or connect to session
    this.bot.command('use', async (ctx) => {
      const nameInput = ctx.message.text.replace(/^\/use\s*/, '').trim();

      if (!nameInput) {
        await ctx.reply('사용법: `/use 세션이름`\n\n`/sessions`로 세션 목록을 확인하세요.', { parse_mode: 'Markdown' });
        return;
      }

      const sessions = this.chatSessions.get(ctx.chat.id);
      const displayName = nameInput.replace(/^olympus-/, '');

      // Check if already connected
      const connectedName = this.resolveSessionName(ctx.chat.id, nameInput);
      if (connectedName) {
        // Already connected - just switch
        this.activeSession.set(ctx.chat.id, connectedName);

        // Get session info for banner
        try {
          const sessionsRes = await fetch(`${this.config.gatewayUrl}/api/sessions`, {
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
          });
          const sessionsData = await sessionsRes.json() as { sessions: Array<{ id: string; name: string; projectPath: string }> };
          const sessionInfo = sessionsData.sessions.find(s => s.name === connectedName);
          const projectPath = sessionInfo?.projectPath ?? '';

          const banner = this.getOlympusBanner(displayName, projectPath);
          await ctx.reply(banner, { parse_mode: 'Markdown' });
        } catch {
          await ctx.reply(`✅ 활성 세션: *${displayName}*`, { parse_mode: 'Markdown' });
        }
        return;
      }

      // Not connected - try to connect to tmux session
      const tmuxSession = nameInput.startsWith('olympus-') ? nameInput : `olympus-${nameInput}`;
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

        const banner = this.getOlympusBanner(displayName, data.session.projectPath);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          banner,
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

    // /orchestration <prompt> - Multi-AI orchestration mode (forwards to Claude CLI)
    this.bot.command('orchestration', async (ctx) => {
      const text = ctx.message.text;
      const prompt = text.replace(/^\/orchestration\s*/, '').trim();

      if (!prompt) {
        await ctx.reply(
          '❌ 요청 내용을 입력해주세요.\n\n' +
          '예: `/orchestration 로그인 페이지 UI 개선`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Sync sessions from Gateway if local state is empty
      if (!this.chatSessions.has(ctx.chat.id) || this.chatSessions.get(ctx.chat.id)?.size === 0) {
        await this.syncSessionsFromGateway(ctx.chat.id);
      }

      const targetName = this.getActiveSessionName(ctx.chat.id);

      if (!targetName) {
        await ctx.reply(
          '❌ 연결된 세션이 없습니다.\n\n' +
          '`/sessions`로 연결 가능한 세션을 확인하고 `/use`로 연결하세요.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const displayName = targetName.replace(/^olympus-/, '');
      const statusMsg = await ctx.reply(`🚀 '${displayName}' 세션에서 *Multi-AI Orchestration* 시작 중...`, { parse_mode: 'Markdown' });

      try {
        const sessionId = await this.getSessionId(ctx.chat.id, targetName);
        // Send the full command including /orchestration to Claude CLI
        await this.sendToClaude(sessionId, `/orchestration "${prompt}"`);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `✅ '${displayName}' 세션에서 *Orchestration* 실행됨\n\n` +
          `📤 \`${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\`\n\n` +
          `진행 상황이 알림으로 전달됩니다.`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ 전송 실패: ${(err as Error).message}`
        );
      }
    });

    // Handle text messages - send to Claude CLI
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // If it starts with /, it's an unknown command
      if (text.startsWith('/')) {
        await ctx.reply('알 수 없는 명령어입니다. /start 로 도움말을 확인하세요.');
        return;
      }

      // Sync sessions from Gateway if local state is empty
      if (!this.chatSessions.has(ctx.chat.id) || this.chatSessions.get(ctx.chat.id)?.size === 0) {
        await this.syncSessionsFromGateway(ctx.chat.id);
      }

      // Check for @sessionName prefix: @name message
      const atMatch = text.match(/^@(\S+)\s+(.+)$/s);
      let targetName: string | null;
      let message: string;

      if (atMatch) {
        // Resolve session name (with or without olympus- prefix)
        targetName = this.resolveSessionName(ctx.chat.id, atMatch[1]);
        message = atMatch[2];
        if (!targetName) {
          await ctx.reply(`❌ 세션 '${atMatch[1]}'을 찾을 수 없습니다.\n\n\`/sessions\`로 연결된 세션 목록을 확인하세요.`, { parse_mode: 'Markdown' });
          return;
        }
      } else {
        // Use active session or first connected session
        targetName = this.getActiveSessionName(ctx.chat.id);
        message = text;
      }

      if (!targetName) {
        await ctx.reply('❌ 연결된 세션이 없습니다.\n\n`/sessions`로 연결 가능한 세션을 확인하고 `/use`로 연결하세요.', { parse_mode: 'Markdown' });
        return;
      }

      const displayName = targetName.replace(/^olympus-/, '');
      const statusMsg = await ctx.reply(`⏳ '${displayName}' 세션으로 전송 중...`);

      try {
        const sessionId = await this.getSessionId(ctx.chat.id, targetName);
        await this.sendToClaude(sessionId, message);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `✅ '${displayName}' 세션으로 전송됨\n\n📤 \`${message.slice(0, 100)}${message.length > 100 ? '...' : ''}\`\n\n응답이 오면 알려드립니다.`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `❌ 전송 실패: ${(err as Error).message}`
        );
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
   * Get active session name, or first connected session if none active
   */
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
   * Get session ID by name (throws if not connected)
   */
  private async getSessionId(chatId: number, name: string): Promise<string> {
    const sessions = this.chatSessions.get(chatId);
    const sessionId = sessions?.get(name);

    if (!sessionId) {
      throw new Error(`세션 '${name}'에 연결되어 있지 않습니다.\n\n/sessions로 연결 가능한 세션을 확인하고\n/use ${name}으로 연결하세요.`);
    }

    // Verify session is still active
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json() as { session: { status: string } };
        if (data.session.status === 'active') {
          return sessionId;
        }
      }
    } catch {
      // Session not found or error
    }

    // Clear invalid session
    sessions?.delete(name);
    if (this.activeSession.get(chatId) === name) {
      this.activeSession.delete(chatId);
    }
    throw new Error(`세션 '${name}'이 종료되었습니다.\n\n/sessions로 연결 가능한 세션을 확인하세요.`);
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

  private async sendToClaude(sessionId: string, message: string): Promise<void> {
    const res = await fetch(`${this.config.gatewayUrl}/api/sessions/${sessionId}/input`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const error = await res.json() as { message: string };
      throw new Error(error.message);
    }
  }

  private subscribeToSession(sessionId: string, chatId: number) {
    this.subscribedRuns.set(sessionId, chatId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(createMessage('subscribe', { sessionId })));
    }
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

  private handleWebSocketMessage(msg: { type: string; payload: unknown }) {
    const payload = msg.payload as { sessionId?: string; runId?: string };
    const sessionId = payload.sessionId ?? payload.runId;

    if (!sessionId) return;

    const chatId = this.subscribedRuns.get(sessionId);
    if (!chatId) return;

    switch (msg.type) {
      case 'session:output': {
        // New output from Claude CLI
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
          const prefix = sessionName ? `📩 [${sessionName}] Claude:` : '📩 Claude:';
          // Truncate if too long for Telegram
          const truncated = content.length > 3500
            ? content.slice(0, 3500) + '\n\n...(truncated)'
            : content;
          this.bot.telegram.sendMessage(chatId, `${prefix}\n\n${truncated}`).catch(console.error);
        }
        break;
      }

      case 'session:error': {
        const error = (payload as { error?: string }).error;
        if (error) {
          this.bot.telegram.sendMessage(chatId, `❌ 오류: ${error}`).catch(console.error);
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

        this.bot.telegram.sendMessage(
          chatId,
          `🛑 세션 '${closedName || sessionId.slice(0, 8)}' 종료됨\n\n새 메시지를 보내면 자동으로 새 세션이 생성됩니다.`
        ).catch(console.error);
        break;
      }

      // Legacy support for existing run events (for orchestration)
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
        const content = a.content ?? '';
        const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
        this.bot.telegram.sendMessage(
          chatId,
          `✅ *${a.agentId}* 완료\n\n${truncated}`,
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
          `🎉 *작업 완료!*`,
          { parse_mode: 'Markdown' }
        ).catch(console.error);
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

  async start() {
    // Connect to Gateway WebSocket
    this.connectWebSocket();

    // Start Telegram bot
    console.log('Starting Olympus Telegram Bot...');
    console.log(`Gateway: ${this.config.gatewayUrl}`);
    console.log(`Allowed users: ${this.config.allowedUsers.length > 0 ? this.config.allowedUsers.join(', ') : 'All'}`);

    try {
      await this.bot.launch();
      console.log('Bot started! Send /start to begin.');

      // Sync sessions from Gateway for all allowed users
      for (const chatId of this.config.allowedUsers) {
        await this.syncSessionsFromGateway(chatId);
      }
    } catch (err) {
      console.error('Bot launch failed:', err);
    }

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

  /**
   * Sync sessions from Gateway for a specific chat
   * This ensures local state matches Gateway state
   */
  private async syncSessionsFromGateway(chatId: number): Promise<void> {
    try {
      const res = await fetch(`${this.config.gatewayUrl}/api/sessions`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });

      if (!res.ok) return;

      const data = await res.json() as { sessions: Array<{ id: string; name: string; chatId: number; status: string }> };
      const userSessions = data.sessions.filter(s => s.chatId === chatId && s.status === 'active');

      if (userSessions.length === 0) return;

      // Update local state
      let sessionsMap = this.chatSessions.get(chatId);
      if (!sessionsMap) {
        sessionsMap = new Map();
        this.chatSessions.set(chatId, sessionsMap);
      }

      for (const session of userSessions) {
        if (!sessionsMap.has(session.name)) {
          sessionsMap.set(session.name, session.id);

          // Subscribe to session events
          this.subscribedRuns.set(session.id, chatId);
          if (this.ws?.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'subscribe', payload: { sessionId: session.id } }));
          }
        }
      }

      // Set active session if not set
      if (!this.activeSession.get(chatId) && sessionsMap.size > 0) {
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

// Main
const config = loadConfig();
const bot = new OlympusBot(config);
await bot.start();
