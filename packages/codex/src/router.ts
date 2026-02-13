import type { CodexSessionManager } from './session-manager.js';
import type {
  UserInput,
  RoutingDecision,
  InputSource,
  ManagedSession,
} from './types.js';

/**
 * Router — Analyzes user input and routes to appropriate session/action
 *
 * 5-level priority:
 * 1. Explicit session mention: `@projectA build` → SESSION_FORWARD
 * 2. Global project query: `all projects status` → SELF_ANSWER
 * 3. Multi-session command: `all projects build` → MULTI_SESSION
 * 4. Project keyword matching: `console API fix` → SESSION_FORWARD
 * 5. Default: most recent active session → SESSION_FORWARD
 */
export class Router {
  private projectAliases: Map<string, string> = new Map();
  private lastActiveSession: Map<string, string> = new Map();

  constructor(
    private sessionManager: CodexSessionManager,
  ) {}

  /**
   * Make routing decision
   */
  async route(input: UserInput): Promise<RoutingDecision> {
    // Step 1: Parse @mention
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
          reason: `Explicit @${target} mention`,
        };
      }
    }

    // Step 2: Multi-session command (check before global query)
    if (this.isMultiSessionCommand(input.text)) {
      const allSessions = this.sessionManager.listSessions()
        .filter(s => s.status === 'ready' || s.status === 'idle');
      return {
        type: 'MULTI_SESSION',
        targetSessions: allSessions.map(s => s.id),
        processedInput: this.extractCommand(input.text),
        confidence: 0.85,
        reason: 'Multi-session command detected',
      };
    }

    // Step 3: Global project query
    if (this.isGlobalQuery(input.text)) {
      return {
        type: 'SELF_ANSWER',
        targetSessions: [],
        processedInput: input.text,
        confidence: 0.9,
        reason: 'Global project query pattern detected',
      };
    }

    // Step 4: Project keyword matching
    const keywordMatch = await this.matchProjectKeyword(input.text);
    if (keywordMatch) {
      return {
        type: 'SESSION_FORWARD',
        targetSessions: [keywordMatch.sessionId],
        processedInput: input.text,
        confidence: keywordMatch.confidence,
        reason: `Keyword "${keywordMatch.keyword}" → ${keywordMatch.projectName}`,
      };
    }

    // Step 5: Most recent active session
    const lastSession = this.lastActiveSession.get(input.source);
    if (lastSession && this.sessionManager.getSession(lastSession)) {
      return {
        type: 'SESSION_FORWARD',
        targetSessions: [lastSession],
        processedInput: input.text,
        confidence: 0.5,
        reason: 'Most recent active session (default)',
      };
    }

    // No session available → self-answer
    return {
      type: 'SELF_ANSWER',
      targetSessions: [],
      processedInput: input.text,
      confidence: 0.3,
      reason: 'No active session — self-answer',
    };
  }

  /**
   * Record last session after routing
   */
  recordLastSession(source: InputSource, sessionId: string): void {
    this.lastActiveSession.set(source, sessionId);
  }

  /**
   * Register project alias
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

  private async matchProjectKeyword(_text: string): Promise<{
    sessionId: string;
    projectName: string;
    keyword: string;
    confidence: number;
  } | null> {
    // Project keyword matching disabled — ContextManager removed
    // Gateway /api/local-context API provides context search
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
