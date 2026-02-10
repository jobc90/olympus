import { EventEmitter } from 'node:events';
import { Router } from './router.js';
import { CodexSessionManager } from './session-manager.js';
import { ResponseProcessor } from './response-processor.js';
import { ContextManager } from './context-manager.js';
import { AgentBrain } from './agent-brain.js';
import type {
  UserInput,
  CodexProcessResult,
  CodexOrchestratorConfig,
  ManagedSession,
  ProjectMetadata,
  GlobalSearchResult,
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
 * - 'session:screen'  — 가공된 세션 출력 (브로드캐스트용)
 * - 'session:status'  — 세션 상태 변경
 * - 'error'           — 에러
 */
export class CodexOrchestrator extends EventEmitter {
  private router: Router;
  private sessionManager: CodexSessionManager;
  private responseProcessor: ResponseProcessor;
  private contextManager: ContextManager;
  private agentBrain: AgentBrain;
  private _initialized = false;

  constructor(private config: CodexOrchestratorConfig = {}) {
    super();
    this.contextManager = new ContextManager({
      globalDbPath: config.globalDbPath,
    });
    this.sessionManager = new CodexSessionManager({
      maxSessions: config.maxSessions ?? 5,
    });
    this.responseProcessor = new ResponseProcessor();
    this.router = new Router(this.sessionManager, this.contextManager);
    this.agentBrain = new AgentBrain(this.contextManager, this.sessionManager);

    // Wire session output → ResponseProcessor → external broadcast
    this.sessionManager.on('session:screen', async (event: {
      sessionId: string;
      content: string;
    }) => {
      try {
        const session = this.sessionManager.getSession(event.sessionId);
        if (!session) return;

        const response = this.responseProcessor.process(event.content, {
          sessionId: event.sessionId,
          projectName: session.name,
          startTime: session.lastActivity,
        });

        const enriched = await this.agentBrain.enrichResponse(response, session.projectPath);

        this.emit('session:screen', {
          sessionId: event.sessionId,
          projectName: session.name,
          response: enriched,
        });
      } catch (err) {
        this.emit('error', { sessionId: event.sessionId, error: (err as Error).message });
      }
    });

    // Forward session status events
    this.sessionManager.on('session:status', (event) => {
      this.emit('session:status', event);
    });
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * 초기화 — 프로젝트 등록 + 기존 tmux 세션 발견
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Initialize ContextManager (DB setup)
    await this.contextManager.initialize();

    // Register configured projects
    if (this.config.projects) {
      for (const project of this.config.projects) {
        await this.contextManager.registerProject(project);
      }
    }

    // Discover existing tmux sessions
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
        const results = await this.contextManager.globalSearch(input.text);
        const content = results.map(r =>
          `**${r.projectName}**: ${r.content.slice(0, 100)}`
        ).join('\n');
        return {
          decision,
          response: {
            type: 'text',
            content: content || '결과 없음',
            metadata: { projectName: 'codex', sessionId: '', duration: 0 },
            rawOutput: content,
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
   * 프로젝트 목록
   */
  async getProjects(): Promise<ProjectMetadata[]> {
    return this.contextManager.getAllProjects();
  }

  /**
   * 전역 검색
   */
  async globalSearch(query: string): Promise<GlobalSearchResult[]> {
    return this.contextManager.globalSearch(query);
  }

  /**
   * 종료
   */
  async shutdown(): Promise<void> {
    this.sessionManager.shutdown();
    this.contextManager.close();
    this._initialized = false;
  }
}
