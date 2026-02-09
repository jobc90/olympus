import { randomUUID } from 'node:crypto';
import type {
  CodexRouteResultPayload,
  CodexSessionOutputPayload,
  CodexSessionEventPayload,
  CodexStatusPayload,
  CodexSessionInfo,
  CodexProjectInfo,
  CodexSearchResult,
} from '@olympus-dev/protocol';
import type { RpcRouter } from './rpc/handler.js';

/**
 * CodexAdapter — Gateway ↔ Codex Orchestrator 어댑터
 *
 * Gateway는 기존 WS 메시지를 받아 Codex에 위임하고,
 * Codex 결과를 기존 브로드캐스트 시스템으로 전달한다.
 *
 * 핵심: Gateway는 라우팅 로직을 모른다. Codex에 위임만 한다.
 *
 * 사용법:
 *   const codex = new CodexOrchestrator(config);
 *   await codex.initialize();
 *   const adapter = new CodexAdapter(codex, broadcast);
 *   adapter.registerRpcMethods(rpcRouter);
 */
export class CodexAdapter {
  static readonly REQUEST_TIMEOUT = 30_000; // 30초

  // CodexOrchestrator interface — duck typing으로 codex 패키지 의존 회피
  private codex: CodexOrchestratorLike;

  constructor(
    codex: CodexOrchestratorLike,
    private broadcast: (eventType: string, payload: unknown) => void,
  ) {
    this.codex = codex;

    // Codex 이벤트 → Gateway 브로드캐스트
    this.codex.on('session:output', (...args: unknown[]) => {
      this.broadcast('session:output', args[0] as CodexSessionOutputPayload);
    });
    this.codex.on('session:status', (...args: unknown[]) => {
      this.broadcast('codex:session-event', args[0] as CodexSessionEventPayload);
    });
  }

  /**
   * 사용자 입력 처리 — Gateway가 호출하는 메인 엔트리
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

  /**
   * Codex 상태 조회
   */
  getStatus(): CodexStatusPayload {
    const sessions = this.codex.getSessions();
    return {
      initialized: this.codex.initialized,
      sessionCount: sessions.length,
      projectCount: 0, // Will be populated on async call
    };
  }

  /**
   * RPC 메서드 등록 — 기존 RpcRouter에 Codex 메서드 추가
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

    rpcRouter.register('codex.projects', async () => {
      const projects = await this.codex.getProjects();
      return projects.map((p): CodexProjectInfo => ({
        name: p.name,
        path: p.path,
        aliases: p.aliases,
        techStack: p.techStack,
      }));
    });

    rpcRouter.register('codex.search', async (params) => {
      const { query, limit } = params as { query: string; limit?: number };
      const results = await this.codex.globalSearch(query, limit);
      return results.map((r): CodexSearchResult => ({
        projectName: r.projectName,
        projectPath: r.projectPath,
        matchType: r.matchType,
        content: r.content,
        score: r.score,
        timestamp: r.timestamp,
      }));
    });

    rpcRouter.register('codex.status', async () => {
      const sessions = this.codex.getSessions();
      const projects = await this.codex.getProjects();
      return {
        initialized: this.codex.initialized,
        sessionCount: sessions.length,
        projectCount: projects.length,
      } satisfies CodexStatusPayload;
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
  getProjects(): Promise<Array<{
    name: string;
    path: string;
    aliases: string[];
    techStack: string[];
  }>>;
  globalSearch(query: string, limit?: number): Promise<Array<{
    projectName: string;
    projectPath: string;
    matchType: 'task' | 'pattern' | 'context' | 'instruction';
    content: string;
    score: number;
    timestamp: number;
  }>>;
  shutdown(): Promise<void>;
}
