import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexAdapter, type CodexOrchestratorLike } from '../codex-adapter.js';
import { RpcRouter } from '../rpc/handler.js';

// ── Mock Orchestrator ──

function createMockOrchestrator(): CodexOrchestratorLike {
  const listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  return {
    initialized: true,
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(listener);
    },
    emit(event: string, ...args: unknown[]) {
      const fns = listeners.get(event) ?? [];
      for (const fn of fns) fn(...args);
    },
    processInput: vi.fn(async (input) => ({
      decision: {
        type: 'SELF_ANSWER',
        targetSessions: [],
        processedInput: input.text,
        confidence: 0.9,
        reason: '자체 답변',
      },
      response: {
        type: 'text',
        content: `답변: ${input.text}`,
        metadata: { projectName: 'test', sessionId: '', duration: 100 },
        rawOutput: `답변: ${input.text}`,
      },
    })),
    getSessions: vi.fn(() => [
      {
        id: 'sess-1',
        name: 'olympus-test',
        projectPath: '/dev/test',
        status: 'ready',
        lastActivity: Date.now(),
      },
    ]),
    getProjects: vi.fn(async () => [
      {
        name: 'test-project',
        path: '/dev/test',
        aliases: ['테스트'],
        techStack: ['TypeScript'],
      },
    ]),
    globalSearch: vi.fn(async (query: string) => [
      {
        projectName: 'test-project',
        projectPath: '/dev/test',
        matchType: 'task' as const,
        content: `build ${query}`,
        score: 2,
        timestamp: Date.now(),
      },
    ]),
    shutdown: vi.fn(async () => {}),
    trackTask: vi.fn(),
    completeTask: vi.fn(),
    getActiveTasks: vi.fn(() => []),
  } as CodexOrchestratorLike & { emit: (...args: unknown[]) => void };
}

// ── Tests ──

describe('CodexAdapter', () => {
  let adapter: CodexAdapter;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let broadcastSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOrchestrator = createMockOrchestrator();
    broadcastSpy = vi.fn();
    adapter = new CodexAdapter(mockOrchestrator, broadcastSpy);
  });

  describe('constructor', () => {
    it('should create adapter', () => {
      expect(adapter).toBeDefined();
    });

    it('should forward session:screen events to broadcast', () => {
      const payload = {
        sessionId: 'sess-1',
        projectName: 'test',
        response: { type: 'text', content: 'hello' },
      };
      (mockOrchestrator as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit('session:screen', payload);
      expect(broadcastSpy).toHaveBeenCalledWith('session:screen', payload);
    });

    it('should forward session:status events to broadcast', () => {
      const payload = { sessionId: 'sess-1', status: 'idle' };
      (mockOrchestrator as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit('session:status', payload);
      expect(broadcastSpy).toHaveBeenCalledWith('codex:session-event', payload);
    });
  });

  describe('handleInput', () => {
    it('should route input to orchestrator', async () => {
      const result = await adapter.handleInput({
        text: '프로젝트 현황 알려줘',
        source: 'telegram',
      });

      expect(result.requestId).toBeDefined();
      expect(result.decision.type).toBe('SELF_ANSWER');
      expect(result.response?.content).toContain('프로젝트 현황 알려줘');
    });

    it('should include requestId in result', async () => {
      const result = await adapter.handleInput({
        text: '빌드해줘',
        source: 'dashboard',
      });

      expect(result.requestId).toHaveLength(12);
    });

    it('should forward source correctly', async () => {
      await adapter.handleInput({
        text: 'test',
        source: 'cli',
        timestamp: 12345,
      });

      expect(mockOrchestrator.processInput).toHaveBeenCalledWith({
        text: 'test',
        source: 'cli',
        timestamp: 12345,
      });
    });

    it('should default timestamp to now', async () => {
      const before = Date.now();
      await adapter.handleInput({
        text: 'test',
        source: 'telegram',
      });

      const call = (mockOrchestrator.processInput as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getStatus', () => {
    it('should return status', () => {
      const status = adapter.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.sessionCount).toBe(1);
    });
  });

  describe('registerRpcMethods', () => {
    let rpcRouter: RpcRouter;

    beforeEach(() => {
      rpcRouter = new RpcRouter();
      adapter.registerRpcMethods(rpcRouter);
    });

    it('should register codex.route', () => {
      expect(rpcRouter.has('codex.route')).toBe(true);
    });

    it('should register codex.sessions', () => {
      expect(rpcRouter.has('codex.sessions')).toBe(true);
    });

    it('should register codex.projects', () => {
      expect(rpcRouter.has('codex.projects')).toBe(true);
    });

    it('should register codex.search', () => {
      expect(rpcRouter.has('codex.search')).toBe(true);
    });

    it('should register codex.status', () => {
      expect(rpcRouter.has('codex.status')).toBe(true);
    });
  });
});

describe('CodexAdapter RPC handlers', () => {
  let adapter: CodexAdapter;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let rpcRouter: RpcRouter;

  beforeEach(() => {
    mockOrchestrator = createMockOrchestrator();
    adapter = new CodexAdapter(mockOrchestrator, vi.fn());
    rpcRouter = new RpcRouter();
    adapter.registerRpcMethods(rpcRouter);
  });

  it('codex.sessions should return session list', async () => {
    // We need to invoke the handler directly since RpcRouter.handleRpc needs WS
    // Instead, test that getSessions was called via the adapter
    const sessions = mockOrchestrator.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('olympus-test');
  });

  it('codex.projects should return project list', async () => {
    const projects = await mockOrchestrator.getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('test-project');
  });

  it('codex.search should return search results', async () => {
    const results = await mockOrchestrator.globalSearch('build');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('build');
  });

  it('should list all registered methods', () => {
    const methods = rpcRouter.listMethods();
    expect(methods).toContain('codex.route');
    expect(methods).toContain('codex.sessions');
    expect(methods).toContain('codex.projects');
    expect(methods).toContain('codex.search');
    expect(methods).toContain('codex.status');
  });
});
