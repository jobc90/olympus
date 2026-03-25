import { basename } from 'node:path';
import type { ManagedSession, TaskPlanningDecision } from './types.js';

type MatchedTarget = {
  sessionId: string;
  projectName: string;
  token: string;
};

/**
 * TaskPlanner — extracts project-target intent before routing
 *
 * It is intentionally narrow:
 * - explicit project/session targets
 * - multi-project decomposition from multiple targets
 * - unresolved @mentions marked as manual/low-level fallback
 */
export class TaskPlanner {
  plan(text: string, sessions: ManagedSession[]): TaskPlanningDecision | null {
    const mentionTokens = this.extractMentionTokens(text);
    if (mentionTokens.length === 0) {
      return null;
    }

    const matches = this.matchTargets(mentionTokens, sessions);
    if (matches.length === 0) {
      return {
        kind: 'worker_fallback',
        targetSessionIds: [],
        targetProjectNames: [],
        processedInput: this.stripMentions(text),
        manualPath: true,
        confidence: 0.35,
        reason: 'unresolved worker-style mention should stay on manual path',
      };
    }

    const targetSessionIds = matches.map(match => match.sessionId);
    const targetProjectNames = matches.map(match => match.projectName);
    const processedInput = this.stripMatchedMentions(text, matches);

    return {
      kind: matches.length > 1 ? 'multi_project' : 'single_project',
      targetSessionIds,
      targetProjectNames,
      processedInput,
      manualPath: false,
      confidence: matches.length > 1 ? 0.9 : 1.0,
      reason: matches.length > 1
        ? 'multiple explicit project targets detected'
        : 'explicit project target detected',
    };
  }

  private extractMentionTokens(text: string): string[] {
    const tokens = text.match(/@([^\s@]+)/g) ?? [];
    return tokens.map(token => token.slice(1));
  }

  private matchTargets(mentionTokens: string[], sessions: ManagedSession[]): MatchedTarget[] {
    const matches: MatchedTarget[] = [];
    const seen = new Set<string>();

    for (const token of mentionTokens) {
      const session = sessions.find(candidate => this.matchesSessionToken(candidate, token));
      if (!session || seen.has(session.id)) {
        continue;
      }

      seen.add(session.id);
      matches.push({
        sessionId: session.id,
        projectName: this.projectNameFor(session),
        token,
      });
    }

    return matches;
  }

  private matchesSessionToken(session: ManagedSession, token: string): boolean {
    const normalizedToken = this.normalize(token);
    const candidates = [
      session.name,
      basename(session.projectPath),
      this.stripPrefix(session.name, 'olympus-'),
      this.stripPrefix(basename(session.projectPath), 'olympus-'),
    ];

    return candidates.some(candidate => {
      const normalizedCandidate = this.normalize(candidate);
      return normalizedCandidate === normalizedToken
        || normalizedCandidate.includes(normalizedToken)
        || normalizedToken.includes(normalizedCandidate);
    });
  }

  private stripMatchedMentions(text: string, matches: MatchedTarget[]): string {
    if (matches.length === 0) {
      return this.stripMentions(text);
    }

    const tokens = matches.map(match => this.escapeRegExp(match.token));
    const pattern = new RegExp(`@(?:${tokens.join('|')})\\s*`, 'g');
    return text.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
  }

  private stripMentions(text: string): string {
    return text.replace(/@\S+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private projectNameFor(session: ManagedSession): string {
    return basename(session.projectPath) || session.name;
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
  }

  private stripPrefix(value: string, prefix: string): string {
    return value.toLowerCase().startsWith(prefix.toLowerCase())
      ? value.slice(prefix.length)
      : value;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
