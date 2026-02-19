import { describe, it, expect } from 'vitest';
import { TelegramSecurity } from '../security.js';

describe('TelegramSecurity', () => {
  describe('DM policy', () => {
    it('should allow admin users regardless of policy', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [100],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 100, chatId: 100, chatType: 'private' });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('admin_bypass');
    });

    it('should deny DM from non-allowed user in allowlist mode', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [200] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 999, chatId: 999, chatType: 'private' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('dm_allowlist_denied');
    });

    it('should allow DM from allowed user in allowlist mode', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [200] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 200, chatId: 200, chatType: 'private' });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('dm_allowlist_match');
    });

    it('should allow all DMs in open mode', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 999, chatId: 999, chatType: 'private' });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('dm_open');
    });

    it('should deny when allowlist is empty', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 123, chatId: 123, chatType: 'private' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('dm_allowlist_empty');
    });
  });

  describe('Group policy', () => {
    it('should deny groups when policy is disabled', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 1, chatId: -100, chatType: 'group' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('group_disabled');
    });

    it('should deny non-allowed group in allowlist mode', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'allowlist', allowedGroupIds: [-200], requireMention: false, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 1, chatId: -999, chatType: 'group' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('group_not_allowed');
    });

    it('should require mention when configured', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'open', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 1, chatId: -100, chatType: 'group', botMentioned: false });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('group_mention_required');
    });

    it('should allow when mention is present and required', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'open', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 1, chatId: -100, chatType: 'group', botMentioned: true });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('group_allowed');
    });

    it('should deny non-admin in adminOnly mode', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'allowlist', allowedUserIds: [] },
        group: { policy: 'open', allowedGroupIds: [], requireMention: false, adminOnly: true },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 1, chatId: -100, chatType: 'supergroup', isAdmin: false });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('group_admin_only');
    });
  });

  describe('Command gating', () => {
    it('should deny admin-only command from non-admin', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: { deploy: 'admin' },
        adminUserIds: [100],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 200, chatId: 200, chatType: 'private', command: 'deploy' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('command_admin_denied');
    });

    it('should allow admin-only command from admin', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: { deploy: 'admin' },
        adminUserIds: [100],
        rateLimitPerMinute: 0,
      });
      // Admin bypasses all checks including command gating
      const result = sec.authorize({ userId: 100, chatId: 100, chatType: 'private', command: 'deploy' });
      expect(result.allowed).toBe(true);
    });

    it('should allow unrestricted commands (returns DM policy reason when all pass)', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: { help: 'all' },
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 999, chatId: 999, chatType: 'private', command: 'help' });
      expect(result.allowed).toBe(true);
      // authorize() returns policyResult (DM layer) when command gating passes
      expect(result.reason).toBe('dm_open');
    });

    it('should allow unregistered commands by default (returns DM policy reason)', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 0,
      });
      const result = sec.authorize({ userId: 999, chatId: 999, chatType: 'private', command: 'unknown' });
      expect(result.allowed).toBe(true);
      // authorize() returns policyResult when no command restriction blocks
      expect(result.reason).toBe('dm_open');
    });
  });

  describe('Rate limiting', () => {
    it('should enforce rate limit per user', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 3,
      });

      // First 3 should pass
      expect(sec.authorize({ userId: 1, chatId: 1, chatType: 'private' }).allowed).toBe(true);
      expect(sec.authorize({ userId: 1, chatId: 1, chatType: 'private' }).allowed).toBe(true);
      expect(sec.authorize({ userId: 1, chatId: 1, chatType: 'private' }).allowed).toBe(true);

      // 4th should be rate limited
      const result = sec.authorize({ userId: 1, chatId: 1, chatType: 'private' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
    });

    it('should track rate limits per user independently', () => {
      const sec = new TelegramSecurity({
        dm: { policy: 'open', allowedUserIds: [] },
        group: { policy: 'disabled', allowedGroupIds: [], requireMention: true, adminOnly: false },
        commands: {},
        adminUserIds: [],
        rateLimitPerMinute: 2,
      });

      expect(sec.authorize({ userId: 1, chatId: 1, chatType: 'private' }).allowed).toBe(true);
      expect(sec.authorize({ userId: 1, chatId: 1, chatType: 'private' }).allowed).toBe(true);
      expect(sec.authorize({ userId: 1, chatId: 1, chatType: 'private' }).allowed).toBe(false);

      // Different user should still be allowed
      expect(sec.authorize({ userId: 2, chatId: 2, chatType: 'private' }).allowed).toBe(true);
    });
  });

  describe('fromEnv', () => {
    it('should parse ALLOWED_USERS env var', () => {
      const original = process.env.ALLOWED_USERS;
      process.env.ALLOWED_USERS = '100,200,300';
      try {
        const config = TelegramSecurity.fromEnv();
        expect(config.dm.allowedUserIds).toEqual([100, 200, 300]);
      } finally {
        if (original !== undefined) process.env.ALLOWED_USERS = original;
        else delete process.env.ALLOWED_USERS;
      }
    });

    it('should default to allowlist DM policy', () => {
      const original = process.env.TELEGRAM_DM_POLICY;
      delete process.env.TELEGRAM_DM_POLICY;
      try {
        const config = TelegramSecurity.fromEnv();
        expect(config.dm.policy).toBe('allowlist');
      } finally {
        if (original !== undefined) process.env.TELEGRAM_DM_POLICY = original;
      }
    });

    it('should parse command permissions from env', () => {
      const original = process.env.TELEGRAM_CMD_DEPLOY;
      process.env.TELEGRAM_CMD_DEPLOY = 'admin';
      try {
        const config = TelegramSecurity.fromEnv();
        expect(config.commands.deploy).toBe('admin');
      } finally {
        if (original !== undefined) process.env.TELEGRAM_CMD_DEPLOY = original;
        else delete process.env.TELEGRAM_CMD_DEPLOY;
      }
    });
  });
});
