import type {
  TelegramSecurityConfig,
  SecurityDecision,
  DmPolicy,
  GroupPolicy,
  CommandPermission,
} from '@olympus-dev/protocol';
import { DEFAULT_TELEGRAM_SECURITY_CONFIG } from '@olympus-dev/protocol';
import { structuredLog } from './error-utils.js';

/**
 * 3-layer Telegram security: DM policy → Group policy → Command gating.
 * Drop-in replacement for the old isAllowed() single check.
 */
export class TelegramSecurity {
  private config: TelegramSecurityConfig;
  private rateLimitMap = new Map<number, number[]>();

  constructor(config?: Partial<TelegramSecurityConfig>) {
    this.config = { ...DEFAULT_TELEGRAM_SECURITY_CONFIG, ...config };
    if (config?.dm) {
      this.config.dm = { ...DEFAULT_TELEGRAM_SECURITY_CONFIG.dm, ...config.dm };
    }
    if (config?.group) {
      this.config.group = { ...DEFAULT_TELEGRAM_SECURITY_CONFIG.group, ...config.group };
    }
  }

  /**
   * Main authorization check — replaces isAllowed().
   * Checks layers in order: rate limit → DM/Group policy → command gating.
   */
  authorize(params: {
    userId: number;
    chatId: number;
    chatType: 'private' | 'group' | 'supergroup' | 'channel';
    command?: string;
    isAdmin?: boolean;
    botMentioned?: boolean;
  }): SecurityDecision {
    const { userId, chatId, chatType } = params;

    // Admin users bypass all checks
    if (this.config.adminUserIds.includes(userId)) {
      return this.makeDecision(true, 'admin_bypass', 'dm', params);
    }

    // Layer 0: Rate limit check
    if (this.config.rateLimitPerMinute > 0) {
      const rateLimitResult = this.checkRateLimit(userId, chatId, chatType);
      if (!rateLimitResult.allowed) {
        this.logDecision(rateLimitResult);
        return rateLimitResult;
      }
    }

    // Layer 1/2: DM or Group policy
    let policyResult: SecurityDecision;
    if (chatType === 'private') {
      policyResult = this.checkDmPolicy(userId, chatId, chatType);
    } else {
      policyResult = this.checkGroupPolicy({
        userId,
        chatId,
        chatType,
        isAdmin: params.isAdmin ?? false,
        botMentioned: params.botMentioned ?? false,
      });
    }

    if (!policyResult.allowed) {
      this.logDecision(policyResult);
      return policyResult;
    }

    // Layer 3: Command gating
    if (params.command) {
      const cmdResult = this.checkCommandPermission(params.command, userId, chatId, chatType);
      if (!cmdResult.allowed) {
        this.logDecision(cmdResult);
        return cmdResult;
      }
    }

    this.logDecision(policyResult);
    return policyResult;
  }

  // --- Layer 1: DM Policy ---

  private checkDmPolicy(userId: number, chatId: number, chatType: string): SecurityDecision {
    const { policy, allowedUserIds } = this.config.dm;

    if (policy === 'open') {
      return this.makeDecision(true, 'dm_open', 'dm', { userId, chatId, chatType });
    }

    // policy === 'allowlist'
    if (allowedUserIds.length === 0) {
      return this.makeDecision(false, 'dm_allowlist_empty', 'dm', { userId, chatId, chatType });
    }

    const allowed = allowedUserIds.includes(userId);
    return this.makeDecision(
      allowed,
      allowed ? 'dm_allowlist_match' : 'dm_allowlist_denied',
      'dm',
      { userId, chatId, chatType },
    );
  }

  // --- Layer 2: Group Policy ---

  private checkGroupPolicy(params: {
    userId: number;
    chatId: number;
    chatType: string;
    isAdmin: boolean;
    botMentioned: boolean;
  }): SecurityDecision {
    const { policy, allowedGroupIds, requireMention, adminOnly } = this.config.group;
    const { userId, chatId, chatType, isAdmin, botMentioned } = params;

    if (policy === 'disabled') {
      return this.makeDecision(false, 'group_disabled', 'group', { userId, chatId, chatType });
    }

    if (policy === 'allowlist') {
      if (allowedGroupIds.length > 0 && !allowedGroupIds.includes(chatId)) {
        return this.makeDecision(false, 'group_not_allowed', 'group', { userId, chatId, chatType });
      }
    }

    if (adminOnly && !isAdmin) {
      return this.makeDecision(false, 'group_admin_only', 'group', { userId, chatId, chatType });
    }

    if (requireMention && !botMentioned) {
      return this.makeDecision(false, 'group_mention_required', 'group', { userId, chatId, chatType });
    }

    return this.makeDecision(true, 'group_allowed', 'group', { userId, chatId, chatType });
  }

  // --- Layer 3: Command Gating ---

  private checkCommandPermission(
    command: string,
    userId: number,
    chatId: number,
    chatType: string,
  ): SecurityDecision {
    const permission = this.config.commands[command];
    if (!permission) {
      return this.makeDecision(true, 'command_no_restriction', 'command', { userId, chatId, chatType });
    }

    switch (permission) {
      case 'all':
        return this.makeDecision(true, 'command_all', 'command', { userId, chatId, chatType });

      case 'allowed': {
        const isAllowed = this.config.dm.allowedUserIds.includes(userId);
        return this.makeDecision(
          isAllowed,
          isAllowed ? 'command_allowed_match' : 'command_allowed_denied',
          'command',
          { userId, chatId, chatType },
        );
      }

      case 'admin': {
        const isAdmin = this.config.adminUserIds.includes(userId);
        return this.makeDecision(
          isAdmin,
          isAdmin ? 'command_admin_match' : 'command_admin_denied',
          'command',
          { userId, chatId, chatType },
        );
      }

      default:
        return this.makeDecision(true, 'command_unknown_permission', 'command', { userId, chatId, chatType });
    }
  }

  // --- Rate Limiting ---

  private checkRateLimit(userId: number, chatId: number, chatType: string): SecurityDecision {
    const now = Date.now();
    const windowMs = 60_000;

    let timestamps = this.rateLimitMap.get(userId);
    if (!timestamps) {
      timestamps = [];
      this.rateLimitMap.set(userId, timestamps);
    }

    const cutoff = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.config.rateLimitPerMinute) {
      return this.makeDecision(false, 'rate_limit_exceeded', 'rate_limit', { userId, chatId, chatType });
    }

    timestamps.push(now);
    // Ensure entry is in the map (may have been a fresh array)
    if (!this.rateLimitMap.has(userId)) {
      this.rateLimitMap.set(userId, timestamps);
    }

    // Periodically prune inactive users (those with all timestamps expired)
    if (this.rateLimitMap.size > 100) {
      for (const [uid, ts] of this.rateLimitMap) {
        if (ts.length === 0) this.rateLimitMap.delete(uid);
      }
    }

    return this.makeDecision(true, 'rate_limit_ok', 'rate_limit', { userId, chatId, chatType });
  }

  // --- Helpers ---

  private makeDecision(
    allowed: boolean,
    reason: string,
    layer: SecurityDecision['layer'],
    context: { userId: number; chatId: number; chatType: string },
  ): SecurityDecision {
    return {
      allowed,
      reason,
      layer,
      userId: context.userId,
      chatId: context.chatId,
      chatType: context.chatType,
    };
  }

  private logDecision(decision: SecurityDecision): void {
    structuredLog(
      decision.allowed ? 'info' : 'warn',
      'security',
      decision.allowed ? 'access_granted' : 'access_denied',
      {
        userId: decision.userId,
        chatId: decision.chatId,
        chatType: decision.chatType,
        layer: decision.layer,
        reason: decision.reason,
      },
    );
  }

  /**
   * Load config from environment variables.
   * Backward compatible with existing ALLOWED_USERS env var.
   */
  static fromEnv(): TelegramSecurityConfig {
    const parseIds = (val: string | undefined): number[] =>
      val?.split(',').map(Number).filter(n => !isNaN(n) && n > 0) ?? [];

    const allowedUsers = parseIds(process.env.ALLOWED_USERS);
    const adminUsers = parseIds(process.env.TELEGRAM_ADMIN_USERS);
    const allowedGroups = parseIds(process.env.TELEGRAM_ALLOWED_GROUPS);

    const dmPolicy = (process.env.TELEGRAM_DM_POLICY as DmPolicy) || 'allowlist';
    const groupPolicy = (process.env.TELEGRAM_GROUP_POLICY as GroupPolicy) || 'disabled';
    const requireMention = process.env.TELEGRAM_REQUIRE_MENTION !== 'false';
    const adminOnly = process.env.TELEGRAM_GROUP_ADMIN_ONLY === 'true';
    const rateLimit = parseInt(process.env.TELEGRAM_RATE_LIMIT ?? '0', 10) || 0;

    const commands: Record<string, CommandPermission> = {};
    for (const [key, val] of Object.entries(process.env)) {
      if (key.startsWith('TELEGRAM_CMD_') && val) {
        const cmdName = key.slice('TELEGRAM_CMD_'.length).toLowerCase();
        if (val === 'admin' || val === 'allowed' || val === 'all') {
          commands[cmdName] = val;
        }
      }
    }

    return {
      dm: {
        policy: dmPolicy === 'open' ? 'open' : 'allowlist',
        allowedUserIds: allowedUsers,
      },
      group: {
        policy: ['disabled', 'allowlist', 'open'].includes(groupPolicy)
          ? groupPolicy as GroupPolicy
          : 'disabled',
        allowedGroupIds: allowedGroups,
        requireMention,
        adminOnly,
      },
      commands,
      adminUserIds: adminUsers,
      rateLimitPerMinute: rateLimit,
    };
  }
}
