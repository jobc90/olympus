import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentBrain } from '../agent-brain.js';
import type { CodexSessionManager } from '../session-manager.js';

function createMockSessionManager(): CodexSessionManager {
  const sessions = [
    {
      id: 'sess-1',
      name: 'olympus-console',
      projectPath: '/dev/console',
      status: 'ready' as const,
      lastActivity: Date.now(),
      commandQueue: [] as string[],
      createdAt: Date.now(),
    },
  ];

  return {
    listSessions: vi.fn(() => sessions),
    getSession: vi.fn((id: string) => sessions.find(s => s.id === id)),
  } as unknown as CodexSessionManager;
}

describe('AgentBrain', () => {
  let brain: AgentBrain;

  beforeEach(() => {
    brain = new AgentBrain(createMockSessionManager());
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

    it('should forward history query to Claude (Korean)', async () => {
      const result = await brain.analyzeIntent('어제 뭐 했지?', 'telegram');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
    });

    it('should forward history query to Claude (English)', async () => {
      const result = await brain.analyzeIntent('what did we work on recently?', 'dashboard');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
    });

    it('should detect status query', async () => {
      const result = await brain.analyzeIntent('진행 상황 알려줘', 'telegram');
      expect(result.type).toBe('ANSWER_FROM_CONTEXT');
      expect(result.answer).toContain('프로젝트 현황');
    });

    it('should forward cross-project query to Claude', async () => {
      const result = await brain.analyzeIntent('두 프로젝트 비교해줘', 'telegram');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
    });

    it('should default to FORWARD_TO_CLAUDE', async () => {
      const result = await brain.analyzeIntent('빌드해줘', 'telegram', 'sess-1');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
      expect(result.enrichedInput).toContain('빌드해줘');
    });

    it('should pass input through without context enrichment', async () => {
      const result = await brain.analyzeIntent('API 수정해줘', 'telegram', 'sess-1');
      expect(result.type).toBe('FORWARD_TO_CLAUDE');
      expect(result.enrichedInput).toBe('API 수정해줘');
    });
  });

});
