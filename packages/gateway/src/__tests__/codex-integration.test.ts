/**
 * Codex Integration Tests
 *
 * Tests the full pipeline: CodexAdapter ↔ Mock Orchestrator ↔ RPC Router
 * Validates event forwarding, RPC handler execution, and response mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexAdapter, type CodexOrchestratorLike } from '../codex-adapter.js';
import { RpcRouter } from '../rpc/handler.js';
import type { WebSocket } from 'ws';
import { createMessage, type WsMessage, type RpcRequestPayload } from '@olympus-dev/protocol';

// ── Full Mock Orchestrator with Event Emitter ──

function createFullOrchestrator(): CodexOrchestratorLike & {
  emit: (event: string, ...args: unknown[]) => void;
  _sessions: Array<{ id: string; name: string; projectPath: string; status: string; lastActivity: number }>;
  _projects: Array<{ name: string; path: string; aliases: string[]; techStack: string[] }>;
} {
  const listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  const sessions = [
    { id: 'sess-alpha', name: 'alpha-project', projectPath: '/dev/alpha', status: 'ready', lastActivity: Date.now() },
    { id: 'sess-beta', name: 'beta-project', projectPath: '/dev/beta', status: 'busy', lastActivity: Date.now() - 5000 },
  ];

  const projects = [
    { name: 'alpha', path: '/dev/alpha', aliases: ['알파', 'a'], techStack: ['TypeScript', 'React'] },
    { name: 'beta', path: '/dev/beta', aliases: ['베타', 'b'], techStack: ['Python', 'FastAPI'] },
  ];

  return {
    initialized: true,
    _sessions: sessions,
    _projects: projects,

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
        type: input.text.includes('상태') ? 'STATUS' : 'FORWARD',
        targetSessions: input.text.includes('알파') ? ['sess-alpha'] : ['sess-beta'],
        processedInput: input.text,
        confidence: 0.85,
        reason: 'Keyword match',
      },
      response: {
        type: 'text',
        content: `Response for: ${input.text}`,
        metadata: {
          projectName: input.text.includes('알파') ? 'alpha' : 'beta',
          sessionId: input.text.includes('알파') ? 'sess-alpha' : 'sess-beta',
          duration: 150,
        },
        rawOutput: `Raw: ${input.text}`,
        agentInsight: 'Task forwarded to appropriate session',
      },
    })),

    getSessions: vi.fn(() => sessions),

    getProjects: vi.fn(async () => projects),

    globalSearch: vi.fn(async (query: string, limit?: number) => {
      const results = [
        { projectName: 'alpha', projectPath: '/dev/alpha', matchType: 'task' as const, content: `build ${query}`, score: 3, timestamp: Date.now() - 60000 },
        { projectName: 'beta', projectPath: '/dev/beta', matchType: 'pattern' as const, content: `test ${query}`, score: 2, timestamp: Date.now() - 120000 },
      ];
      return limit ? results.slice(0, limit) : results;
    }),

    shutdown: vi.fn(async () => {}),

    trackTask: vi.fn(),
    completeTask: vi.fn(),
    getActiveTasks: vi.fn(() => []),
  };
}

// ── Helper: invoke RPC via router ──

async function invokeRpc(
  rpcRouter: RpcRouter,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const msg = createMessage('rpc', { method, params }) as WsMessage<RpcRequestPayload>;

    const mockWs = {
      readyState: 1,
      send: vi.fn(),
    } as unknown as WebSocket;

    const sendFn = (_ws: unknown, response: unknown) => {
      const resp = response as WsMessage;
      if (resp.type === 'rpc:result') {
        resolve((resp.payload as { result: unknown }).result);
      } else if (resp.type === 'rpc:error') {
        reject(new Error((resp.payload as { message: string }).message));
      }
    };

    rpcRouter.handleRpc(msg, { clientId: 'test-client', ws: mockWs, authenticated: true }, sendFn);
  });
}

// ── Tests ──

describe('Codex Integration: Adapter + RPC Pipeline', () => {
  let orchestrator: ReturnType<typeof createFullOrchestrator>;
  let adapter: CodexAdapter;
  let rpcRouter: RpcRouter;
  let broadcastSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    orchestrator = createFullOrchestrator();
    broadcastSpy = vi.fn();
    adapter = new CodexAdapter(orchestrator, broadcastSpy);
    rpcRouter = new RpcRouter();
    adapter.registerRpcMethods(rpcRouter);
  });

  // ── Full Pipeline Tests ──

  describe('codex.route RPC', () => {
    it('should route Korean text and return decision + response', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.route', { text: '알파 프로젝트 빌드해줘', source: 'dashboard' }) as {
        requestId: string;
        decision: { type: string; targetSessions: string[] };
        response: { content: string };
      };

      expect(result.requestId).toBeDefined();
      expect(result.decision.type).toBe('FORWARD');
      expect(result.decision.targetSessions).toContain('sess-alpha');
      expect(result.response.content).toContain('알파 프로젝트 빌드해줘');
    });

    it('should route status query correctly', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.route', { text: '상태 확인', source: 'telegram' }) as {
        decision: { type: string };
      };

      expect(result.decision.type).toBe('STATUS');
    });

    it('should pass timestamp to orchestrator', async () => {
      await invokeRpc(rpcRouter, 'codex.route', { text: 'test', source: 'cli' });

      expect(orchestrator.processInput).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'test',
          source: 'cli',
          timestamp: expect.any(Number),
        }),
      );
    });
  });

  describe('codex.sessions RPC', () => {
    it('should return all sessions with correct shape', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.sessions') as Array<{
        id: string;
        name: string;
        projectPath: string;
        status: string;
        lastActivity: number;
      }>;

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sess-alpha');
      expect(result[0].status).toBe('ready');
      expect(result[1].id).toBe('sess-beta');
      expect(result[1].status).toBe('busy');
    });
  });

  describe('codex.projects RPC', () => {
    it('should return all projects with tech stacks', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.projects') as Array<{
        name: string;
        path: string;
        aliases: string[];
        techStack: string[];
      }>;

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('alpha');
      expect(result[0].techStack).toContain('TypeScript');
      expect(result[1].aliases).toContain('베타');
    });
  });

  describe('codex.search RPC', () => {
    it('should search across projects', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.search', { query: 'deploy' }) as Array<{
        projectName: string;
        matchType: string;
        content: string;
        score: number;
      }>;

      expect(result).toHaveLength(2);
      expect(result[0].content).toContain('deploy');
      expect(result[0].matchType).toBe('task');
      expect(result[1].matchType).toBe('pattern');
    });

    it('should respect limit parameter', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.search', { query: 'build', limit: 1 }) as Array<unknown>;

      expect(result).toHaveLength(1);
    });
  });

  describe('codex.status RPC', () => {
    it('should return aggregated status', async () => {
      const result = await invokeRpc(rpcRouter, 'codex.status') as {
        initialized: boolean;
        sessionCount: number;
        projectCount: number;
      };

      expect(result.initialized).toBe(true);
      expect(result.sessionCount).toBe(2);
      expect(result.projectCount).toBe(2);
    });
  });

  // ── Event Forwarding Tests ──

  describe('Event forwarding pipeline', () => {
    it('should broadcast session output to all clients', () => {
      const payload = {
        sessionId: 'sess-alpha',
        projectName: 'alpha',
        response: { type: 'text', content: 'Build successful' },
      };

      orchestrator.emit('session:screen', payload);

      expect(broadcastSpy).toHaveBeenCalledWith('session:screen', payload);
    });

    it('should broadcast session status changes', () => {
      const payload = { sessionId: 'sess-beta', status: 'idle', projectName: 'beta' };

      orchestrator.emit('session:status', payload);

      expect(broadcastSpy).toHaveBeenCalledWith('codex:session-event', payload);
    });

    it('should handle multiple events in sequence', () => {
      orchestrator.emit('session:screen', { sessionId: 'sess-alpha', content: 'step 1' });
      orchestrator.emit('session:screen', { sessionId: 'sess-alpha', content: 'step 2' });
      orchestrator.emit('session:status', { sessionId: 'sess-alpha', status: 'idle' });

      expect(broadcastSpy).toHaveBeenCalledTimes(3);
    });
  });

  // ── Adapter State Tests ──

  describe('Adapter state', () => {
    it('should report correct status via getStatus()', () => {
      const status = adapter.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.sessionCount).toBe(2);
    });

    it('should generate unique requestIds per call', async () => {
      const r1 = await adapter.handleInput({ text: 'test1', source: 'cli' });
      const r2 = await adapter.handleInput({ text: 'test2', source: 'cli' });

      expect(r1.requestId).not.toBe(r2.requestId);
      expect(r1.requestId).toHaveLength(12);
      expect(r2.requestId).toHaveLength(12);
    });
  });

  // ── Error Handling ──

  describe('Error handling', () => {
    it('should propagate orchestrator errors through RPC', async () => {
      (orchestrator.processInput as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Session timeout'));

      await expect(invokeRpc(rpcRouter, 'codex.route', { text: 'fail', source: 'cli' })).rejects.toThrow();
    });

    it('should handle unregistered RPC methods gracefully', async () => {
      await expect(invokeRpc(rpcRouter, 'codex.nonexistent', {})).rejects.toThrow();
    });
  });
});
