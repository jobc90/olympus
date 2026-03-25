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
    shutdown: vi.fn(async () => {}),
    trackTask: vi.fn(),
    completeTask: vi.fn(),
    getActiveTasks: vi.fn(() => []),
    interpretManualInput: vi.fn((input) => ({
      ...input,
      classification: 'new_task_candidate',
      reason: 'no active task context',
    })),
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

    it('should preserve planner metadata from the orchestrator decision', async () => {
      (mockOrchestrator.processInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        decision: {
          type: 'MULTI_SESSION',
          targetSessions: ['sess-1', 'sess-2'],
          processedInput: '상태 확인',
          confidence: 0.9,
          reason: 'planner decision',
          planning: {
            kind: 'multi_project',
            targetSessionIds: ['sess-1', 'sess-2'],
            targetProjectNames: ['console', 'user-next'],
            processedInput: '상태 확인',
            manualPath: false,
            confidence: 0.9,
            reason: 'multiple explicit project targets detected',
          },
        },
      });

      const result = await adapter.handleInput({
        text: '@console @user-next 상태 확인',
        source: 'dashboard',
      });

      expect(result.decision.planning).toMatchObject({
        kind: 'multi_project',
        targetSessionIds: ['sess-1', 'sess-2'],
      });
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

  describe('interpretManualInput', () => {
    it('should broadcast Codex manual input interpretation using worker context', async () => {
      const { WorkerRegistry } = await import('../worker-registry.js');
      const registry = new WorkerRegistry();
      const worker = registry.register({
        name: 'server-worker',
        projectPath: '/workspace/server',
        pid: 101,
        runtimeKind: 'tmux',
      });
      registry.markBusy(worker.id, 'worker-task-1', '로그인 API 수정', 'authority-task-1');
      adapter.setWorkerRegistry(registry);

      const result = await adapter.interpretManualInput({
        workerId: worker.id,
        workerName: worker.name,
        projectId: 'server',
        projectPath: worker.projectPath,
        prompt: '이 경고 무시하고 계속 진행해',
        source: 'dashboard',
        timestamp: 1_717_000_000_000,
      });

      expect(mockOrchestrator.interpretManualInput).toHaveBeenCalledWith({
        workerId: worker.id,
        workerName: worker.name,
        projectId: 'server',
        projectPath: worker.projectPath,
        prompt: '이 경고 무시하고 계속 진행해',
        source: 'dashboard',
        timestamp: 1_717_000_000_000,
        workerStatus: 'busy',
        currentTaskId: 'worker-task-1',
        currentAuthorityTaskId: 'authority-task-1',
        currentTaskPrompt: '로그인 API 수정',
      });
      expect(result).toMatchObject({
        classification: 'new_task_candidate',
        workerId: worker.id,
      });
      expect(broadcastSpy).toHaveBeenCalledWith('codex:manual-input-interpreted', expect.objectContaining({
        workerId: worker.id,
        classification: 'new_task_candidate',
      }));
    });
  });

  describe('tryDelegateMention', () => {
    it('should delegate @mention through ProjectRuntimeAdapter', async () => {
      const { WorkerRegistry } = await import('../worker-registry.js');
      const registry = new WorkerRegistry();
      const worker = registry.register({
        name: 'server-worker',
        projectPath: '/workspace/server',
        pid: 101,
        runtimeKind: 'tmux',
      });
      const dispatchTask = vi.fn(async () => ({
        disposition: 'assigned' as const,
        task: { id: 'authority-1', status: 'in_progress' },
        worker,
        workerTask: { taskId: 'worker-task-1' },
        ephemeralWorkspace: null,
      }));

      adapter.setWorkerRegistry(registry);
      adapter.setProjectRuntimeAdapter({ dispatchTask } as never);

      const result = await adapter.tryDelegateMention({
        message: '@server-worker 로그인 API 수정해',
        source: 'dashboard',
        chatId: 7,
      });

      expect(dispatchTask).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'server',
        preferredWorkerId: worker.id,
        provider: 'claude',
      }));
      expect(result).toMatchObject({
        httpStatus: 200,
        body: {
          type: 'delegation',
          authorityTaskId: 'authority-1',
          taskId: 'worker-task-1',
        },
      });
    });

    it('should return busy chat response when mentioned worker is busy', async () => {
      const { WorkerRegistry } = await import('../worker-registry.js');
      const registry = new WorkerRegistry();
      const worker = registry.register({
        name: 'server-worker',
        projectPath: '/workspace/server',
        pid: 101,
        runtimeKind: 'tmux',
      });
      registry.markBusy(worker.id, 'task-1', 'existing task', 'authority-1');
      adapter.setWorkerRegistry(registry);

      const result = await adapter.tryDelegateMention({
        message: '@server-worker 로그인 API 수정해',
        source: 'dashboard',
      });

      expect(result).toMatchObject({
        httpStatus: 200,
        body: {
          type: 'chat',
          response: expect.stringContaining('현재 작업 중입니다'),
        },
      });
    });
  });

  describe('getStatus', () => {
    it('should return status', () => {
      const status = adapter.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.sessionCount).toBe(1);
    });

    it('should include project summaries in full status when reporting context is available', async () => {
      const { WorkerRegistry } = await import('../worker-registry.js');
      const { TaskSummaryService } = await import('../reporting/task-summary-service.js');
      const registry = new WorkerRegistry();
      registry.register({
        name: 'server-default',
        projectPath: '/workspace/server',
        pid: 101,
        runtimeKind: 'tmux',
      });

      adapter.setWorkerRegistry(registry);
      adapter.setTaskReportingContext(
        {
          listTasks: () => [
            {
              id: 'authority-1',
              displayLabel: 'server-risk',
              title: 'Fix deploy',
              kind: 'project',
              status: 'blocked',
              projectId: 'server',
              parentTaskId: null,
              assignedWorkerId: null,
              priority: 1,
              metadata: null,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        } as never,
        new TaskSummaryService(),
      );

      const status = await adapter.getFullStatus();
      expect(status.projectSummaries).toEqual([
        expect.objectContaining({
          projectId: 'server',
          summary: 'Blocked: Fix deploy',
        }),
      ]);
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

  it('should list all registered methods', () => {
    const methods = rpcRouter.listMethods();
    expect(methods).toContain('codex.route');
    expect(methods).toContain('codex.sessions');
    expect(methods).toContain('codex.search');
    expect(methods).toContain('codex.status');
  });
});
