import { queryOne } from '../config/database';

export type Permission = 'owner' | 'full' | 'send' | 'view' | 'none';

export interface AccountAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  permission: Permission;
  channelType?: string;
}

/**
 * Unified account access check for all channel types.
 * Works with the unified accounts table.
 *
 * @param userId - The user ID to check access for
 * @param accountId - The account ID to check access to
 * @returns Access information including ownership and permission level
 */
export async function hasAccountAccess(
  userId: string,
  accountId: string
): Promise<AccountAccessResult> {
  // Check if user owns the account
  const account = await queryOne<{ user_id: string; channel_type: string }>(
    `SELECT user_id, channel_type FROM accounts WHERE id = $1`,
    [accountId]
  );

  if (!account) {
    return { hasAccess: false, isOwner: false, permission: 'none' };
  }

  if (account.user_id === userId) {
    return {
      hasAccess: true,
      isOwner: true,
      permission: 'owner',
      channelType: account.channel_type,
    };
  }

  // Check shared access
  const access = await queryOne<{ permission: string }>(
    `SELECT permission FROM account_access
     WHERE account_id = $1 AND agent_id = $2`,
    [accountId, userId]
  );

  if (access) {
    return {
      hasAccess: true,
      isOwner: false,
      permission: access.permission as Permission,
      channelType: account.channel_type,
    };
  }

  return { hasAccess: false, isOwner: false, permission: 'none' };
}

/**
 * Check if user can send messages (owner, full, or send permission)
 */
export function canSendMessages(permission: Permission): boolean {
  return ['owner', 'full', 'send'].includes(permission);
}

/**
 * Check if user has full access (owner or full permission)
 */
export function hasFullAccess(permission: Permission): boolean {
  return ['owner', 'full'].includes(permission);
}

/**
 * Get all account IDs that a user has access to (owned + shared)
 */
export async function getUserAccountIds(userId: string, channelType?: string): Promise<string[]> {
  const channelFilter = channelType ? `AND channel_type = $2` : '';
  const params = channelType ? [userId, channelType] : [userId];

  // Get owned accounts
  const owned = await queryOne<{ ids: string[] }>(
    `SELECT ARRAY_AGG(id) as ids FROM accounts WHERE user_id = $1 ${channelFilter}`,
    params
  );

  // Get shared accounts
  const shared = await queryOne<{ ids: string[] }>(
    `SELECT ARRAY_AGG(aa.account_id) as ids
     FROM account_access aa
     JOIN accounts a ON aa.account_id = a.id
     WHERE aa.agent_id = $1 ${channelFilter}`,
    params
  );

  const ownedIds = owned?.ids || [];
  const sharedIds = shared?.ids || [];

  return [...new Set([...ownedIds, ...sharedIds])].filter(Boolean);
}
