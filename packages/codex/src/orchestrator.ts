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
 * CodexOrchestrator — Main entry point
 *
 * Lifecycle:
 * 1. new CodexOrchestrator(config)
 * 2. await orchestrator.initialize()   ← Register projects, init DB
 * 3. orchestrator.processInput(input)  ← Main loop
 * 4. orchestrator.shutdown()           ← Cleanup
 *
 * Events:
 * - 'session:status'  — Session status change
 * - 'error'           — Error
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

    // Forward session status events to gateway
    this.sessionManager.on('session:status', (event) => {
      this.emit('session:status', event);
    });
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize — register projects
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Discover existing sessions
    await this.sessionManager.discoverExistingSessions();

    this._initialized = true;
  }

  /**
   * Main entry — process user input
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
   * List sessions
   */
  getSessions(): ManagedSession[] {
    return this.sessionManager.listSessions();
  }

  /**
   * Create session
   */
  async createSession(projectPath: string, name?: string): Promise<ManagedSession> {
    return this.sessionManager.createSession(projectPath, name);
  }

  /**
   * Close session
   */
  closeSession(sessionId: string): boolean {
    return this.sessionManager.closeSession(sessionId);
  }

  /**
   * List projects (deprecated — use Gateway /api/local-context API)
   */
  async getProjects(): Promise<ProjectMetadata[]> {
    return [];
  }

  /**
   * Global search (deprecated — use Gateway /api/local-context API)
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
   * Shutdown
   */
  async shutdown(): Promise<void> {
    this.sessionManager.shutdown();
    this._initialized = false;
  }
}
