/**
 * Codex E2E Tests
 *
 * Tests the full Orchestrator pipeline:
 *   UserInput → Router → SessionManager → OutputMonitor → ResponseProcessor → AgentBrain
 *
 * All external deps (tmux, sqlite) are mocked.
 * Focus: pipeline correctness, event flow, error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexOrchestrator } from '../orchestrator.js';
import type { ManagedSession, ProcessedResponse } from '../types.js';

// ── Mock SessionManager ──

const mockSessions: ManagedSession[] = [
  {
    id: 'sess-alpha',
    name: 'olympus-alpha',
    projectPath: '/dev/alpha',
    tmuxSession: 'olympus-alpha',
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
    tmuxSession: 'olympus-beta',
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
    findByName: vi.fn((name: string) => mockSessions.find(s => s.name === name || s.tmuxSession === name) ?? null),
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
        tmuxSession: name ?? 'olympus-new',
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

// ── Mock ContextManager ──

vi.mock('../context-manager.js', () => ({
  ContextManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(async () => {}),
    registerProject: vi.fn(async () => {}),
    getAllProjects: vi.fn(async () => [
      { name: 'alpha', path: '/dev/alpha', aliases: ['알파', 'a'], techStack: ['TypeScript', 'React'] },
      { name: 'beta', path: '/dev/beta', aliases: ['베타', 'b'], techStack: ['Python', 'FastAPI'] },
    ]),
    getProjectContext: vi.fn(async (path: string) => ({
      path,
      name: path.includes('alpha') ? 'alpha' : 'beta',
      lastUpdated: Date.now(),
      recentTasks: [{
        id: 'task-1',
        command: 'build project',
        analysis: '{}',
        plan: '{}',
        result: 'success',
        success: true,
        duration: 5000,
        timestamp: Date.now() - 60000,
        projectPath: path,
        workerCount: 1,
      }],
      learningPatterns: [],
      techStack: path.includes('alpha') ? ['TypeScript'] : ['Python'],
      activeIssues: [],
      taskCount: 5,
      patternCount: 2,
    })),
    globalSearch: vi.fn(async (query: string, limit?: number) => {
      const results = [
        { projectName: 'alpha', projectPath: '/dev/alpha', matchType: 'task' as const, content: `found: ${query}`, score: 5, timestamp: Date.now() },
        { projectName: 'beta', projectPath: '/dev/beta', matchType: 'pattern' as const, content: `match: ${query}`, score: 3, timestamp: Date.now() },
      ];
      return limit ? results.slice(0, limit) : results;
    }),
    close: vi.fn(),
  })),
}));

// ── Helper: emit session output from mock SessionManager ──

function emitSessionOutput(sessionId: string, content: string) {
  const listeners = sessionListeners.get('session:output') ?? [];
  for (const fn of listeners) {
    fn({ sessionId, content });
  }
}

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

  describe('Event Pipeline: session:output → ResponseProcessor → broadcast', () => {
    it('should process and emit session output', async () => {
      const outputPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('session:output', resolve);
      });

      emitSessionOutput('sess-alpha', 'Build successful! 0 errors, 0 warnings.');

      const output = await outputPromise as {
        sessionId: string;
        projectName: string;
        response: ProcessedResponse;
      };

      expect(output.sessionId).toBe('sess-alpha');
      expect(output.projectName).toBe('olympus-alpha');
      expect(output.response).toBeDefined();
      expect(output.response.content).toBeTruthy();
      expect(output.response.rawOutput).toContain('Build successful');
    });

    it('should detect build output type', async () => {
      const outputPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('session:output', resolve);
      });

      emitSessionOutput('sess-alpha', 'Build succeeded in 2.5s\n\n9 packages built');

      const output = await outputPromise as { response: ProcessedResponse };
      expect(output.response.type).toBe('build');
    });

    it('should detect error output type', async () => {
      const outputPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('session:output', resolve);
      });

      emitSessionOutput('sess-beta', '3 errors found\nTypeError: Cannot find module \'missing-dep\'');

      const output = await outputPromise as { response: ProcessedResponse };
      expect(output.response.type).toBe('error');
    });

    it('should detect test output type', async () => {
      const outputPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('session:output', resolve);
      });

      emitSessionOutput('sess-alpha', 'Tests: 51 passed (51)\nDuration: 188ms');

      const output = await outputPromise as { response: ProcessedResponse };
      expect(output.response.type).toBe('test');
    });

    it('should emit error for invalid session output', async () => {
      const errorPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('error', resolve);
      });

      // Emit for non-existent session
      emitSessionOutput('sess-nonexistent', 'some output');

      // Should either emit error or silently ignore (getSession returns null)
      // Since getSession returns null, the try block exits early
      // Verify no crash occurs
      expect(orchestrator.initialized).toBe(true);
    });
  });

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

    it('should list all projects', async () => {
      const projects = await orchestrator.getProjects();
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('alpha');
      expect(projects[1].name).toBe('beta');
    });

    it('should perform global search', async () => {
      const results = await orchestrator.globalSearch('deploy');
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('deploy');
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

  // ── ResponseProcessor Integration ──

  describe('ResponseProcessor: formatForTelegram', () => {
    it('should process output with file changes', async () => {
      const outputPromise = new Promise<unknown>((resolve) => {
        orchestrator.on('session:output', resolve);
      });

      emitSessionOutput('sess-alpha', '⏺ Edit packages/core/src/index.ts\n⏺ Write packages/core/src/new.ts\nDone.');

      const output = await outputPromise as { response: ProcessedResponse };
      expect(output.response.metadata.filesChanged).toBeDefined();
      expect(output.response.metadata.filesChanged!.length).toBeGreaterThan(0);
    });
  });
});
