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
 * Works with both old (whatsapp_accounts) and new (accounts view) schemas.
 * Backward-compatible until migration runs.
 *
 * @param userId - The user ID to check access for
 * @param accountId - The account ID to check access to
 * @returns Access information including ownership and permission level
 */
export async function hasAccountAccess(
  userId: string,
  accountId: string
): Promise<AccountAccessResult> {
  // Check if user owns the account - try whatsapp_accounts first (always exists)
  // then check channel_accounts for non-WhatsApp channels
  let account = await queryOne<{ user_id: string; channel_type: string }>(
    `SELECT user_id, 'whatsapp' as channel_type FROM whatsapp_accounts WHERE id = $1`,
    [accountId]
  );

  // If not found in whatsapp_accounts, check channel_accounts
  if (!account) {
    account = await queryOne<{ user_id: string; channel_type: string }>(
      `SELECT user_id, channel_type FROM channel_accounts WHERE id = $1`,
      [accountId]
    );
  }

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

  // Check shared access - use COALESCE for backward compatibility
  // account_access.account_id may not exist yet, so also check whatsapp_account_id
  const access = await queryOne<{ permission: string }>(
    `SELECT permission FROM account_access
     WHERE (whatsapp_account_id = $1 OR account_id = $1) AND agent_id = $2`,
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
    `SELECT permission_level FROM channel_account_access
     WHERE channel_account_id = $1 AND user_id = $2`,
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
 * Backward-compatible with both old and new schemas
 */
export async function getUserAccountIds(userId: string, channelType?: string): Promise<string[]> {
  const allIds: string[] = [];

  // Get owned WhatsApp accounts
  if (!channelType || channelType === 'whatsapp') {
    const waOwned = await queryOne<{ ids: string[] }>(
      `SELECT ARRAY_AGG(id) as ids FROM whatsapp_accounts WHERE user_id = $1`,
      [userId]
    );
    if (waOwned?.ids) allIds.push(...waOwned.ids);
  }

  // Get owned channel accounts (non-WhatsApp)
  if (!channelType || channelType !== 'whatsapp') {
    const channelFilter = channelType ? `AND channel_type = $2` : '';
    const params = channelType ? [userId, channelType] : [userId];
    const channelOwned = await queryOne<{ ids: string[] }>(
      `SELECT ARRAY_AGG(id) as ids FROM channel_accounts WHERE user_id = $1 ${channelFilter}`,
      params
    );
    if (channelOwned?.ids) allIds.push(...channelOwned.ids);
  }

  // Get shared WhatsApp accounts (via account_access)
  if (!channelType || channelType === 'whatsapp') {
    const waShared = await queryOne<{ ids: string[] }>(
      `SELECT ARRAY_AGG(whatsapp_account_id) as ids FROM account_access WHERE agent_id = $1`,
      [userId]
    );
    if (waShared?.ids) allIds.push(...waShared.ids);
  }

  // Get shared channel accounts (via channel_account_access)
  if (!channelType || channelType !== 'whatsapp') {
    const channelShared = await queryOne<{ ids: string[] }>(
      `SELECT ARRAY_AGG(caa.channel_account_id) as ids
       FROM channel_account_access caa
       JOIN channel_accounts ca ON caa.channel_account_id = ca.id
       WHERE caa.user_id = $1 ${channelType ? `AND ca.channel_type = $2` : ''}`,
      channelType ? [userId, channelType] : [userId]
    );
    if (channelShared?.ids) allIds.push(...channelShared.ids);
  }

  return [...new Set(allIds)].filter(Boolean);
}
