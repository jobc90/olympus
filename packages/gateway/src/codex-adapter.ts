import { randomUUID } from 'node:crypto';
import type {
  CodexRouteResultPayload,
  CodexSessionOutputPayload,
  CodexSessionEventPayload,
  CodexStatusPayload,
  CodexSessionInfo,
  CodexSearchResult,
} from '@olympus-dev/protocol';
import type { RpcRouter } from './rpc/handler.js';
import type { LocalContextStoreManager, TaskAuthorityStore } from '@olympus-dev/core';
import type { GeminiAdvisor } from './gemini-advisor.js';
import type { WorkerRegistry } from './worker-registry.js';
import type { ProjectRuntimeAdapter } from './project-runtime/project-runtime-adapter.js';
import type { TaskSummaryService } from './reporting/task-summary-service.js';

export interface CodexManualInputInterpretationPayload {
  workerId: string;
  workerName: string;
  projectId: string;
  projectPath: string;
  prompt: string;
  source: string;
  timestamp: number;
  classification: 'task_intervention' | 'new_task_candidate';
  reason: string;
  workerStatus?: 'idle' | 'busy' | 'offline';
  currentTaskId?: string;
  currentAuthorityTaskId?: string;
  currentTaskPrompt?: string;
  matchedSessionId?: string;
}

export interface CodexMentionDelegationResult {
  httpStatus: number;
  body:
    | {
        type: 'delegation';
        taskId: string | null;
        authorityTaskId: string;
        response: string;
      }
    | {
        type: 'chat' | 'error';
        response?: string;
        error?: string;
      };
}

/**
 * CodexAdapter — Gateway ↔ Codex Orchestrator adapter
 *
 * Gateway receives WS messages, delegates to Codex,
 * and forwards Codex results through the broadcast system.
 *
 * Key: Gateway knows no routing logic. It only delegates to Codex.
 *
 * Usage:
 *   const codex = new CodexOrchestrator(config);
 *   await codex.initialize();
 *   const adapter = new CodexAdapter(codex, broadcast);
 *   adapter.registerRpcMethods(rpcRouter);
 */
export class CodexAdapter {
  // CodexOrchestrator interface — duck typing to avoid codex package dependency
  private codex: CodexOrchestratorLike;

  private localContextManager: LocalContextStoreManager | null;
  private geminiAdvisor: GeminiAdvisor | null;
  private workerRegistry: WorkerRegistry | null;
  private projectRuntimeAdapter: Pick<ProjectRuntimeAdapter, 'dispatchTask'> | null;
  private taskAuthorityStore: Pick<TaskAuthorityStore, 'listTasks'> | null;
  private taskSummaryService: TaskSummaryService | null;
  private workspaceRoot: string;

  constructor(
    codex: CodexOrchestratorLike,
    private broadcast: (eventType: string, payload: unknown) => void,
    localContextManager?: LocalContextStoreManager,
    geminiAdvisor?: GeminiAdvisor,
  ) {
    this.codex = codex;
    this.localContextManager = localContextManager ?? null;
    this.geminiAdvisor = geminiAdvisor ?? null;
    this.workerRegistry = null;
    this.projectRuntimeAdapter = null;
    this.taskAuthorityStore = null;
    this.taskSummaryService = null;
    this.workspaceRoot = process.cwd();

    // Codex events → Gateway broadcast
    this.codex.on('session:screen', (...args: unknown[]) => {
      this.broadcast('session:screen', args[0] as CodexSessionOutputPayload);
    });
    this.codex.on('session:status', (...args: unknown[]) => {
      this.broadcast('codex:session-event', args[0] as CodexSessionEventPayload);
    });

    // session:execute — delegate CLI execution request to runCli
    this.codex.on('session:execute', async (...args: unknown[]) => {
      const event = args[0] as { sessionId: string; input: string; projectPath: string };
      const { runCli } = await import('./cli-runner.js');
      const taskId = randomUUID().slice(0, 8);

      this.codex.trackTask(taskId, event.sessionId, event.projectPath, event.input, 'dashboard');

      runCli({
        prompt: event.input,
        provider: 'claude',
        workspaceDir: event.projectPath,
        dangerouslySkipPermissions: true,
        onStream: (chunk: string) => this.broadcast('cli:stream', {
          sessionKey: `codex:${event.sessionId}`,
          chunk,
          timestamp: Date.now(),
        }),
      }).then((result) => {
        this.codex.completeTask(taskId, result.success);
        this.broadcast('codex:task-complete', { taskId, sessionId: event.sessionId, result });
      }).catch(() => {
        this.codex.completeTask(taskId, false);
      });
    });
  }

  /**
   * Replace broadcast function — inject actual broadcastToAll from Gateway
   */
  setBroadcast(broadcast: (eventType: string, payload: unknown) => void): void {
    this.broadcast = broadcast;
  }

  /**
   * Set LocalContextManager — injected after Gateway initialization
   */
  setLocalContextManager(manager: LocalContextStoreManager): void {
    this.localContextManager = manager;
  }

  /**
   * Set GeminiAdvisor — injected after Gateway initialization
   */
  setGeminiAdvisor(advisor: GeminiAdvisor): void {
    this.geminiAdvisor = advisor;
  }

  /**
   * Set WorkerRegistry — injected after Gateway initialization
   */
  setWorkerRegistry(registry: WorkerRegistry): void {
    this.workerRegistry = registry;
  }

  setProjectRuntimeAdapter(adapter: Pick<ProjectRuntimeAdapter, 'dispatchTask'>): void {
    this.projectRuntimeAdapter = adapter;
  }

  setTaskReportingContext(
    taskAuthorityStore: Pick<TaskAuthorityStore, 'listTasks'>,
    taskSummaryService: TaskSummaryService,
  ): void {
    this.taskAuthorityStore = taskAuthorityStore;
    this.taskSummaryService = taskSummaryService;
  }

  /**
   * Set workspace root used for root-level context queries.
   */
  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Handle user input — main entry called by Gateway
   */
  async handleInput(input: {
    text: string;
    source: string;
    timestamp?: number;
    chatId?: number;
    clientId?: string;
  }): Promise<CodexRouteResultPayload> {
    const requestId = randomUUID().slice(0, 12);

    const result = await this.codex.processInput({
      text: input.text,
      source: input.source as 'telegram' | 'dashboard' | 'cli',
      timestamp: input.timestamp ?? Date.now(),
    });

    return {
      requestId,
      decision: result.decision as CodexRouteResultPayload['decision'],
      response: result.response as CodexRouteResultPayload['response'],
    };
  }

  interpretManualInput(input: {
    workerId: string;
    workerName: string;
    projectId: string;
    projectPath: string;
    prompt: string;
    source: string;
    timestamp: number;
  }): CodexManualInputInterpretationPayload {
    const worker = this.workerRegistry?.getAll().find(item => item.id === input.workerId);
    const interpreted = this.codex.interpretManualInput({
      ...input,
      workerStatus: worker?.status ?? 'offline',
      currentTaskId: worker?.currentTaskId,
      currentAuthorityTaskId: worker?.currentAuthorityTaskId,
      currentTaskPrompt: worker?.currentTaskPrompt,
    });

    this.broadcast('codex:manual-input-interpreted', interpreted);
    return interpreted;
  }

  async tryDelegateMention(input: {
    message: string;
    source: string;
    chatId?: number;
  }): Promise<CodexMentionDelegationResult | null> {
    const mentionMatch = input.message.match(/^@(\S+)\s+([\s\S]+)/);
    if (!mentionMatch) return null;

    if (!this.workerRegistry) {
      return {
        httpStatus: 503,
        body: { type: 'error', error: 'Worker registry not available' },
      };
    }

    const [, workerName, taskPrompt] = mentionMatch;
    const worker = this.workerRegistry.getAll().find(item => item.name === workerName);

    if (!worker) {
      return {
        httpStatus: 200,
        body: {
          type: 'error',
          response: `❌ 워커 "${workerName}"을(를) 찾을 수 없습니다. /workers 명령으로 등록된 워커를 확인하세요.`,
        },
      };
    }

    if (worker.status === 'busy') {
      return {
        httpStatus: 200,
        body: {
          type: 'chat',
          response: `⏳ ${worker.name}은(는) 현재 작업 중입니다. 잠시 후 다시 시도해 주세요.`,
        },
      };
    }

    if (worker.status === 'offline') {
      return {
        httpStatus: 200,
        body: {
          type: 'error',
          response: `⚠️ ${worker.name}은(는) 현재 오프라인입니다. 워커를 재시작해 주세요.`,
        },
      };
    }

    if (!this.projectRuntimeAdapter) {
      return {
        httpStatus: 503,
        body: { type: 'error', error: 'Project runtime adapter not available' },
      };
    }

    const trimmedPrompt = taskPrompt.trim();
    const dispatched = await this.projectRuntimeAdapter.dispatchTask({
      projectId: this.resolveProjectIdForWorker(worker),
      prompt: trimmedPrompt,
      projectPath: worker.projectPath,
      title: trimmedPrompt.slice(0, 120),
      chatId: input.chatId,
      source: input.source,
      provider: 'claude',
      dangerouslySkipPermissions: true,
      preferredWorkerId: worker.id,
    });

    return {
      httpStatus: 200,
      body: {
        type: 'delegation',
        taskId: dispatched.workerTask?.taskId ?? null,
        authorityTaskId: dispatched.task.id,
        response: `✅ ${worker.name}에게 작업을 전달했습니다: "${trimmedPrompt.slice(0, 50)}..."`,
      },
    };
  }

  /**
   * Get Codex status (sync — projectCount from cache or 0)
   */
  getStatus(): CodexStatusPayload {
    const sessions = this.codex.getSessions();
    return {
      initialized: this.codex.initialized,
      sessionCount: sessions.length,
      projectCount: this.cachedProjectCount,
    };
  }

  /**
   * Get full Codex status with async project count + worker snapshot
   */
  async getFullStatus(): Promise<CodexStatusPayload & {
    workers?: Array<{ id: string; name: string; status: string; projectPath: string }>;
    projectSummaries?: Array<{ projectId: string; summary: string; counts: { blocked: number; failed: number; risky: number; completed: number; total: number } }>;
  }> {
    const sessions = this.codex.getSessions();
    let projectCount = 0;
    try {
      const rootStore = await this.localContextManager?.getRootStore(this.workspaceRoot);
      projectCount = rootStore?.getAllProjects()?.length ?? 0;
      this.cachedProjectCount = projectCount;
    } catch { /* fallback to 0 */ }

    const result: CodexStatusPayload & {
      workers?: Array<{ id: string; name: string; status: string; projectPath: string }>;
      projectSummaries?: Array<{ projectId: string; summary: string; counts: { blocked: number; failed: number; risky: number; completed: number; total: number } }>;
    } = {
      initialized: this.codex.initialized,
      sessionCount: sessions.length,
      projectCount,
    };

    if (this.workerRegistry) {
      result.workers = this.workerRegistry.getAll().map(w => ({
        id: w.id,
        name: w.name,
        status: w.status,
        projectPath: w.projectPath,
      }));
    }

    if (this.taskAuthorityStore && this.taskSummaryService && this.workerRegistry) {
      result.projectSummaries = this.taskSummaryService.buildProjectSummaries({
        authorityTasks: this.taskAuthorityStore.listTasks(),
        workerTaskRecords: this.workerRegistry.getAllTaskRecords(),
      }).map((summary) => ({
        projectId: summary.projectId,
        summary: summary.summary,
        counts: summary.counts,
      }));
    }

    return result;
  }

  private cachedProjectCount = 0;

  private resolveProjectIdForWorker(worker: { name: string; projectPath: string }): string {
    const segments = worker.projectPath.split(/[\\/]/).filter(Boolean);
    return segments.at(-1) ?? worker.name;
  }

  /**
   * Shutdown the underlying Codex Orchestrator and release resources.
   */
  async shutdown(): Promise<void> {
    await this.codex.shutdown();
  }

  /**
   * Register RPC methods — add Codex methods to RpcRouter
   */
  registerRpcMethods(rpcRouter: RpcRouter): void {
    rpcRouter.register('codex.route', async (params) => {
      const { text, source } = params as { text: string; source: string };
      return this.handleInput({ text, source });
    });

    rpcRouter.register('codex.sessions', async () => {
      const sessions = this.codex.getSessions();
      return sessions.map((s): CodexSessionInfo => ({
        id: s.id,
        name: s.name,
        projectPath: s.projectPath,
        status: s.status,
        lastActivity: s.lastActivity,
      }));
    });

    rpcRouter.register('codex.search', async (params) => {
      const { query, limit } = params as { query: string; limit?: number };

      // Use localContextManager if available, fallback to (deprecated) codex.globalSearch
      if (this.localContextManager) {
        try {
          const rootStore = await this.localContextManager.getRootStore(this.workspaceRoot);
          const projects = rootStore.getAllProjects();
          const queryLower = query.toLowerCase();
          const matched = projects
            .filter(p =>
              p.projectName.toLowerCase().includes(queryLower) ||
              p.summary.toLowerCase().includes(queryLower) ||
              p.knownIssues.some(i => i.toLowerCase().includes(queryLower)),
            )
            .slice(0, limit ?? 20);

          return matched.map((p): CodexSearchResult => ({
            projectName: p.projectName,
            projectPath: p.projectPath,
            matchType: 'context',
            content: p.summary.slice(0, 200),
            score: 1,
            timestamp: new Date(p.updatedAt).getTime(),
          }));
        } catch { /* fallback below */ }
      }

      return [];
    });

    rpcRouter.register('codex.status', async () => {
      return this.getFullStatus();
    });

    rpcRouter.register('codex.activeTasks', async () => {
      return this.codex.getActiveTasks();
    });

    // Gemini Advisor RPC
    rpcRouter.register('gemini.status', async () => {
      return this.geminiAdvisor?.getStatus() ?? { running: false, behavior: 'offline' };
    });

    rpcRouter.register('gemini.projects', async () => {
      return this.geminiAdvisor?.getAllCachedAnalyses() ?? [];
    });
  }
}

/**
 * Duck-typed interface for CodexOrchestrator.
 * Avoids direct dependency on @olympus-dev/codex in gateway package.
 */
export interface CodexOrchestratorLike {
  initialized: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  processInput(input: {
    text: string;
    source: 'telegram' | 'dashboard' | 'cli';
    timestamp: number;
  }): Promise<{
    decision: {
      type: string;
      targetSessions: string[];
      processedInput: string;
      confidence: number;
      reason: string;
      planning?: {
        kind: string;
        targetSessionIds: string[];
        targetProjectNames: string[];
        processedInput: string;
        manualPath: boolean;
        confidence: number;
        reason: string;
      };
    };
    response?: {
      type: string;
      content: string;
      metadata: { projectName: string; sessionId: string; duration: number; filesChanged?: string[] };
      rawOutput: string;
      agentInsight?: string;
    };
  }>;
  getSessions(): Array<{
    id: string;
    name: string;
    projectPath: string;
    status: string;
    lastActivity: number;
  }>;
  shutdown(): Promise<void>;
  trackTask(taskId: string, sessionId: string, projectPath: string, prompt: string, source: string): void;
  completeTask(taskId: string, success: boolean): void;
  getActiveTasks(): Array<{
    taskId: string;
    sessionId: string;
    projectPath: string;
    prompt: string;
    source: string;
    startedAt: number;
    status: 'running' | 'completed' | 'failed';
  }>;
  interpretManualInput(input: {
    workerId: string;
    workerName: string;
    projectId: string;
    projectPath: string;
    prompt: string;
    source: string;
    timestamp: number;
    workerStatus?: 'idle' | 'busy' | 'offline';
    currentTaskId?: string;
    currentAuthorityTaskId?: string;
    currentTaskPrompt?: string;
  }): CodexManualInputInterpretationPayload;
}
