import { describe, it, expect } from 'vitest';
import { SecurityGuard } from '../agent/security-guard.js';

describe('SecurityGuard', () => {
  it('should allow commands when no blocked patterns', () => {
    const guard = new SecurityGuard({
      blockedCommands: [],
      approvalRequired: [],
      maxWorkerDuration: 600_000,
    });

    expect(guard.validateCommand('any command here').allowed).toBe(true);
  });

  it('should block commands matching blocked patterns', () => {
    const guard = new SecurityGuard({
      blockedCommands: ['rm\\s+-rf', 'drop\\s+database'],
      approvalRequired: [],
      maxWorkerDuration: 600_000,
    });

    const result1 = guard.validateCommand('rm -rf /');
    expect(result1.allowed).toBe(false);
    expect(result1.reason).toContain('보안 정책');

    const result2 = guard.validateCommand('drop database users');
    expect(result2.allowed).toBe(false);

    // Non-matching command should pass
    expect(guard.validateCommand('list files').allowed).toBe(true);
  });

  it('should detect commands requiring approval', () => {
    const guard = new SecurityGuard({
      blockedCommands: [],
      approvalRequired: ['delete', 'push.*force', 'reset.*hard'],
      maxWorkerDuration: 600_000,
    });

    expect(guard.requiresApproval('delete the file')).toBe(true);
    expect(guard.requiresApproval('git push --force')).toBe(true);
    expect(guard.requiresApproval('git reset --hard')).toBe(true);
    expect(guard.requiresApproval('add a new feature')).toBe(false);
  });

  it('should be case-insensitive', () => {
    const guard = new SecurityGuard({
      blockedCommands: ['DROP DATABASE'],
      approvalRequired: [],
      maxWorkerDuration: 600_000,
    });

    expect(guard.validateCommand('drop database users').allowed).toBe(false);
  });

  it('should skip invalid regex patterns gracefully', () => {
    const guard = new SecurityGuard({
      blockedCommands: ['[invalid regex', 'valid-pattern'],
      approvalRequired: ['(unclosed group'],
      maxWorkerDuration: 600_000,
    });

    // Invalid patterns are skipped, valid ones still work
    expect(guard.validateCommand('valid-pattern test').allowed).toBe(false);
    expect(guard.validateCommand('safe command').allowed).toBe(true);
  });

  it('should expose maxWorkerDuration', () => {
    const guard = new SecurityGuard({
      blockedCommands: [],
      approvalRequired: [],
      maxWorkerDuration: 300_000,
    });

    expect(guard.maxWorkerDuration).toBe(300_000);
  });

  it('should handle empty command', () => {
    const guard = new SecurityGuard({
      blockedCommands: ['something'],
      approvalRequired: [],
      maxWorkerDuration: 600_000,
    });

    expect(guard.validateCommand('').allowed).toBe(true);
  });
});
