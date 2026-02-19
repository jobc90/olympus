import type { CodexSessionManager } from './session-manager.js';
import type {
  InputSource,
  Intent,
} from './types.js';

/**
 * AgentBrain — AI Agent decision engine
 *
 * Regex + keyword based (no LLM API calls, zero latency)
 *
 * Decision priority:
 * 1. Session management commands (/sessions, /use, /close, /new)
 * 2. Work history queries
 * 3. Project status queries
 * 4. Cross-project queries
 * 5. Default: forward to Claude + context enrichment
 */
export class AgentBrain {
  constructor(
    private sessionManager: CodexSessionManager,
  ) {}

  /**
   * Analyze input — determine intent
   */
  async analyzeIntent(
    input: string,
    source: InputSource,
    currentSessionId?: string,
  ): Promise<Intent> {
    // 1. Session management commands
    const sessionCmd = this.parseSessionCommand(input);
    if (sessionCmd) return sessionCmd;

    // 2. Work history query
    if (this.isHistoryQuery(input)) {
      const answer = '작업 이력은 Gateway API를 통해 제공됩니다.';
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.85 };
    }

    // 3. Project status
    if (this.isStatusQuery(input)) {
      const answer = await this.generateStatusReport();
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.9 };
    }

    // 4. Cross-project query
    if (this.isCrossProjectQuery(input)) {
      const answer = '크로스 프로젝트 검색은 Gateway API를 통해 제공됩니다.';
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.7 };
    }

    // 5. Default: forward to Claude
    return {
      type: 'FORWARD_TO_CLAUDE',
      sessionId: currentSessionId,
      enrichedInput: input,
      confidence: 0.5,
    };
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

}
