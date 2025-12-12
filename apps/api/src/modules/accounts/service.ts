import { eq, and, desc } from 'drizzle-orm';
import { db, accounts, accountAccess } from '../../db/index.js';
import { getChannelRouter } from '../../channels/router.js';
import { broadcastAccountStatus, broadcastQRUpdate } from '../../realtime/socket.js';
import type { ChannelType, AccountStatus, CreateAccountParams, UpdateAccountParams } from '@chatuncle/shared';

export interface AccountWithStats {
  id: string;
  userId: string;
  channelType: ChannelType;
  channelIdentifier: string | null;
  phoneNumber: string | null;
  status: AccountStatus;
  incognitoMode: boolean;
  lastConnectedAt: Date | null;
  createdAt: Date;
  conversationCount?: number;
  unreadCount?: number;
}

/**
 * Get all accounts for a user (owned + shared)
 */
export async function getUserAccounts(userId: string): Promise<AccountWithStats[]> {
  // Get owned accounts
  const owned = await db.query.accounts.findMany({
    where: eq(accounts.userId, userId),
    orderBy: desc(accounts.createdAt),
  });

  // Get shared accounts
  const shared = await db.query.accountAccess.findMany({
    where: eq(accountAccess.agentId, userId),
    with: {
      account: true,
    },
  });

  const sharedAccounts = shared
    .filter(s => s.account)
    .map(s => s.account!);

  // Combine and deduplicate
  const allAccounts = [...owned, ...sharedAccounts];
  const uniqueAccounts = Array.from(
    new Map(allAccounts.map(a => [a.id, a])).values()
  );

  return uniqueAccounts.map(a => ({
    id: a.id,
    userId: a.userId,
    channelType: a.channelType as ChannelType,
    channelIdentifier: a.channelIdentifier,
    phoneNumber: a.phoneNumber,
    status: a.status as AccountStatus,
    incognitoMode: a.incognitoMode,
    lastConnectedAt: a.lastConnectedAt,
    createdAt: a.createdAt,
  }));
}

/**
 * Get a single account by ID
 */
export async function getAccountById(accountId: string): Promise<AccountWithStats | null> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  if (!account) return null;

  return {
    id: account.id,
    userId: account.userId,
    channelType: account.channelType as ChannelType,
    channelIdentifier: account.channelIdentifier,
    phoneNumber: account.phoneNumber,
    status: account.status as AccountStatus,
    incognitoMode: account.incognitoMode,
    lastConnectedAt: account.lastConnectedAt,
    createdAt: account.createdAt,
  };
}

/**
 * Create a new account
 */
export async function createAccount(params: CreateAccountParams): Promise<AccountWithStats> {
  const [account] = await db
    .insert(accounts)
    .values({
      userId: params.userId,
      channelType: params.channelType,
      channelIdentifier: params.channelIdentifier,
      phoneNumber: params.phoneNumber,
      status: 'disconnected',
      credentials: params.credentials ? JSON.stringify(params.credentials) : null,
    })
    .returning();

  // Grant owner access
  await db.insert(accountAccess).values({
    accountId: account!.id,
    agentId: params.userId,
    role: 'owner',
  });

  return {
    id: account!.id,
    userId: account!.userId,
    channelType: account!.channelType as ChannelType,
    channelIdentifier: account!.channelIdentifier,
    phoneNumber: account!.phoneNumber,
    status: account!.status as AccountStatus,
    incognitoMode: account!.incognitoMode,
    lastConnectedAt: account!.lastConnectedAt,
    createdAt: account!.createdAt,
  };
}

/**
 * Update an account
 */
export async function updateAccount(
  accountId: string,
  params: UpdateAccountParams
): Promise<AccountWithStats | null> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.status !== undefined) updateData.status = params.status;
  if (params.channelIdentifier !== undefined) updateData.channelIdentifier = params.channelIdentifier;
  if (params.phoneNumber !== undefined) updateData.phoneNumber = params.phoneNumber;
  if (params.credentials !== undefined) updateData.credentials = JSON.stringify(params.credentials);
  if (params.settings !== undefined) updateData.settings = params.settings;
  if (params.incognitoMode !== undefined) updateData.incognitoMode = params.incognitoMode;
  if (params.lastConnectedAt !== undefined) updateData.lastConnectedAt = params.lastConnectedAt;

  const [updated] = await db
    .update(accounts)
    .set(updateData)
    .where(eq(accounts.id, accountId))
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    userId: updated.userId,
    channelType: updated.channelType as ChannelType,
    channelIdentifier: updated.channelIdentifier,
    phoneNumber: updated.phoneNumber,
    status: updated.status as AccountStatus,
    incognitoMode: updated.incognitoMode,
    lastConnectedAt: updated.lastConnectedAt,
    createdAt: updated.createdAt,
  };
}

/**
 * Delete an account
 */
export async function deleteAccount(accountId: string): Promise<boolean> {
  try {
    // Disconnect first
    const account = await getAccountById(accountId);
    if (account) {
      const router = getChannelRouter();
      await router.disconnectAccount(accountId, account.channelType);
    }

    // Delete from database (cascades to related tables)
    await db.delete(accounts).where(eq(accounts.id, accountId));

    return true;
  } catch (error) {
    console.error('[Account] Delete error:', error);
    return false;
  }
}

/**
 * Connect an account to its channel
 */
export async function connectAccount(accountId: string): Promise<{
  success: boolean;
  qrCode?: string;
  pairingCode?: string;
  error?: string;
}> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  try {
    // Update status to connecting
    await updateAccount(accountId, { status: 'connecting' });
    broadcastAccountStatus(accountId, 'connecting');

    const router = getChannelRouter();
    const credentials = account.credentials ? JSON.parse(account.credentials as string) : undefined;

    const result = await router.connectAccount(
      accountId,
      account.channelType as ChannelType,
      credentials
    );

    if (result.success) {
      if (result.qrCode) {
        broadcastQRUpdate(accountId, result.qrCode);
      }
      return {
        success: true,
        qrCode: result.qrCode,
        pairingCode: result.pairingCode,
      };
    }

    await updateAccount(accountId, { status: 'error' });
    broadcastAccountStatus(accountId, 'error', result.error);

    return { success: false, error: result.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await updateAccount(accountId, { status: 'error' });
    broadcastAccountStatus(accountId, 'error', message);
    return { success: false, error: message };
  }
}

/**
 * Disconnect an account
 */
export async function disconnectAccount(accountId: string): Promise<boolean> {
  const account = await getAccountById(accountId);
  if (!account) return false;

  try {
    const router = getChannelRouter();
    await router.disconnectAccount(accountId, account.channelType);

    await updateAccount(accountId, { status: 'disconnected' });
    broadcastAccountStatus(accountId, 'disconnected');

    return true;
  } catch (error) {
    console.error('[Account] Disconnect error:', error);
    return false;
  }
}

/**
 * Connect using pairing code (WhatsApp)
 */
export async function connectWithPairingCode(
  accountId: string,
  phoneNumber: string
): Promise<{
  success: boolean;
  pairingCode?: string;
  error?: string;
}> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  if (account.channelType !== 'whatsapp') {
    return { success: false, error: 'Pairing code only supported for WhatsApp' };
  }

  try {
    await updateAccount(accountId, {
      status: 'connecting',
      phoneNumber,
    });
    broadcastAccountStatus(accountId, 'connecting');

    const router = getChannelRouter();
    const whatsappAdapter = router.getAdapter('whatsapp') as any;

    if (!whatsappAdapter?.connectWithPairingCode) {
      return { success: false, error: 'WhatsApp adapter not available' };
    }

    const result = await whatsappAdapter.connectWithPairingCode(accountId, phoneNumber);

    if (result.success && result.pairingCode) {
      return {
        success: true,
        pairingCode: result.pairingCode,
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
