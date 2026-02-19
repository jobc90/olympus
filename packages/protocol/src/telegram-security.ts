/**
 * Telegram security policy types.
 * 3-layer model: DM policy → Group policy → Command gating.
 */

/** DM access control policy */
export type DmPolicy = 'allowlist' | 'open';

/** Group access control policy */
export type GroupPolicy = 'disabled' | 'allowlist' | 'open';

/** Permission level for a specific command */
export type CommandPermission = 'admin' | 'allowed' | 'all';

/** Full Telegram security configuration */
export interface TelegramSecurityConfig {
  dm: {
    /** DM access policy. Default: 'allowlist' */
    policy: DmPolicy;
    /** User IDs allowed in DM. Empty + allowlist = deny all */
    allowedUserIds: number[];
  };
  group: {
    /** Group access policy. Default: 'disabled' */
    policy: GroupPolicy;
    /** Group IDs allowed (only for 'allowlist' policy) */
    allowedGroupIds: number[];
    /** Require @bot mention in groups. Default: true */
    requireMention: boolean;
    /** Only group admins can use bot. Default: false */
    adminOnly: boolean;
  };
  commands: Record<string, CommandPermission>;
  /** Admin user IDs (superset permissions) */
  adminUserIds: number[];
  /** Max messages per user per minute. 0 = unlimited */
  rateLimitPerMinute: number;
}

/** Result of a security check */
export interface SecurityDecision {
  allowed: boolean;
  reason: string;
  layer: 'dm' | 'group' | 'command' | 'rate_limit';
  userId: number;
  chatId: number;
  chatType: string;
}

export const DEFAULT_SECURITY_CONFIG: TelegramSecurityConfig = {
  dm: {
    policy: 'allowlist',
    allowedUserIds: [],
  },
  group: {
    policy: 'disabled',
    allowedGroupIds: [],
    requireMention: true,
    adminOnly: false,
  },
  commands: {},
  adminUserIds: [],
  rateLimitPerMinute: 0,
};
