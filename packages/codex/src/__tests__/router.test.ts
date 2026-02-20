import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../router.js';
import type { CodexSessionManager } from '../session-manager.js';
import type { UserInput, ManagedSession } from '../types.js';

function createMockSessionManager(): CodexSessionManager {
  const sessions: ManagedSession[] = [
    {
      id: 'sess-1',
      name: 'olympus-console',
      projectPath: '/dev/console',

      status: 'ready',
      lastActivity: Date.now(),
      commandQueue: [],
      createdAt: Date.now(),
    },
    {
      id: 'sess-2',
      name: 'olympus-user-next',
      projectPath: '/dev/user-next',

      status: 'ready',
      lastActivity: Date.now(),
      commandQueue: [],
      createdAt: Date.now(),
    },
  ];

  return {
    listSessions: vi.fn(() => sessions),
    getSession: vi.fn((id: string) => sessions.find(s => s.id === id)),
    findByName: vi.fn((name: string) => {
      const lower = name.toLowerCase();
      return sessions.find(s => s.name.toLowerCase().includes(lower));
    }),
  } as unknown as CodexSessionManager;
}

describe('Router', () => {
  let router: Router;
  let sessionManager: CodexSessionManager;

  beforeEach(() => {
    sessionManager = createMockSessionManager();
    router = new Router(sessionManager);
  });

  function input(text: string): UserInput {
    return { text, source: 'telegram', timestamp: Date.now() };
  }

  describe('route', () => {
    it('should route @mention to specific session', async () => {
      const result = await router.route(input('@console 빌드해줘'));
      expect(result.type).toBe('SESSION_FORWARD');
      expect(result.targetSessions).toEqual(['sess-1']);
      expect(result.processedInput).toBe('빌드해줘');
      expect(result.confidence).toBe(1.0);
    });

    it('should detect global query', async () => {
      const result = await router.route(input('모든 프로젝트 현황 알려줘'));
      expect(result.type).toBe('SELF_ANSWER');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect "지금 뭐 하고 있어?"', async () => {
      const result = await router.route(input('지금 뭐 하고 있어?'));
      expect(result.type).toBe('SELF_ANSWER');
    });

    it('should detect multi-session command', async () => {
      const result = await router.route(input('모든 프로젝트 빌드'));
      expect(result.type).toBe('MULTI_SESSION');
      expect(result.targetSessions.length).toBe(2);
    });

    it('should detect multi-session "all projects test"', async () => {
      const result = await router.route(input('all projects test'));
      expect(result.type).toBe('MULTI_SESSION');
    });

    it('should fallback for keyword input (project keyword matching disabled)', async () => {
      const result = await router.route(input('console API 수정해줘'));
      // Without ContextManager, keyword matching returns null → falls to SELF_ANSWER
      expect(result.type).toBe('SELF_ANSWER');
    });

    it('should fallback to last active session', async () => {
      router.recordLastSession('telegram', 'sess-2');
      const result = await router.route(input('빌드해줘'));
      expect(result.type).toBe('SESSION_FORWARD');
      expect(result.targetSessions).toEqual(['sess-2']);
      expect(result.confidence).toBe(0.5);
    });

    it('should return SELF_ANSWER when no sessions available', async () => {
      (sessionManager.listSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const result = await router.route(input('아무거나'));
      expect(result.type).toBe('SELF_ANSWER');
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('recordLastSession', () => {
    it('should update last active session per source', async () => {
      router.recordLastSession('telegram', 'sess-1');
      router.recordLastSession('dashboard', 'sess-2');

      const r1 = await router.route({ text: '테스트', source: 'telegram', timestamp: Date.now() });
      expect(r1.targetSessions).toEqual(['sess-1']);

      const r2 = await router.route({ text: '테스트', source: 'dashboard', timestamp: Date.now() });
      expect(r2.targetSessions).toEqual(['sess-2']);
    });
  });
});
