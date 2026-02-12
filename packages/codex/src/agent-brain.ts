import type { CodexSessionManager } from './session-manager.js';
import type {
  InputSource,
  Intent,
  ProcessedResponse,
} from './types.js';

/**
 * AgentBrain — AI Agent 판단 엔진
 *
 * 정규식 + 키워드 기반 (LLM API 호출 없음, 레이턴시 0)
 *
 * 판단 우선순위:
 * 1. 세션 관리 명령 (/sessions, /use, /close, /new)
 * 2. 작업 이력 질의 ("어제 뭐 했지?")
 * 3. 프로젝트 현황 질의 ("진행 상황")
 * 4. 크로스 프로젝트 질의 ("두 프로젝트 비교")
 * 5. 기본: Claude에 전달 + 컨텍스트 인리치먼트
 */
export class AgentBrain {
  constructor(
    private sessionManager: CodexSessionManager,
  ) {}

  /**
   * 입력 분석 — 의도 판별
   */
  async analyzeIntent(
    input: string,
    source: InputSource,
    currentSessionId?: string,
  ): Promise<Intent> {
    // 1. 세션 관리 명령
    const sessionCmd = this.parseSessionCommand(input);
    if (sessionCmd) return sessionCmd;

    // 2. 작업 이력 질의
    if (this.isHistoryQuery(input)) {
      const answer = await this.answerHistoryQuery(input);
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.85 };
    }

    // 3. 프로젝트 현황
    if (this.isStatusQuery(input)) {
      const answer = await this.generateStatusReport();
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.9 };
    }

    // 4. 크로스 프로젝트
    if (this.isCrossProjectQuery(input)) {
      const answer = await this.crossProjectReasoning(input);
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.7 };
    }

    // 5. 기본: Claude에 전달
    return {
      type: 'FORWARD_TO_CLAUDE',
      sessionId: currentSessionId,
      enrichedInput: await this.enrichInput(input, currentSessionId),
      confidence: 0.5,
    };
  }

  /**
   * 응답 인리치먼트 — Claude 응답에 Codex 인사이트 추가
   */
  async enrichResponse(
    response: ProcessedResponse,
    _projectPath: string,
  ): Promise<ProcessedResponse> {
    // Context enrichment disabled — ContextManager removed
    // Gateway /api/local-context API provides context
    return response;
  }

  // ── Pattern matching ──

  private parseSessionCommand(input: string): Intent | null {
    if (/^\/(sessions?|세션)\s*$/i.test(input)) {
      return { type: 'SESSION_MANAGEMENT', action: 'list', confidence: 1.0 };
    }
    const useMatch = input.match(/^\/use\s+(\S+)/i);
    if (useMatch) {
      return { type: 'SESSION_MANAGEMENT', action: 'switch', sessionId: useMatch[1], confidence: 1.0 };
    }
    if (/^\/close/i.test(input)) {
      return { type: 'SESSION_MANAGEMENT', action: 'close', confidence: 1.0 };
    }
    const newMatch = input.match(/^\/new\s+(.+)/i);
    if (newMatch) {
      return { type: 'SESSION_MANAGEMENT', action: 'create', enrichedInput: newMatch[1], confidence: 1.0 };
    }
    return null;
  }

  private isHistoryQuery(input: string): boolean {
    const patterns = [
      /(?:어제|오늘|최근|이전에?).*(?:뭐\s*했|작업|히스토리|이력)/,
      /(?:what|recent|history|yesterday).*(?:did|work|task)/i,
    ];
    return patterns.some(p => p.test(input));
  }

  private isStatusQuery(input: string): boolean {
    return /(?:진행|현황|상태|뭐.*하고|status|progress|what.*working)/i.test(input);
  }

  private isCrossProjectQuery(input: string): boolean {
    return /(?:두.*프로젝트|양쪽|비교|호환|cross.*project|compare)/i.test(input);
  }

  /**
   * 입력 인리치먼트 — Claude 전달 전 컨텍스트 주입
   */
  private async enrichInput(input: string, _sessionId?: string): Promise<string> {
    return input;
  }

  private async answerHistoryQuery(_query: string): Promise<string> {
    return '작업 이력은 Gateway API를 통해 제공됩니다.';
  }

  private async generateStatusReport(): Promise<string> {
    const sessions = this.sessionManager.listSessions();
    const lines: string[] = ['📊 프로젝트 현황:\n'];

    const statusIcons: Record<string, string> = {
      starting: '🔄', ready: '🟢', busy: '🟡',
      idle: '⚪', error: '🔴', closed: '⚫',
    };

    for (const session of sessions) {
      lines.push(`${statusIcons[session.status] ?? '❓'} **${session.name}** — ${session.status}`);
      if (session.currentTask) {
        lines.push(`  └ ${session.currentTask}`);
      }
    }

    if (sessions.length === 0) {
      lines.push('활성 세션 없음. `/new {프로젝트경로}`로 생성하세요.');
    }

    return lines.join('\n');
  }

  private async crossProjectReasoning(_question: string): Promise<string> {
    return '크로스 프로젝트 검색은 Gateway API를 통해 제공됩니다.';
  }
}
