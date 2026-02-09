import type { SecurityConfig } from '@olympus-dev/protocol';

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Security Guard — enforces SecurityConfig at the agent entry point.
 *
 * Checks:
 * - blockedCommands: regex patterns that must not match
 * - approvalRequired: patterns that force user approval (needsConfirmation)
 * - maxWorkerDuration: enforced at worker level
 *
 * Fixes A5 (destructive auto-approve) and A9 (SecurityConfig not enforced).
 */
export class SecurityGuard {
  private blockedPatterns: RegExp[] = [];
  private approvalPatterns: RegExp[] = [];
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.blockedPatterns = this.compilePatterns(config.blockedCommands);
    this.approvalPatterns = this.compilePatterns(config.approvalRequired);
  }

  /**
   * Validate a command before processing.
   * Returns { allowed: false, reason } if blocked.
   */
  validateCommand(command: string): SecurityCheckResult {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `명령이 보안 정책에 의해 차단되었습니다: ${pattern.source}`,
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Check if a command requires user approval.
   */
  requiresApproval(command: string): boolean {
    return this.approvalPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Get max worker duration from config.
   */
  get maxWorkerDuration(): number {
    return this.config.maxWorkerDuration;
  }

  /**
   * Compile string patterns into RegExp, logging warnings for invalid patterns.
   */
  private compilePatterns(patterns: string[]): RegExp[] {
    const compiled: RegExp[] = [];
    for (const pattern of patterns) {
      try {
        compiled.push(new RegExp(pattern, 'i'));
      } catch {
        // Invalid regex — skip with warning (don't crash)
        console.warn(`[SecurityGuard] 잘못된 정규식 패턴 무시: ${pattern}`);
      }
    }
    return compiled;
  }
}
