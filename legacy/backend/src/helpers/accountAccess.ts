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
 * Uses the unified 'accounts' view which combines whatsapp_accounts and channel_accounts.
 *
 * @param userId - The user ID to check access for
 * @param accountId - The account ID to check access to
 * @returns Access information including ownership and permission level
 */
export async function hasAccountAccess(
  userId: string,
  accountId: string
): Promise<AccountAccessResult> {
  // Check if user owns the account using unified accounts view
  const account = await queryOne<{ user_id: string; channel_type: string }>(
    'SELECT user_id, channel_type FROM accounts WHERE id = $1',
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

  // Check shared access via account_access table (uses account_id)
  const access = await queryOne<{ permission: string }>(
    'SELECT permission FROM account_access WHERE account_id = $1 AND agent_id = $2',
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

  // Also check channel_account_access for non-WhatsApp channels
  const channelAccess = await queryOne<{ permission_level: string }>(
    'SELECT permission_level FROM channel_account_access WHERE channel_account_id = $1 AND user_id = $2',
    [accountId, userId]
  );

  if (channelAccess) {
    return {
      hasAccess: true,
      isOwner: false,
      permission: channelAccess.permission_level as Permission,
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
 * Uses unified accounts view and account_access.account_id
 */
export async function getUserAccountIds(userId: string, channelType?: string): Promise<string[]> {
  const allIds: string[] = [];

  // Get owned accounts using unified view
  if (channelType) {
    const owned = await queryOne<{ ids: string[] }>(
      'SELECT ARRAY_AGG(id) as ids FROM accounts WHERE user_id = $1 AND channel_type = $2',
      [userId, channelType]
    );
    if (owned?.ids) allIds.push(...owned.ids);
  } else {
    const owned = await queryOne<{ ids: string[] }>(
      'SELECT ARRAY_AGG(id) as ids FROM accounts WHERE user_id = $1',
      [userId]
    );
    if (owned?.ids) allIds.push(...owned.ids);
  }

  // Get shared accounts via account_access (uses account_id)
  if (channelType) {
    const shared = await queryOne<{ ids: string[] }>(
      `SELECT ARRAY_AGG(aa.account_id) as ids
       FROM account_access aa
       JOIN accounts a ON aa.account_id = a.id
       WHERE aa.agent_id = $1 AND a.channel_type = $2`,
      [userId, channelType]
    );
    if (shared?.ids) allIds.push(...shared.ids);
  } else {
    const shared = await queryOne<{ ids: string[] }>(
      `SELECT ARRAY_AGG(aa.account_id) as ids
       FROM account_access aa
       WHERE aa.agent_id = $1`,
      [userId]
    );
    if (shared?.ids) allIds.push(...shared.ids);
  }

  // Also check channel_account_access for non-WhatsApp channels
  if (!channelType || channelType !== 'whatsapp') {
    if (channelType) {
      const channelShared = await queryOne<{ ids: string[] }>(
        `SELECT ARRAY_AGG(caa.channel_account_id) as ids
         FROM channel_account_access caa
         JOIN channel_accounts ca ON caa.channel_account_id = ca.id
         WHERE caa.user_id = $1 AND ca.channel_type = $2`,
        [userId, channelType]
      );
      if (channelShared?.ids) allIds.push(...channelShared.ids);
    } else {
      const channelShared = await queryOne<{ ids: string[] }>(
        `SELECT ARRAY_AGG(caa.channel_account_id) as ids
         FROM channel_account_access caa
         WHERE caa.user_id = $1`,
        [userId]
      );
      if (channelShared?.ids) allIds.push(...channelShared.ids);
    }
  }

  return [...new Set(allIds)].filter(Boolean);
}
