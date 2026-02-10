import type {
  AgentCommandParams,
  AgentCommandResult,
  AgentCancelResult,
  AgentStatusResult,
  AgentHistoryParams,
  AgentHistoryResult,
  AgentApproveParams,
  AgentApproveResult,
  AgentRejectParams,
  AgentRejectResult,
  WorkersListResult,
  WorkerTerminateParams,
  WorkerTerminateResult,
  WorkerOutputParams,
  WorkerOutputResult,
  SessionsListRpcResult,
  SessionsDiscoverResult,
} from '@olympus-dev/protocol';
import type { RpcRouter } from './handler.js';
import type { CodexAgent } from '../agent/agent.js';
import type { WorkerManager } from '../workers/manager.js';
import type { SessionManager } from '../session-manager.js';
import type { MemoryStore } from '../memory/store.js';

/**
 * Register Agent, Worker, and Session RPC methods.
 *
 * These bridge the RPC layer to the Codex Agent, Worker Manager,
 * and Session Manager instances.
 */
export function registerAgentMethods(
  router: RpcRouter,
  deps: {
    agent: CodexAgent;
    workerManager: WorkerManager;
    sessionManager: SessionManager;
    memoryStore: MemoryStore;
  },
): void {
  const { agent, workerManager, sessionManager, memoryStore } = deps;

  // ── Agent methods ────────────────────────────

  router.register(
    'agent.command',
    async (params: unknown): Promise<AgentCommandResult> => {
      const { command, projectPath, autoApprove } = params as AgentCommandParams;

      if (!command) {
        throw Object.assign(new Error('command is required'), { code: 'INVALID_PARAMS' });
      }

      try {
        const taskId = await agent.handleCommand({
          command,
          senderId: 'rpc',
          channelType: 'rpc',
          projectPath,
          autoApprove,
        });

        return {
          taskId,
          status: 'accepted',
          message: `작업 ${taskId} 시작됨`,
        };
      } catch (err) {
        const error = err as Error & { code?: string };
        if (error.code === 'AGENT_BUSY') {
          return {
            taskId: '',
            status: 'rejected',
            message: '에이전트가 현재 작업 중입니다',
          };
        }
        throw err;
      }
    },
  );

  router.register(
    'agent.status',
    (): AgentStatusResult => {
      const task = agent.currentTask;
      return {
        state: agent.state,
        currentTask: task ? {
          id: task.id,
          command: task.command,
          state: task.state,
          startedAt: task.startedAt,
        } : null,
        activeWorkers: workerManager.getActiveCount(),
        queuedCommands: agent.queueSize,
      };
    },
  );

  router.register(
    'agent.cancel',
    (): AgentCancelResult => {
      const cancelled = agent.cancel();
      return {
        cancelled,
        message: cancelled ? '작업이 취소되었습니다' : '취소할 작업이 없습니다',
      };
    },
  );

  router.register(
    'agent.history',
    (params: unknown): AgentHistoryResult => {
      const { limit = 20, offset = 0 } = (params || {}) as AgentHistoryParams;
      const tasks = memoryStore.getRecentTasks(limit, offset);
      const total = memoryStore.getTaskCount();

      return {
        tasks: tasks.map(t => ({
          id: t.id,
          command: t.command,
          status: t.success ? 'success' as const : 'failed' as const,
          summary: t.result,
          duration: t.duration,
          timestamp: t.timestamp,
          workerCount: t.workerCount,
        })),
        total,
      };
    },
  );

  router.register(
    'agent.approve',
    (params: unknown): AgentApproveResult => {
      const { taskId } = params as AgentApproveParams;
      if (!taskId) {
        throw Object.assign(new Error('taskId is required'), { code: 'INVALID_PARAMS' });
      }
      const approved = agent.approve(taskId);
      return {
        approved,
        message: approved ? '작업이 승인되었습니다' : '승인 대기 중인 작업이 없습니다',
      };
    },
  );

  router.register(
    'agent.reject',
    (params: unknown): AgentRejectResult => {
      const { taskId } = params as AgentRejectParams;
      if (!taskId) {
        throw Object.assign(new Error('taskId is required'), { code: 'INVALID_PARAMS' });
      }
      const rejected = agent.reject(taskId);
      return {
        rejected,
        message: rejected ? '작업이 거부되었습니다' : '승인 대기 중인 작업이 없습니다',
      };
    },
  );

  // ── Worker methods ───────────────────────────

  router.register(
    'workers.list',
    (): WorkersListResult => {
      const workers = workerManager.listWorkers();
      return {
        workers: workers.map(w => ({
          id: w.id,
          status: w.status as WorkersListResult['workers'][0]['status'],
          projectPath: '',  // Not exposed by current WorkerManager API
          startedAt: 0,
          outputPreview: w.outputPreview,
        })),
      };
    },
  );

  router.register(
    'workers.terminate',
    (params: unknown): WorkerTerminateResult => {
      const { workerId } = params as WorkerTerminateParams;
      if (!workerId) {
        throw Object.assign(new Error('workerId is required'), { code: 'INVALID_PARAMS' });
      }

      const terminated = workerManager.terminate(workerId);
      return {
        terminated,
        message: terminated ? `워커 ${workerId} 종료됨` : `워커 ${workerId}을(를) 찾을 수 없습니다`,
      };
    },
  );

  router.register(
    'workers.output',
    (params: unknown): WorkerOutputResult => {
      const { workerId } = params as WorkerOutputParams;
      if (!workerId) {
        throw Object.assign(new Error('workerId is required'), { code: 'INVALID_PARAMS' });
      }

      const output = workerManager.getWorkerOutput(workerId) ?? '';
      return {
        workerId,
        output,
        totalLength: output.length,
      };
    },
  );

  // ── Memory methods (K5) — delegated to registerMemoryMethods
  registerMemoryMethods(router, { memoryStore });

  // ── Session methods ──────────────────────────

  router.register(
    'sessions.list',
    (): SessionsListRpcResult => {
      const sessions = sessionManager.getAll().filter(s => s.status === 'active');
      return { sessions, availableSessions: [] };
    },
  );

  router.register(
    'sessions.discover',
    (): SessionsDiscoverResult => {
      return { sessions: [] };
    },
  );
}

/**
 * Register Memory-only RPC methods.
 *
 * Separated so codex mode (no Agent/Worker) can still expose
 * memory.search, memory.patterns, memory.stats.
 */
export function registerMemoryMethods(
  router: RpcRouter,
  deps: { memoryStore: MemoryStore },
): void {
  const { memoryStore } = deps;

  router.register(
    'memory.search',
    (params: unknown): { tasks: Array<{ id: string; command: string; result: string; success: boolean }> } => {
      const { query = '', limit = 10 } = (params || {}) as { query?: string; limit?: number };
      const tasks = memoryStore.searchTasks(query, limit);
      return {
        tasks: tasks.map(t => ({
          id: t.id,
          command: t.command,
          result: t.result,
          success: t.success,
        })),
      };
    },
  );

  router.register(
    'memory.patterns',
    (params: unknown): { patterns: Array<{ id: string; trigger: string; action: string; confidence: number }> } => {
      const { command, minConfidence = 0.3 } = (params || {}) as { command?: string; minConfidence?: number };
      const patterns = command
        ? memoryStore.findPatterns(command, minConfidence)
        : memoryStore.getPatterns();
      return {
        patterns: patterns.map(p => ({
          id: p.id,
          trigger: p.trigger,
          action: p.action,
          confidence: p.confidence,
        })),
      };
    },
  );

  router.register(
    'memory.stats',
    (): { taskCount: number; patternCount: number } => {
      return {
        taskCount: memoryStore.getTaskCount(),
        patternCount: memoryStore.getPatternCount(),
      };
    },
  );
}
