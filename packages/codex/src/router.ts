import type { CodexSessionManager } from './session-manager.js';
import type { ContextManager } from './context-manager.js';
import type {
  UserInput,
  RoutingDecision,
  InputSource,
  ManagedSession,
  ProjectContext,
} from './types.js';

/**
 * Router — 사용자 입력을 분석하여 적절한 세션/행동으로 라우팅
 *
 * 5단계 우선순위:
 * 1. 명시적 세션 지정: `@projectA 빌드해줘` → SESSION_FORWARD
 * 2. 전체 프로젝트 질의: `모든 프로젝트 현황` → SELF_ANSWER
 * 3. 다중 세션 명령: `모든 프로젝트 빌드` → MULTI_SESSION
 * 4. 프로젝트 키워드 매칭: `console API 수정` → SESSION_FORWARD
 * 5. 기본: 최근 활성 세션 → SESSION_FORWARD
 */
export class Router {
  private projectAliases: Map<string, string> = new Map();
  private lastActiveSession: Map<string, string> = new Map();

  constructor(
    private sessionManager: CodexSessionManager,
    private contextManager: ContextManager,
  ) {}

  /**
   * 라우팅 판단
   */
  async route(input: UserInput): Promise<RoutingDecision> {
    // Step 1: @mention 파싱
    const mentionMatch = input.text.match(/^@(\S+)\s+(.+)/s);
    if (mentionMatch) {
      const [, target, command] = mentionMatch;
      const session = this.resolveSessionByName(target);
      if (session) {
        return {
          type: 'SESSION_FORWARD',
          targetSessions: [session.id],
          processedInput: command,
          confidence: 1.0,
          reason: `명시적 @${target} 지정`,
        };
      }
    }

    // Step 2: 다중 세션 명령 (global query보다 먼저 체크 — "모든 프로젝트 빌드" 등)
    if (this.isMultiSessionCommand(input.text)) {
      const allSessions = this.sessionManager.listSessions()
        .filter(s => s.status === 'ready' || s.status === 'idle');
      return {
        type: 'MULTI_SESSION',
        targetSessions: allSessions.map(s => s.id),
        processedInput: this.extractCommand(input.text),
        confidence: 0.85,
        reason: '다중 세션 명령 감지',
      };
    }

    // Step 3: 전체 프로젝트 질의
    if (this.isGlobalQuery(input.text)) {
      return {
        type: 'SELF_ANSWER',
        targetSessions: [],
        processedInput: input.text,
        confidence: 0.9,
        reason: '전체 프로젝트 질의 패턴 감지',
      };
    }

    // Step 4: 프로젝트 키워드 매칭
    const keywordMatch = await this.matchProjectKeyword(input.text);
    if (keywordMatch) {
      return {
        type: 'SESSION_FORWARD',
        targetSessions: [keywordMatch.sessionId],
        processedInput: input.text,
        contextToInject: keywordMatch.context,
        confidence: keywordMatch.confidence,
        reason: `키워드 "${keywordMatch.keyword}" → ${keywordMatch.projectName}`,
      };
    }

    // Step 5: 최근 활성 세션
    const lastSession = this.lastActiveSession.get(input.source);
    if (lastSession && this.sessionManager.getSession(lastSession)) {
      return {
        type: 'SESSION_FORWARD',
        targetSessions: [lastSession],
        processedInput: input.text,
        confidence: 0.5,
        reason: '최근 활성 세션 (기본)',
      };
    }

    // 세션 없음 → 자체 답변
    return {
      type: 'SELF_ANSWER',
      targetSessions: [],
      processedInput: input.text,
      confidence: 0.3,
      reason: '활성 세션 없음 — 자체 답변',
    };
  }

  /**
   * 라우팅 후 최근 세션 기록
   */
  recordLastSession(source: InputSource, sessionId: string): void {
    this.lastActiveSession.set(source, sessionId);
  }

  /**
   * 프로젝트 별명 등록
   */
  registerAlias(alias: string, sessionId: string): void {
    this.projectAliases.set(alias.toLowerCase(), sessionId);
  }

  // ── Pattern matchers ──

  private isGlobalQuery(text: string): boolean {
    const patterns = [
      /전체.*알려/,
      /모든.*프로젝트.*(?!빌드|테스트|린트)/,
      /지금.*뭐.*하/,
      /현황.*보고/,
      /진행.*상황/,
      /all\s+projects?\s+status/i,
      /what.*working\s+on/i,
      /status\s+report/i,
    ];
    return patterns.some(p => p.test(text));
  }

  private isMultiSessionCommand(text: string): boolean {
    const patterns = [
      /모든\s*프로젝트\s*(빌드|테스트|린트)/,
      /전부\s*(빌드|테스트)/,
      /all\s+projects?\s+(build|test|lint)/i,
    ];
    return patterns.some(p => p.test(text));
  }

  private async matchProjectKeyword(text: string): Promise<{
    sessionId: string;
    projectName: string;
    keyword: string;
    confidence: number;
    context?: ProjectContext;
  } | null> {
    const sessions = this.sessionManager.listSessions();
    const projects = await this.contextManager.getAllProjects();

    for (const project of projects) {
      const keywords = [project.name, ...(project.aliases ?? [])];
      for (const kw of keywords) {
        if (text.toLowerCase().includes(kw.toLowerCase())) {
          const session = sessions.find(s => s.projectPath === project.path);
          if (session) {
            const context = await this.contextManager.getProjectContext(project.path);
            return {
              sessionId: session.id,
              projectName: project.name,
              keyword: kw,
              confidence: 0.8,
              context,
            };
          }
        }
      }
    }
    return null;
  }

  private resolveSessionByName(name: string): ManagedSession | undefined {
    // 1. Check alias
    const aliasId = this.projectAliases.get(name.toLowerCase());
    if (aliasId) {
      return this.sessionManager.getSession(aliasId);
    }
    // 2. Search by session name
    return this.sessionManager.findByName(name);
  }

  private extractCommand(text: string): string {
    return text
      .replace(/모든\s*프로젝트\s*/g, '')
      .replace(/전부\s*/g, '')
      .replace(/all\s+projects?\s*/gi, '')
      .trim();
  }
}
