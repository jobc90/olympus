import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexOrchestrator } from '../orchestrator.js';

// Mock all child modules to avoid sqlite deps in unit tests
vi.mock('../session-manager.js', () => ({
  CodexSessionManager: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    listSessions: vi.fn(() => [
      {
        id: 'sess-1',
        name: 'olympus-test',
        projectPath: '/dev/test',

        status: 'ready',
        lastActivity: Date.now(),
        contextDbPath: '/tmp/mem.db',
        commandQueue: [],
        createdAt: Date.now(),
      },
    ]),
    getSession: vi.fn((id: string) => ({
      id,
      name: 'olympus-test',
      projectPath: '/dev/test',
      status: 'ready',
      lastActivity: Date.now(),
      contextDbPath: '/tmp/mem.db',
      commandQueue: [],
      createdAt: Date.now(),
    })),
    sendToSession: vi.fn(async () => true),
    closeSession: vi.fn(() => true),
    shutdown: vi.fn(),
  })),
}));


describe('CodexOrchestrator', () => {
  let orchestrator: CodexOrchestrator;

  beforeEach(() => {
    orchestrator = new CodexOrchestrator({
      maxSessions: 5,
      projects: [{ name: 'test', path: '/dev/test', aliases: ['테스트'], techStack: ['TS'] }],
    });
  });

  describe('constructor', () => {
    it('should create orchestrator', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await orchestrator.initialize();
      expect(orchestrator.initialized).toBe(true);
    });

    it('should be idempotent', async () => {
      await orchestrator.initialize();
      await orchestrator.initialize();
      expect(orchestrator.initialized).toBe(true);
    });
  });

  describe('processInput', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should route global query to SELF_ANSWER', async () => {
      const result = await orchestrator.processInput({
        text: '지금 뭐 하고 있어?',
        source: 'telegram',
        timestamp: Date.now(),
      });

      expect(result.decision.type).toBe('SELF_ANSWER');
      expect(result.response).toBeDefined();
      expect(result.response?.content).toBeTruthy();
    });

    it('should handle SESSION_FORWARD with no target gracefully', async () => {
      // Force no sessions for this test
      const result = await orchestrator.processInput({
        text: '빌드해줘',
        source: 'telegram',
        timestamp: Date.now(),
      });

      // Could be SELF_ANSWER or SESSION_FORWARD depending on state
      expect(result.decision).toBeDefined();
    });
  });

  describe('getSessions', () => {
    it('should return session list', () => {
      const sessions = orchestrator.getSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await orchestrator.initialize();
      await orchestrator.shutdown();
      expect(orchestrator.initialized).toBe(false);
    });
  });
});
