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
 * 2. Project status queries
 * 3. Default: forward to Claude + context enrichment
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

    // 2. Project status
    if (this.isStatusQuery(input)) {
      const answer = await this.generateStatusReport();
      return { type: 'ANSWER_FROM_CONTEXT', answer, confidence: 0.9 };
    }

    // 3. Default: forward to Claude
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

  private isStatusQuery(input: string): boolean {
    return /(?:진행|현황|상태|뭐.*하고|status|progress|what.*working)/i.test(input);
  }


  async generateStatusReport(workerSnapshot?: Array<{ name: string; status: string; currentTaskPrompt?: string }>): Promise<string> {
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

    if (workerSnapshot && workerSnapshot.length > 0) {
      lines.push('\n👷 워커 현황:\n');
      for (const worker of workerSnapshot) {
        const icon = statusIcons[worker.status] ?? '❓';
        lines.push(`${icon} **${worker.name}** — ${worker.status}`);
        if (worker.currentTaskPrompt) {
          lines.push(`  └ ${worker.currentTaskPrompt}`);
        }
      }
    }

    return lines.join('\n');
  }

}
