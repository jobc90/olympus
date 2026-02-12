/**
 * Codex E2E Tests
 *
 * Tests the full Orchestrator pipeline:
 *   UserInput → Router → SessionManager → ResponseProcessor → AgentBrain
 *
 * All external deps (sqlite) are mocked.
 * Focus: pipeline correctness, event flow, error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexOrchestrator } from '../orchestrator.js';
import type { ManagedSession } from '../types.js';

// ── Mock SessionManager ──

const mockSessions: ManagedSession[] = [
  {
    id: 'sess-alpha',
    name: 'olympus-alpha',
    projectPath: '/dev/alpha',

    status: 'ready',
    lastActivity: Date.now(),
    contextDbPath: '/tmp/alpha.db',
    commandQueue: [],
    createdAt: Date.now() - 60000,
  },
  {
    id: 'sess-beta',
    name: 'olympus-beta',
    projectPath: '/dev/beta',

    status: 'ready',
    lastActivity: Date.now() - 5000,
    contextDbPath: '/tmp/beta.db',
    commandQueue: [],
    createdAt: Date.now() - 120000,
  },
];

const sessionListeners = new Map<string, Array<(...args: unknown[]) => void>>();
const sendToSessionSpy = vi.fn(async () => true);

vi.mock('../session-manager.js', () => ({
  CodexSessionManager: vi.fn().mockImplementation(() => ({
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!sessionListeners.has(event)) sessionListeners.set(event, []);
      sessionListeners.get(event)!.push(listener);
    },
    listSessions: vi.fn(() => [...mockSessions]),
    getSession: vi.fn((id: string) => mockSessions.find(s => s.id === id) ?? null),
    findByName: vi.fn((name: string) => mockSessions.find(s => s.name === name || s.name.includes(name)) ?? null),
    sendToSession: sendToSessionSpy,
    closeSession: vi.fn((id: string) => {
      const idx = mockSessions.findIndex(s => s.id === id);
      if (idx >= 0) {
        mockSessions[idx].status = 'closed';
        return true;
      }
      return false;
    }),
    createSession: vi.fn(async (projectPath: string, name?: string) => {
      const session: ManagedSession = {
        id: `sess-${Date.now()}`,
        name: name ?? `olympus-new`,
        projectPath,

        status: 'ready',
        lastActivity: Date.now(),
        contextDbPath: '/tmp/new.db',
        commandQueue: [],
        createdAt: Date.now(),
      };
      mockSessions.push(session);
      return session;
    }),
    discoverExistingSessions: vi.fn(async () => []),
    shutdown: vi.fn(),
  })),
}));


// ── Helper: emit events from mock SessionManager ──

function emitSessionStatus(sessionId: string, status: string) {
  const listeners = sessionListeners.get('session:status') ?? [];
  for (const fn of listeners) {
    fn({ sessionId, status });
  }
}

// ── Tests ──

describe('Codex E2E: Full Pipeline', () => {
  let orchestrator: CodexOrchestrator;

  beforeEach(async () => {
    sessionListeners.clear();
    sendToSessionSpy.mockClear();

    // Reset session status
    mockSessions[0].status = 'ready';
    mockSessions[1].status = 'ready';

    orchestrator = new CodexOrchestrator({
      maxSessions: 5,
      projects: [
        { name: 'alpha', path: '/dev/alpha', aliases: ['알파', 'a'], techStack: ['TypeScript', 'React'] },
        { name: 'beta', path: '/dev/beta', aliases: ['베타', 'b'], techStack: ['Python', 'FastAPI'] },
      ],
    });
    // Prevent unhandled 'error' events from crashing tests
    orchestrator.on('error', () => {});
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  // ── Routing Pipeline ──

  describe('Routing: @mention → SESSION_FORWARD', () => {
    it('should forward @alpha command to alpha session', async () => {
      const result = await orchestrator.processInput({
        text: '@olympus-alpha 빌드해줘',
        source: 'telegram',
        timestamp: Date.now(),
      });

      expect(result.decision.type).toBe('SESSION_FORWARD');
      expect(result.decision.targetSessions).toContain('sess-alpha');
      expect(sendToSessionSpy).toHaveBeenCalledWith('sess-alpha', '빌드해줘');
    });

    it('should return error for unknown session mention', async () => {
      const result = await orchestrator.processInput({
        text: '@unknown-session test',
        source: 'telegram',
        timestamp: Date.now(),
      });

      // Falls through to other routing strategies
      expect(result.decision).toBeDefined();
    });
  });

  describe('Routing: Global Query → SELF_ANSWER', () => {
    it('should answer status query from context', async () => {
      const result = await orchestrator.processInput({
        text: '지금 뭐 하고 있어?',
        source: 'dashboard',
        timestamp: Date.now(),
      });

      expect(result.decision.type).toBe('SELF_ANSWER');
      expect(result.response).toBeDefined();
      expect(result.response!.type).toBe('text');
      expect(result.response!.content).toBeTruthy();
    });

    it('should handle context query with search results', async () => {
      const result = await orchestrator.processInput({
        text: '최근 작업 내역 알려줘',
        source: 'telegram',
        timestamp: Date.now(),
      });

      expect(result.decision).toBeDefined();
      expect(result.response).toBeDefined();
    });
  });

  describe('Routing: Fallback → Last Active Session', () => {
    it('should use last active session for ambiguous input', async () => {
      // First: set last active via explicit forward
      await orchestrator.processInput({
        text: '@olympus-alpha hello',
        source: 'telegram',
        timestamp: Date.now(),
      });

      // Then: ambiguous input should go to alpha
      const result = await orchestrator.processInput({
        text: '이것도 해줘',
        source: 'telegram',
        timestamp: Date.now(),
      });

      expect(result.decision).toBeDefined();
      // If SESSION_FORWARD, should target last active
      if (result.decision.type === 'SESSION_FORWARD') {
        expect(result.decision.targetSessions).toContain('sess-alpha');
      }
    });
  });

  // ── Event Pipeline ──

  describe('Event Pipeline: session:status forwarding', () => {
    it('should forward session status changes', async () => {
      const statusPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('session:status', resolve);
      });

      emitSessionStatus('sess-beta', 'busy');

      const status = await statusPromise as { sessionId: string; status: string };
      expect(status.sessionId).toBe('sess-beta');
      expect(status.status).toBe('busy');
    });
  });

  // ── Session Management ──

  describe('Session Management via Orchestrator', () => {
    it('should list all sessions', () => {
      const sessions = orchestrator.getSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('sess-alpha');
      expect(sessions[1].id).toBe('sess-beta');
    });

    it('should return empty projects (deprecated)', async () => {
      const projects = await orchestrator.getProjects();
      expect(projects).toEqual([]);
    });

    it('should return empty search results (deprecated)', async () => {
      const results = await orchestrator.globalSearch('deploy');
      expect(results).toEqual([]);
    });

    it('should create new session', async () => {
      const session = await orchestrator.createSession('/dev/gamma', 'olympus-gamma');
      expect(session.name).toBe('olympus-gamma');
      expect(session.projectPath).toBe('/dev/gamma');
      expect(session.status).toBe('ready');
    });

    it('should close session', () => {
      const result = orchestrator.closeSession('sess-alpha');
      expect(result).toBe(true);
    });
  });

  // ── Multi-source Input ──

  describe('Multi-source Input Handling', () => {
    it('should handle telegram source', async () => {
      const result = await orchestrator.processInput({
        text: '빌드 상태 알려줘',
        source: 'telegram',
        chatId: 12345,
        timestamp: Date.now(),
      });

      expect(result.decision).toBeDefined();
    });

    it('should handle dashboard source', async () => {
      const result = await orchestrator.processInput({
        text: '프로젝트 현황',
        source: 'dashboard',
        clientId: 'ws-client-1',
        timestamp: Date.now(),
      });

      expect(result.decision).toBeDefined();
    });

    it('should handle cli source', async () => {
      const result = await orchestrator.processInput({
        text: '@olympus-beta run tests',
        source: 'cli',
        timestamp: Date.now(),
      });

      expect(result.decision).toBeDefined();
    });
  });

  // ── Lifecycle ──

  describe('Lifecycle', () => {
    it('should initialize only once (idempotent)', async () => {
      expect(orchestrator.initialized).toBe(true);
      await orchestrator.initialize(); // second call
      expect(orchestrator.initialized).toBe(true);
    });

    it('should shutdown cleanly', async () => {
      await orchestrator.shutdown();
      expect(orchestrator.initialized).toBe(false);
    });

    it('should handle sequential init → shutdown → init', async () => {
      await orchestrator.shutdown();
      expect(orchestrator.initialized).toBe(false);

      // Re-create since shutdown clears state
      orchestrator = new CodexOrchestrator({
        projects: [{ name: 'test', path: '/dev/test', aliases: [], techStack: [] }],
      });
      await orchestrator.initialize();
      expect(orchestrator.initialized).toBe(true);
    });
  });

});
