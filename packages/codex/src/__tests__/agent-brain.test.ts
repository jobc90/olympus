import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentBrain } from '../agent-brain.js';
import type { CodexSessionManager } from '../session-manager.js';
import type { ContextManager } from '../context-manager.js';

function createMockSessionManager(): CodexSessionManager {
  const sessions = [
    {
      id: 'sess-1',
      name: 'olympus-console',
      projectPath: '/dev/console',
      tmuxSession: 'olympus-console',
      status: 'ready' as const,
      lastActivity: Date.now(),
      contextDbPath: '/tmp/memory.db',
      commandQueue: [] as string[],
      createdAt: Date.now(),
    },
  ];

  return {
    listSessions: vi.fn(() => sessions),
    getSession: vi.fn((id: string) => sessions.find(s => s.id === id)),
  } as unknown as CodexSessionManager;
}

function createMockContextManager(): ContextManager {
  return {
    getAllProjects: vi.fn(async () => [
      { name: 'console', path: '/dev/console', aliases: ['콘솔'], techStack: ['NestJS'] },
    ]),
    getProjectContext: vi.fn(async () => ({
      path: '/dev/console',
      name: 'console',
      lastUpdated: Date.now(),
      recentTasks: [
        { id: 't1', command: 'pnpm build', result: 'success', success: true, duration: 5000, timestamp: Date.now() - 60000, projectPath: '/dev/console', workerCount: 1, analysis: '', plan: '' },
      ],
      learningPatterns: [
        { id: 'p1', trigger: 'EPERM', action: 'sudo 필요', confidence: 0.8, usageCount: 3, lastUsed: Date.now() },
      ],
      techStack: ['NestJS'],
      activeIssues: [],
      taskCount: 10,
      patternCount: 2,
    })),
    globalSearch: vi.fn(async () => [
      { projectName: 'console', projectPath: '/dev/console', matchType: 'task' as const, content: 'API build', score: 2, timestamp: Date.now() },
    ]),
  } as unknown as ContextManager;
}

describe('AgentBrain', () => {
  let brain: AgentBrain;

  beforeEach(() => {
    brain = new AgentBrain(createMockContextManager(), createMockSessionManager());
  });

  describe('analyzeIntent', () => {
    it('should detect /sessions command', async () => {
      const result = await brain.analyzeIntent('/sessions', 'telegram');
      expect(result.type).toBe('SESSION_MANAGEMENT');
      expect(result.action).toBe('list');
      expect(result.confidence).toBe(1.0);
    });

    it('should detect /세션 command', async () => {
      const result = await brain.analyzeIntent('/세션', 'telegram');
      expect(result.type).toBe('SESSION_MANAGEMENT');
      expect(result.action).toBe('list');
    });

    it('should detect /use command', async () => {
      const result = await brain.analyzeIntent('/use console', 'telegram');
      expect(result.type).toBe('SESSION_MANAGEMENT');
      expect(result.action).toBe('switch');
    });

    it('should detect /close command', async () => {
      const result = await brain.analyzeIntent('/close', 'telegram');
      expect(result.type).toBe('SESSION_MANAGEMENT');
      expect(result.action).toBe('close');
    });

    it('should detect /new command', async () => {
      const result = await brain.analyzeIntent('/new /dev/my-project', 'telegram');
      expect(result.type).toBe('SESSION_MANAGEMENT');
      expect(result.action).toBe('create');
    });

    it('should detect history query (Korean)', async () => {
      const result = await brain.analyzeIntent('어제 뭐 했지?', 'telegram');
      expect(result.type).toBe('ANSWER_FROM_CONTEXT');
      expect(result.answer).toContain('작업 이력');
    });

    it('should detect history query (English)', async () => {
      const result = await brain.analyzeIntent('what did we work on recently?', 'dashboard');
      expect(result.type).toBe('ANSWER_FROM_CONTEXT');
    });

    it('should detect status query', async () => {
      const result = await brain.analyzeIntent('진행 상황 알려줘', 'telegram');
      expect(result.type).toBe('ANSWER_FROM_CONTEXT');
      expect(result.answer).toContain('프로젝트 현황');
    });

    it('should detect cross-project query', async () => {
      const result = await brain.analyzeIntent('두 프로젝트 비교해줘', 'telegram');
      expect(result.type).toBe('ANSWER_FROM_CONTEXT');
      expect(result.answer).toContain('크로스 프로젝트');
    });

    it('should default to FORWARD_TO_CLAUDE', async () => {
      const result = await brain.analyzeIntent('빌드해줘', 'telegram', 'sess-1');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
      expect(result.enrichedInput).toContain('빌드해줘');
    });

    it('should enrich input with project context', async () => {
      const result = await brain.analyzeIntent('API 수정해줘', 'telegram', 'sess-1');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
      expect(result.enrichedInput).toContain('[Codex Context]');
      expect(result.enrichedInput).toContain('NestJS');
    });
  });

  describe('enrichResponse', () => {
    it('should add build suggestion for build type', async () => {
      const response = {
        type: 'build' as const,
        content: 'Build succeeded',
        metadata: { projectName: 'console', sessionId: 'sess-1', duration: 3000 },
        rawOutput: 'Build succeeded',
      };

      const enriched = await brain.enrichResponse(response, '/dev/console');
      expect(enriched.agentInsight).toContain('테스트 실행 권장');
    });

    it('should add error suggestion for error type', async () => {
      const response = {
        type: 'error' as const,
        content: 'EPERM: operation not permitted',
        metadata: { projectName: 'console', sessionId: 'sess-1', duration: 1000 },
        rawOutput: 'EPERM error',
      };

      const enriched = await brain.enrichResponse(response, '/dev/console');
      expect(enriched.agentInsight).toContain('알려진 패턴');
    });
  });
});
