import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../router.js';
import type { CodexSessionManager } from '../session-manager.js';
import type { ContextManager } from '../context-manager.js';
import type { UserInput, ManagedSession, ProjectMetadata } from '../types.js';

function createMockSessionManager(): CodexSessionManager {
  const sessions: ManagedSession[] = [
    {
      id: 'sess-1',
      name: 'olympus-console',
      projectPath: '/dev/console',
      tmuxSession: 'olympus-console',
      status: 'ready',
      lastActivity: Date.now(),
      contextDbPath: '/tmp/memory.db',
      commandQueue: [],
      createdAt: Date.now(),
    },
    {
      id: 'sess-2',
      name: 'olympus-user-next',
      projectPath: '/dev/user-next',
      tmuxSession: 'olympus-user-next',
      status: 'ready',
      lastActivity: Date.now(),
      contextDbPath: '/tmp/memory.db',
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

function createMockContextManager(): ContextManager {
  const projects: ProjectMetadata[] = [
    { name: 'console', path: '/dev/console', aliases: ['콘솔', 'api', '백엔드'], techStack: ['NestJS'] },
    { name: 'user-next', path: '/dev/user-next', aliases: ['유저', '프론트'], techStack: ['Next.js'] },
  ];

  return {
    getAllProjects: vi.fn(async () => projects),
    getProjectContext: vi.fn(async () => ({
      path: '/dev/console',
      name: 'console',
      lastUpdated: Date.now(),
      recentTasks: [],
      learningPatterns: [],
      techStack: ['NestJS'],
      activeIssues: [],
      taskCount: 0,
      patternCount: 0,
    })),
  } as unknown as ContextManager;
}

describe('Router', () => {
  let router: Router;
  let sessionManager: CodexSessionManager;
  let contextManager: ContextManager;

  beforeEach(() => {
    sessionManager = createMockSessionManager();
    contextManager = createMockContextManager();
    router = new Router(sessionManager, contextManager);
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

    it('should route by project keyword', async () => {
      const result = await router.route(input('console API 수정해줘'));
      expect(result.type).toBe('SESSION_FORWARD');
      expect(result.targetSessions).toEqual(['sess-1']);
      expect(result.reason).toContain('console');
    });

    it('should route by alias keyword (한국어)', async () => {
      const result = await router.route(input('콘솔 빌드해줘'));
      expect(result.type).toBe('SESSION_FORWARD');
      expect(result.targetSessions).toEqual(['sess-1']);
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
      (contextManager.getAllProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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
