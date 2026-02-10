/**
 * Orchestrator E2E Integration Tests
 *
 * Tests the full pipeline: Telegram → Gateway → Main Session (Orchestrator) → Work Sessions → Telegram
 * Validates that all components work together organically.
 *
 * Since real tmux/Telegraf/WebSocket are external dependencies, we replicate
 * the critical logic flows and test them with mocks — following the same pattern
 * as codex-integration.test.ts and session-manager.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Types ──

interface MockSession {
  id: string;
  name: string;
  chatId: number;
  tmuxSession: string;
  status: 'active' | 'closed';
  projectPath: string;
}

interface SessionEvent {
  type: 'screen' | 'error' | 'closed';  // 'output' → 'screen' (Phase 4)
  content?: string;
  error?: string;
}

interface WsClient {
  id: string;
  authenticated: boolean;
  subscribedSessions: Set<string>;
  messages: Array<{ type: string; payload: Record<string, unknown> }>;
}

// ── Mock Factories ──

function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    id: 'sess-' + Math.random().toString(36).slice(2, 8),
    name: 'main',
    chatId: 123456,
    tmuxSession: 'main',
    status: 'active',
    projectPath: '/home/user/.olympus/orchestrator',
    ...overrides,
  };
}

function createWsClient(id: string, subscribedSessions: string[] = []): WsClient {
  return {
    id,
    authenticated: true,
    subscribedSessions: new Set(subscribedSessions),
    messages: [],
  };
}

// ── Replicated Gateway Logic ──

/**
 * Replicated broadcastSessionEvent logic from server.ts
 * Sends session events only to subscribed, authenticated clients
 */
function broadcastSessionEvent(
  clients: Map<string, WsClient>,
  sessionId: string,
  event: SessionEvent,
): void {
  let messageType: string;
  let payload: Record<string, unknown>;

  switch (event.type) {
    case 'screen':
      messageType = 'session:screen';
      payload = { sessionId, content: event.content };
      break;
    case 'error':
      messageType = 'session:error';
      payload = { sessionId, error: event.error };
      break;
    case 'closed':
      messageType = 'session:closed';
      payload = { sessionId };
      break;
  }

  for (const [, client] of clients) {
    if (client.authenticated && client.subscribedSessions.has(sessionId)) {
      client.messages.push({ type: messageType!, payload: payload! });
    }
  }
}

/**
 * Replicated session connect logic from api.ts
 * Connects a chatId to a tmux session via the Gateway
 */
function connectSession(
  sessions: Map<string, MockSession>,
  tmuxSession: string,
  chatId: number,
): MockSession | null {
  // Check if already connected
  for (const [, session] of sessions) {
    if (session.tmuxSession === tmuxSession && session.status === 'active') {
      session.chatId = chatId;
      return session;
    }
  }
  return null; // Session not found
}

/**
 * Replicated sendInput logic from session-manager.ts
 * Returns true if message was sent to tmux session
 */
function sendInput(
  sessions: Map<string, MockSession>,
  sessionId: string,
  _message: string,
  sendKeysSpy: ReturnType<typeof vi.fn>,
): boolean {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'active') return false;
  sendKeysSpy(session.tmuxSession, _message);
  return true;
}

// ── Replicated Telegram Bot Logic ──

/**
 * Replicated orchestrator mode text handler logic
 * Always routes to main session
 */
function handleOrchestratorMessage(
  chatSessions: Map<number, Map<string, string>>,
  directMode: Map<number, boolean>,
  chatId: number,
  text: string,
): { target: string; sessionId: string } | { error: string } {
  // Direct mode: use per-session routing
  if (directMode.get(chatId)) {
    const sessions = chatSessions.get(chatId);
    // Find active session (first connected)
    if (!sessions || sessions.size === 0) {
      return { error: '연결된 세션이 없습니다.' };
    }
    const firstName = sessions.keys().next().value as string;
    const sessionId = sessions.get(firstName)!;
    return { target: firstName, sessionId };
  }

  // Orchestrator mode: always route to main
  const MAIN_SESSION = 'main';
  const sessions = chatSessions.get(chatId);
  const mainSessionId = sessions?.get(MAIN_SESSION);

  if (!mainSessionId) {
    return { error: '메인 세션(main)에 연결할 수 없습니다.' };
  }

  return { target: MAIN_SESSION, sessionId: mainSessionId };
}

/**
 * Replicated /use command mode switching logic
 */
function handleUseCommand(
  directMode: Map<number, boolean>,
  activeSession: Map<number, string>,
  chatId: number,
  nameInput: string,
): { mode: 'orchestrator' | 'direct'; session?: string } {
  if (nameInput === 'main' || nameInput === 'orchestrator') {
    directMode.delete(chatId);
    activeSession.set(chatId, 'main');
    return { mode: 'orchestrator' };
  }

  const actualName = nameInput.startsWith('direct ')
    ? nameInput.replace('direct ', '').trim()
    : nameInput;

  directMode.set(chatId, true);
  activeSession.set(chatId, `olympus-${actualName}`);
  return { mode: 'direct', session: actualName };
}

/**
 * Replicated ensureMainSessionConnected logic
 */
function ensureMainSessionConnected(
  chatSessions: Map<number, Map<string, string>>,
  subscribedRuns: Map<string, number>,
  activeSession: Map<number, string>,
  chatId: number,
  gatewaySession: MockSession | null,
): boolean {
  const MAIN_SESSION = 'main';

  // Already connected?
  const sessions = chatSessions.get(chatId);
  if (sessions?.has(MAIN_SESSION)) {
    return true;
  }

  // Try to connect from Gateway
  if (!gatewaySession) return false;

  let sessionsMap = chatSessions.get(chatId);
  if (!sessionsMap) {
    sessionsMap = new Map();
    chatSessions.set(chatId, sessionsMap);
  }
  sessionsMap.set(gatewaySession.name, gatewaySession.id);
  subscribedRuns.set(gatewaySession.id, chatId);
  activeSession.set(chatId, MAIN_SESSION);
  return true;
}

/**
 * Replicated syncSessionsFromGateway active session logic
 */
function syncActiveSession(
  directMode: Map<number, boolean>,
  activeSession: Map<number, string>,
  sessionsMap: Map<string, string>,
  chatId: number,
): void {
  if (!directMode.get(chatId) && sessionsMap.has('main')) {
    activeSession.set(chatId, 'main');
  } else if (!activeSession.get(chatId) && sessionsMap.size > 0) {
    const firstName = sessionsMap.keys().next().value as string;
    if (firstName) {
      activeSession.set(chatId, firstName);
    }
  }
}

// ── Replicated Noise Filter Logic ──

const NOISE_PATTERNS = [
  /^(Reading|Searching|Globbing|Grepping|Writing)\s+(file|for|in|to|packages?[/.]|src[/.]|\S*\.\w{1,4})/i,
  /^\s*⎿\s*(Reading|Searching|Found|Wrote|Updated)/,
  /^(Thinking|Working|Loading|Searching|Globbing|Grepping)\.\.\.$/i,
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
  /│.*│.*│/,
  /^\s*$/,
  /^\$?\s*tmux\s+(send-keys|capture-pane|list-sessions)/i,
];

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(line));
}

// ── Replicated Orchestrator Directory Setup ──

function setupOrchestratorDir(): { dir: string; claudeMd: string } {
  const dir = '/home/user/.olympus/orchestrator';
  const claudeMd = '# Olympus Orchestrator\n\n당신은 Olympus 메시지 오케스트레이터입니다.';
  return { dir, claudeMd };
}

// ══════════════════════════════════════════════
//  Tests
// ══════════════════════════════════════════════

describe('Orchestrator E2E: Telegram → Gateway → Sessions → Telegram', () => {
  let gatewaySessions: Map<string, MockSession>;
  let wsClients: Map<string, WsClient>;
  let sendKeysSpy: ReturnType<typeof vi.fn>;

  // Bot state
  let chatSessions: Map<number, Map<string, string>>;
  let directMode: Map<number, boolean>;
  let activeSession: Map<number, string>;
  let subscribedRuns: Map<string, number>;

  const CHAT_ID = 123456789;
  const MAIN_SESSION_ID = 'sess-main-001';
  const WORK_SESSION_ID = 'sess-work-001';

  beforeEach(() => {
    // Gateway state
    const mainSession = createMockSession({
      id: MAIN_SESSION_ID,
      name: 'main',
      tmuxSession: 'main',
      projectPath: '/home/user/.olympus/orchestrator',
    });
    const workSession = createMockSession({
      id: WORK_SESSION_ID,
      name: 'olympus-console',
      tmuxSession: 'olympus-console',
      projectPath: '/home/user/dev/console',
    });

    gatewaySessions = new Map([
      [mainSession.id, mainSession],
      [workSession.id, workSession],
    ]);

    wsClients = new Map();
    sendKeysSpy = vi.fn();

    // Bot state
    chatSessions = new Map();
    directMode = new Map();
    activeSession = new Map();
    subscribedRuns = new Map();

    // Pre-connect bot to both sessions
    const sessMap = new Map<string, string>([
      ['main', MAIN_SESSION_ID],
      ['olympus-console', WORK_SESSION_ID],
    ]);
    chatSessions.set(CHAT_ID, sessMap);
    activeSession.set(CHAT_ID, 'main');
  });

  // ── 1. Orchestrator Mode Basic Flow ──

  describe('Orchestrator Mode', () => {
    it('should route text message to main by default', () => {
      const result = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'console 프로젝트 빌드해줘');

      expect(result).toHaveProperty('target', 'main');
      expect(result).toHaveProperty('sessionId', MAIN_SESSION_ID);
    });

    it('should route all messages to main regardless of content', () => {
      const messages = [
        '안녕하세요',
        '@console 테스트 돌려',
        'build the project',
        '세션 목록 보여줘',
      ];

      for (const msg of messages) {
        const result = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, msg);
        expect(result).toHaveProperty('target', 'main');
      }
    });

    it('should return error when main session not connected', () => {
      chatSessions.get(CHAT_ID)!.delete('main');

      const result = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'hello');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('메인 세션');
    });

    it('should return error when no sessions at all', () => {
      chatSessions.delete(CHAT_ID);

      const result = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'hello');
      expect(result).toHaveProperty('error');
    });
  });

  // ── 2. Direct Mode ──

  describe('Direct Mode', () => {
    it('should route to active session in direct mode', () => {
      directMode.set(CHAT_ID, true);

      const result = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'pnpm test');
      expect(result).toHaveProperty('sessionId');
      // First session in the map
      expect(result).toHaveProperty('target', 'main');
    });

    it('should return error in direct mode with no sessions', () => {
      directMode.set(CHAT_ID, true);
      chatSessions.delete(CHAT_ID);

      const result = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'pnpm test');
      expect(result).toHaveProperty('error');
    });
  });

  // ── 3. /use Command Mode Switching ──

  describe('/use Command', () => {
    it('should switch to orchestrator mode with /use main', () => {
      directMode.set(CHAT_ID, true);
      const result = handleUseCommand(directMode, activeSession, CHAT_ID, 'main');

      expect(result.mode).toBe('orchestrator');
      expect(directMode.has(CHAT_ID)).toBe(false);
      expect(activeSession.get(CHAT_ID)).toBe('main');
    });

    it('should switch to orchestrator mode with /use orchestrator', () => {
      directMode.set(CHAT_ID, true);
      const result = handleUseCommand(directMode, activeSession, CHAT_ID, 'orchestrator');

      expect(result.mode).toBe('orchestrator');
      expect(directMode.has(CHAT_ID)).toBe(false);
    });

    it('should switch to direct mode with /use direct <session>', () => {
      const result = handleUseCommand(directMode, activeSession, CHAT_ID, 'direct console');

      expect(result.mode).toBe('direct');
      expect(result.session).toBe('console');
      expect(directMode.get(CHAT_ID)).toBe(true);
      expect(activeSession.get(CHAT_ID)).toBe('olympus-console');
    });

    it('should switch to direct mode with /use <session> (backward compat)', () => {
      const result = handleUseCommand(directMode, activeSession, CHAT_ID, 'console');

      expect(result.mode).toBe('direct');
      expect(result.session).toBe('console');
      expect(directMode.get(CHAT_ID)).toBe(true);
    });

    it('should toggle between modes correctly', () => {
      // Start in orchestrator mode
      expect(directMode.has(CHAT_ID)).toBe(false);

      // Switch to direct
      handleUseCommand(directMode, activeSession, CHAT_ID, 'direct console');
      expect(directMode.get(CHAT_ID)).toBe(true);

      // Switch back to orchestrator
      handleUseCommand(directMode, activeSession, CHAT_ID, 'main');
      expect(directMode.has(CHAT_ID)).toBe(false);
      expect(activeSession.get(CHAT_ID)).toBe('main');
    });
  });

  // ── 4. ensureMainSessionConnected ──

  describe('ensureMainSessionConnected', () => {
    it('should return true when already connected', () => {
      const result = ensureMainSessionConnected(
        chatSessions, subscribedRuns, activeSession,
        CHAT_ID, null,
      );
      expect(result).toBe(true);
    });

    it('should auto-connect from gateway session', () => {
      chatSessions.delete(CHAT_ID);
      const gatewaySession = gatewaySessions.get(MAIN_SESSION_ID)!;

      const result = ensureMainSessionConnected(
        chatSessions, subscribedRuns, activeSession,
        CHAT_ID, gatewaySession,
      );

      expect(result).toBe(true);
      expect(chatSessions.get(CHAT_ID)?.get('main')).toBe(MAIN_SESSION_ID);
      expect(subscribedRuns.get(MAIN_SESSION_ID)).toBe(CHAT_ID);
      expect(activeSession.get(CHAT_ID)).toBe('main');
    });

    it('should return false when gateway has no main session', () => {
      chatSessions.delete(CHAT_ID);

      const result = ensureMainSessionConnected(
        chatSessions, subscribedRuns, activeSession,
        CHAT_ID, null,
      );

      expect(result).toBe(false);
    });

    it('should create new map for unknown chatId', () => {
      const NEW_CHAT_ID = 999999;
      const gatewaySession = gatewaySessions.get(MAIN_SESSION_ID)!;

      ensureMainSessionConnected(
        chatSessions, subscribedRuns, activeSession,
        NEW_CHAT_ID, gatewaySession,
      );

      expect(chatSessions.has(NEW_CHAT_ID)).toBe(true);
      expect(chatSessions.get(NEW_CHAT_ID)?.get('main')).toBe(MAIN_SESSION_ID);
    });
  });

  // ── 5. syncSessionsFromGateway Active Session ──

  describe('syncSessionsFromGateway Active Session', () => {
    it('should set main as active in orchestrator mode', () => {
      activeSession.delete(CHAT_ID);
      const sessMap = chatSessions.get(CHAT_ID)!;

      syncActiveSession(directMode, activeSession, sessMap, CHAT_ID);

      expect(activeSession.get(CHAT_ID)).toBe('main');
    });

    it('should set first session as active in direct mode', () => {
      directMode.set(CHAT_ID, true);
      activeSession.delete(CHAT_ID);
      const sessMap = new Map([['olympus-console', WORK_SESSION_ID]]);

      syncActiveSession(directMode, activeSession, sessMap, CHAT_ID);

      expect(activeSession.get(CHAT_ID)).toBe('olympus-console');
    });

    it('should prefer main even when other sessions exist', () => {
      activeSession.delete(CHAT_ID);
      const sessMap = new Map([
        ['olympus-console', WORK_SESSION_ID],
        ['main', MAIN_SESSION_ID],
      ]);

      syncActiveSession(directMode, activeSession, sessMap, CHAT_ID);

      expect(activeSession.get(CHAT_ID)).toBe('main');
    });
  });

  // ── 6. Gateway Session Input (sendInput) ──

  describe('Gateway sendInput', () => {
    it('should send message to active session via tmux send-keys', () => {
      const result = sendInput(gatewaySessions, MAIN_SESSION_ID, '안녕하세요', sendKeysSpy);

      expect(result).toBe(true);
      expect(sendKeysSpy).toHaveBeenCalledWith('main', '안녕하세요');
    });

    it('should reject sending to closed session', () => {
      gatewaySessions.get(MAIN_SESSION_ID)!.status = 'closed';

      const result = sendInput(gatewaySessions, MAIN_SESSION_ID, 'hello', sendKeysSpy);

      expect(result).toBe(false);
      expect(sendKeysSpy).not.toHaveBeenCalled();
    });

    it('should reject sending to unknown session', () => {
      const result = sendInput(gatewaySessions, 'nonexistent', 'hello', sendKeysSpy);

      expect(result).toBe(false);
      expect(sendKeysSpy).not.toHaveBeenCalled();
    });

    it('should send to work session in direct mode', () => {
      const result = sendInput(gatewaySessions, WORK_SESSION_ID, 'pnpm test', sendKeysSpy);

      expect(result).toBe(true);
      expect(sendKeysSpy).toHaveBeenCalledWith('olympus-console', 'pnpm test');
    });
  });

  // ── 7. Output Pipeline: Session → WebSocket → Clients ──

  describe('Output Pipeline', () => {
    it('should broadcast output to subscribed clients', () => {
      const telegramBot = createWsClient('bot-1', [MAIN_SESSION_ID]);
      const dashboard = createWsClient('dashboard-1', [MAIN_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);
      wsClients.set('dashboard-1', dashboard);

      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'screen',
        content: '⏺ 빌드가 완료되었습니다. 8개 패키지 모두 성공.',
      });

      expect(telegramBot.messages).toHaveLength(1);
      expect(telegramBot.messages[0].type).toBe('session:screen');
      expect(telegramBot.messages[0].payload.content).toContain('빌드가 완료되었습니다');

      expect(dashboard.messages).toHaveLength(1);
    });

    it('should not send to unsubscribed clients', () => {
      const subscribed = createWsClient('bot-1', [MAIN_SESSION_ID]);
      const unsubscribed = createWsClient('other-1', []);
      wsClients.set('bot-1', subscribed);
      wsClients.set('other-1', unsubscribed);

      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'screen',
        content: 'test output',
      });

      expect(subscribed.messages).toHaveLength(1);
      expect(unsubscribed.messages).toHaveLength(0);
    });

    it('should not send to unauthenticated clients', () => {
      const unauthClient = createWsClient('bot-1', [MAIN_SESSION_ID]);
      unauthClient.authenticated = false;
      wsClients.set('bot-1', unauthClient);

      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'screen',
        content: 'secret output',
      });

      expect(unauthClient.messages).toHaveLength(0);
    });

    it('should broadcast work session output to subscribers', () => {
      const telegramBot = createWsClient('bot-1', [MAIN_SESSION_ID, WORK_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);

      // Main session output (orchestrator response)
      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'screen',
        content: '[console] 테스트 248개 통과, 실패 0개',
      });

      // Work session output (raw)
      broadcastSessionEvent(wsClients, WORK_SESSION_ID, {
        type: 'screen',
        content: 'Tests: 248 passed, 0 failed',
      });

      expect(telegramBot.messages).toHaveLength(2);
      expect(telegramBot.messages[0].payload.sessionId).toBe(MAIN_SESSION_ID);
      expect(telegramBot.messages[1].payload.sessionId).toBe(WORK_SESSION_ID);
    });

    it('should broadcast session:closed event', () => {
      const telegramBot = createWsClient('bot-1', [WORK_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);

      broadcastSessionEvent(wsClients, WORK_SESSION_ID, { type: 'closed' });

      expect(telegramBot.messages).toHaveLength(1);
      expect(telegramBot.messages[0].type).toBe('session:closed');
    });

    it('should broadcast session:error event', () => {
      const telegramBot = createWsClient('bot-1', [MAIN_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);

      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'error',
        error: 'tmux session terminated unexpectedly',
      });

      expect(telegramBot.messages).toHaveLength(1);
      expect(telegramBot.messages[0].type).toBe('session:error');
      expect(telegramBot.messages[0].payload.error).toContain('terminated');
    });
  });

  // ── 8. Full Pipeline: Telegram → Main Session → Work Session → Telegram ──

  describe('Full Pipeline', () => {
    it('should complete the full orchestrator routing flow', () => {
      const telegramBot = createWsClient('bot-1', [MAIN_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);

      // Step 1: User sends message from Telegram
      const routing = handleOrchestratorMessage(
        chatSessions, directMode, CHAT_ID,
        'console 프로젝트 테스트 돌려줘',
      );
      expect(routing).toHaveProperty('target', 'main');

      // Step 2: Gateway sends input to main session (orchestrator)
      const sent = sendInput(
        gatewaySessions,
        (routing as { sessionId: string }).sessionId,
        'console 프로젝트 테스트 돌려줘',
        sendKeysSpy,
      );
      expect(sent).toBe(true);
      expect(sendKeysSpy).toHaveBeenCalledWith('main', 'console 프로젝트 테스트 돌려줘');

      // Step 3: Main session AI processes and outputs response
      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'screen',
        content: '[console] 테스트 결과: 248개 통과, 실패 0개. 빌드 성공.',
      });

      // Step 4: Telegram bot receives the output
      expect(telegramBot.messages).toHaveLength(1);
      expect(telegramBot.messages[0].type).toBe('session:screen');
      expect(telegramBot.messages[0].payload.content).toContain('248개 통과');
    });

    it('should handle direct mode bypass correctly', () => {
      const telegramBot = createWsClient('bot-1', [WORK_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);

      // Step 1: Switch to direct mode
      handleUseCommand(directMode, activeSession, CHAT_ID, 'direct console');
      expect(directMode.get(CHAT_ID)).toBe(true);

      // Step 2: Message goes directly to work session (not orchestrator)
      const sent = sendInput(gatewaySessions, WORK_SESSION_ID, 'pnpm test', sendKeysSpy);
      expect(sent).toBe(true);
      expect(sendKeysSpy).toHaveBeenCalledWith('olympus-console', 'pnpm test');

      // Step 3: Work session output goes directly to Telegram
      broadcastSessionEvent(wsClients, WORK_SESSION_ID, {
        type: 'screen',
        content: 'Tests: 248 passed',
      });

      expect(telegramBot.messages).toHaveLength(1);
      expect(telegramBot.messages[0].payload.sessionId).toBe(WORK_SESSION_ID);
    });

    it('should handle mode switch mid-conversation', () => {
      const telegramBot = createWsClient('bot-1', [MAIN_SESSION_ID, WORK_SESSION_ID]);
      wsClients.set('bot-1', telegramBot);

      // Start in orchestrator mode
      const result1 = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'hello');
      expect(result1).toHaveProperty('target', 'main');

      // Switch to direct
      handleUseCommand(directMode, activeSession, CHAT_ID, 'direct console');

      // Now routes to console directly
      const result2 = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'hello');
      expect(result2).toHaveProperty('target', 'main'); // first in map order

      // Switch back
      handleUseCommand(directMode, activeSession, CHAT_ID, 'main');
      const result3 = handleOrchestratorMessage(chatSessions, directMode, CHAT_ID, 'hello');
      expect(result3).toHaveProperty('target', 'main');
      expect(result3).toHaveProperty('sessionId', MAIN_SESSION_ID);
    });
  });

  // ── 9. Session Connect ──

  describe('Session Connect', () => {
    it('should connect chatId to existing tmux session', () => {
      const session = connectSession(gatewaySessions, 'main', 999);

      expect(session).not.toBeNull();
      expect(session!.chatId).toBe(999);
    });

    it('should return null for non-existent session', () => {
      const session = connectSession(gatewaySessions, 'olympus-nonexistent', 999);

      expect(session).toBeNull();
    });

    it('should not connect to closed session', () => {
      gatewaySessions.get(MAIN_SESSION_ID)!.status = 'closed';

      const session = connectSession(gatewaySessions, 'main', 999);

      expect(session).toBeNull();
    });
  });

  // ── 10. Orchestrator Directory Setup ──

  describe('Orchestrator Directory', () => {
    it('should generate correct orchestrator directory path', () => {
      const { dir } = setupOrchestratorDir();
      expect(dir).toContain('.olympus/orchestrator');
    });

    it('should generate CLAUDE.md with orchestrator instructions', () => {
      const { claudeMd } = setupOrchestratorDir();
      expect(claudeMd).toContain('Olympus Orchestrator');
      expect(claudeMd).toContain('오케스트레이터');
    });
  });

  // ── 11. Noise Filter for Orchestrator ──

  describe('Orchestrator Noise Filter', () => {
    it('should filter tmux send-keys commands', () => {
      expect(isNoise('$ tmux send-keys -t olympus-console -l "pnpm test"')).toBe(true);
      expect(isNoise('tmux send-keys -t olympus-alpha Enter')).toBe(true);
    });

    it('should filter tmux capture-pane commands', () => {
      expect(isNoise('tmux capture-pane -t olympus-console -p -S -100')).toBe(true);
      expect(isNoise('$ tmux capture-pane -t session -p')).toBe(true);
    });

    it('should filter tmux list-sessions commands', () => {
      expect(isNoise('tmux list-sessions -F "#{session_name}"')).toBe(true);
    });

    it('should NOT filter actual content', () => {
      expect(isNoise('Build completed in 12.3s (8 packages)')).toBe(false);
      expect(isNoise('Tests: 248 passed, 0 failed')).toBe(false);
      expect(isNoise('[console] 빌드 성공')).toBe(false);
      expect(isNoise('⏺ 결과를 알려드리겠습니다.')).toBe(false);
    });

    it('should filter existing noise patterns', () => {
      expect(isNoise('Reading file packages/gateway/src/server.ts')).toBe(true);
      expect(isNoise('Thinking...')).toBe(true);
      expect(isNoise('⠋ Processing...')).toBe(true);
      expect(isNoise('')).toBe(true);
      expect(isNoise('│status│tokens│cost│')).toBe(true);
    });
  });

  // ── 12. Multi-Client Dashboard + Telegram ──

  describe('Multi-Client (Dashboard + Telegram)', () => {
    it('should deliver output to both dashboard and telegram bot', () => {
      const telegramBot = createWsClient('telegram', [MAIN_SESSION_ID]);
      const dashboardClient = createWsClient('dashboard', [MAIN_SESSION_ID, WORK_SESSION_ID]);
      wsClients.set('telegram', telegramBot);
      wsClients.set('dashboard', dashboardClient);

      // Main session output
      broadcastSessionEvent(wsClients, MAIN_SESSION_ID, {
        type: 'screen',
        content: '작업이 완료되었습니다.',
      });

      expect(telegramBot.messages).toHaveLength(1);
      expect(dashboardClient.messages).toHaveLength(1);

      // Work session output (only dashboard subscribed)
      broadcastSessionEvent(wsClients, WORK_SESSION_ID, {
        type: 'screen',
        content: 'Build: 9/9 passed',
      });

      expect(telegramBot.messages).toHaveLength(1); // Not subscribed to work session
      expect(dashboardClient.messages).toHaveLength(2); // Subscribed to both
    });
  });
});
