import { EventEmitter } from 'node:events';
import { Router } from './router.js';
import { CodexSessionManager } from './session-manager.js';
import { AgentBrain } from './agent-brain.js';
import type {
  UserInput,
  CodexProcessResult,
  CodexOrchestratorConfig,
  ManagedSession,
  ProjectMetadata,
  GlobalSearchResult,
  ActiveCliTask,
  InputSource,
} from './types.js';

/**
 * CodexOrchestrator — 메인 진입점
 *
 * 생명주기:
 * 1. new CodexOrchestrator(config)
 * 2. await orchestrator.initialize()   ← 프로젝트 등록, DB 초기화
 * 3. orchestrator.processInput(input)  ← 메인 루프
 * 4. orchestrator.shutdown()           ← 정리
 *
 * Events:
 * - 'session:status'  — 세션 상태 변경
 * - 'error'           — 에러
 */
export class CodexOrchestrator extends EventEmitter {
  private router: Router;
  private sessionManager: CodexSessionManager;
  private agentBrain: AgentBrain;
  private _initialized = false;
  private activeTasks = new Map<string, ActiveCliTask>();

  constructor(private config: CodexOrchestratorConfig = {}) {
    super();
    this.sessionManager = new CodexSessionManager({
      maxSessions: config.maxSessions ?? 5,
    });
    this.router = new Router(this.sessionManager);
    this.agentBrain = new AgentBrain(this.sessionManager);

    // Forward session status events
    this.sessionManager.on('session:status', (event) => {
      this.emit('session:status', event);
    });
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * 초기화 — 프로젝트 등록
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Discover existing sessions
    await this.sessionManager.discoverExistingSessions();

    this._initialized = true;
  }

  /**
   * 메인 엔트리 — 사용자 입력 처리
   */
  async processInput(input: UserInput): Promise<CodexProcessResult> {
    const decision = await this.router.route(input);

    switch (decision.type) {
      case 'SELF_ANSWER': {
        const intent = await this.agentBrain.analyzeIntent(input.text, input.source);
        const answer = intent.answer ?? '응답을 생성할 수 없습니다.';
        return {
          decision,
          response: {
            type: 'text',
            content: answer,
            metadata: { projectName: 'codex', sessionId: '', duration: 0 },
            rawOutput: answer,
          },
        };
      }

      case 'SESSION_FORWARD': {
        const sessionId = decision.targetSessions[0];
        if (!sessionId) {
          return {
            decision,
            response: {
              type: 'error',
              content: '대상 세션을 찾을 수 없습니다.',
              metadata: { projectName: 'codex', sessionId: '', duration: 0 },
              rawOutput: '',
            },
          };
        }
        await this.sessionManager.sendToSession(sessionId, decision.processedInput);
        this.router.recordLastSession(input.source, sessionId);
        return { decision };
        // Response will come via session:screen event asynchronously
      }

      case 'MULTI_SESSION': {
        const promises = decision.targetSessions.map(sid =>
          this.sessionManager.sendToSession(sid, decision.processedInput).catch(() => false)
        );
        await Promise.allSettled(promises);
        return { decision };
      }

      case 'CONTEXT_QUERY': {
        return {
          decision,
          response: {
            type: 'text',
            content: '컨텍스트 검색은 Gateway API를 통해 제공됩니다.',
            metadata: { projectName: 'codex', sessionId: '', duration: 0 },
            rawOutput: '',
          },
        };
      }
    }
  }

  // ── External API (called by Gateway Adapter) ──

  /**
   * 세션 목록
   */
  getSessions(): ManagedSession[] {
    return this.sessionManager.listSessions();
  }

  /**
   * 세션 생성
   */
  async createSession(projectPath: string, name?: string): Promise<ManagedSession> {
    return this.sessionManager.createSession(projectPath, name);
  }

  /**
   * 세션 종료
   */
  closeSession(sessionId: string): boolean {
    return this.sessionManager.closeSession(sessionId);
  }

  /**
   * 프로젝트 목록 (deprecated — Gateway /api/local-context API 사용 권장)
   */
  async getProjects(): Promise<ProjectMetadata[]> {
    return [];
  }

  /**
   * 전역 검색 (deprecated — Gateway /api/local-context API 사용 권장)
   */
  async globalSearch(_query: string, _limit?: number): Promise<GlobalSearchResult[]> {
    return [];
  }

  // ── Task Tracking ──

  trackTask(taskId: string, sessionId: string, projectPath: string, prompt: string, source: InputSource): void {
    this.activeTasks.set(taskId, { taskId, sessionId, projectPath, prompt, source, startedAt: Date.now(), status: 'running' });
  }

  completeTask(taskId: string, success: boolean): void {
    const task = this.activeTasks.get(taskId);
    if (task) task.status = success ? 'completed' : 'failed';
  }

  getActiveTasks(): ActiveCliTask[] {
    return [...this.activeTasks.values()].filter(t => t.status === 'running');
  }

  getAllTasks(limit = 20): ActiveCliTask[] {
    return [...this.activeTasks.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }

  /**
   * 종료
   */
  async shutdown(): Promise<void> {
    this.sessionManager.shutdown();
    this._initialized = false;
  }
}
