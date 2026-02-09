import type { CodexSessionManager } from './session-manager.js';
import type { ContextManager } from './context-manager.js';
import type {
  InputSource,
  IntentType,
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
    private contextManager: ContextManager,
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
    projectPath: string,
  ): Promise<ProcessedResponse> {
    const context = await this.contextManager.getProjectContext(projectPath);
    const insights: string[] = [];

    // Similar previous tasks
    const similarTasks = context.recentTasks
      .filter(t => this.isSimilarContent(t.command, response.content))
      .slice(0, 2);

    if (similarTasks.length > 0) {
      const last = similarTasks[0];
      if (last.success) {
        insights.push(`이전에 비슷한 작업 성공 (${this.timeAgo(last.timestamp)})`);
      } else {
        insights.push(`⚠️ 이전에 비슷한 작업 실패 경험 있음`);
      }
    }

    // Failure pattern warnings
    const failPatterns = context.learningPatterns
      .filter(p => p.trigger && response.content.includes(p.trigger))
      .slice(0, 1);

    if (failPatterns.length > 0) {
      insights.push(`⚠️ 알려진 패턴: ${failPatterns[0].action}`);
    }

    // Next step suggestions
    if (response.type === 'build') {
      insights.push('💡 빌드 완료 — 테스트 실행 권장');
    } else if (response.type === 'error') {
      insights.push('💡 에러 발생 — 로그 확인 후 수정 필요');
    }

    if (insights.length > 0) {
      response.agentInsight = insights.join(' | ');
    }

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
  private async enrichInput(input: string, sessionId?: string): Promise<string> {
    if (!sessionId) return input;

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return input;

    const context = await this.contextManager.getProjectContext(session.projectPath);
    if (!context.recentTasks.length && !context.learningPatterns.length) return input;

    const parts = [input, '', '[Codex Context]'];

    parts.push(`- 프로젝트: ${context.name} (${context.path})`);

    if (context.techStack.length > 0) {
      parts.push(`- 기술 스택: ${context.techStack.join(', ')}`);
    }
    if (context.recentTasks.length > 0) {
      const last = context.recentTasks[0];
      parts.push(`- 최근 작업: ${last.command} (${last.success ? '성공' : '실패'})`);
    }

    return parts.join('\n');
  }

  private async answerHistoryQuery(_query: string): Promise<string> {
    const projects = await this.contextManager.getAllProjects();
    const lines: string[] = ['📋 최근 작업 이력:\n'];

    for (const project of projects) {
      const ctx = await this.contextManager.getProjectContext(project.path);
      if (ctx.recentTasks.length === 0) continue;

      lines.push(`**${project.name}**:`);
      for (const task of ctx.recentTasks.slice(0, 3)) {
        const icon = task.success ? '✅' : '❌';
        lines.push(`  ${icon} ${task.command.slice(0, 80)} (${this.timeAgo(task.timestamp)})`);
      }
      lines.push('');
    }

    if (lines.length === 1) {
      lines.push('작업 이력이 없습니다.');
    }

    return lines.join('\n');
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

  private async crossProjectReasoning(question: string): Promise<string> {
    const results = await this.contextManager.globalSearch(question, 10);
    if (results.length === 0) return '관련 정보를 찾을 수 없습니다.';

    const lines: string[] = ['🔍 크로스 프로젝트 검색 결과:\n'];
    for (const r of results.slice(0, 5)) {
      lines.push(`**${r.projectName}** (${r.matchType}): ${r.content.slice(0, 100)}`);
    }
    return lines.join('\n');
  }

  private timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return '방금';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
    return `${Math.floor(diff / 86400_000)}일 전`;
  }

  private isSimilarContent(cmd: string, content: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z가-힣0-9]/g, '');
    const normalized = normalize(cmd);
    if (normalized.length < 5) return false;
    return normalize(content).includes(normalized.slice(0, 15));
  }
}
