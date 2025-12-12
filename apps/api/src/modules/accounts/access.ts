import { eq, and, or } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { db, accounts, accountAccess, users } from '../../db/index.js';
import type { AccountRole } from '@chatuncle/shared';

// Cache for account access (5 minute TTL)
const accessCache = new LRUCache<string, string[]>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes
});

/**
 * Get all account IDs a user has access to
 * Used for Socket.io room authorization
 */
export async function getUserAccountAccess(userId: string): Promise<string[]> {
  // Check cache
  const cached = accessCache.get(userId);
  if (cached) return cached;

  try {
    // Get accounts the user owns
    const ownedAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
      columns: { id: true },
    });

    // Get accounts the user has access to via account_access
    const sharedAccounts = await db.query.accountAccess.findMany({
      where: eq(accountAccess.agentId, userId),
      columns: { accountId: true },
    });

    const accountIds = [
      ...ownedAccounts.map(a => a.id),
      ...sharedAccounts.map(a => a.accountId),
    ];

    // Deduplicate
    const uniqueIds = [...new Set(accountIds)];

    // Cache result
    accessCache.set(userId, uniqueIds);

    return uniqueIds;
  } catch (error) {
    console.error('[AccountAccess] Error getting user access:', error);
    return [];
  }
}

/**
 * Check if user has access to a specific account
 */
export async function userHasAccountAccess(
  userId: string,
  accountId: string
): Promise<boolean> {
  const accountIds = await getUserAccountAccess(userId);
  return accountIds.includes(accountId);
}

/**
 * Get user's role for a specific account
 */
export async function getUserAccountRole(
  userId: string,
  accountId: string
): Promise<AccountRole | null> {
  try {
    // Check if user is owner
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId)
      ),
    });

    if (account) return 'owner';

    // Check account_access
    const access = await db.query.accountAccess.findFirst({
      where: and(
        eq(accountAccess.accountId, accountId),
        eq(accountAccess.agentId, userId)
      ),
    });

    return access?.role as AccountRole | null;
  } catch (error) {
    console.error('[AccountAccess] Error getting user role:', error);
    return null;
  }
}

/**
 * Grant access to an account for a user
 */
export async function grantAccountAccess(
  accountId: string,
  agentId: string,
  role: AccountRole
): Promise<boolean> {
  try {
    await db
      .insert(accountAccess)
      .values({
        accountId,
        agentId,
        role,
      })
      .onConflictDoUpdate({
        target: [accountAccess.accountId, accountAccess.agentId],
        set: { role },
      });

    // Invalidate cache
    accessCache.delete(agentId);

    return true;
  } catch (error) {
    console.error('[AccountAccess] Error granting access:', error);
    return false;
  }
}

/**
 * Revoke access to an account for a user
 */
export async function revokeAccountAccess(
  accountId: string,
  agentId: string
): Promise<boolean> {
  try {
    await db
      .delete(accountAccess)
      .where(
        and(
          eq(accountAccess.accountId, accountId),
          eq(accountAccess.agentId, agentId)
        )
      );

    // Invalidate cache
    accessCache.delete(agentId);

    return true;
  } catch (error) {
    console.error('[AccountAccess] Error revoking access:', error);
    return false;
  }
}

/**
 * Get all agents with access to an account
 */
export async function getAccountAgents(
  accountId: string
): Promise<Array<{
  agentId: string;
  agentName: string;
  agentEmail: string;
  role: AccountRole;
}>> {
  try {
    // Get owner
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
      with: {
        user: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    const agents: Array<{
      agentId: string;
      agentName: string;
      agentEmail: string;
      role: AccountRole;
    }> = [];

    if (account?.user) {
      agents.push({
        agentId: account.user.id,
        agentName: account.user.name,
        agentEmail: account.user.email,
        role: 'owner',
      });
    }

    // Get shared agents
    const sharedAccess = await db.query.accountAccess.findMany({
      where: eq(accountAccess.accountId, accountId),
      with: {
        agent: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    for (const access of sharedAccess) {
      if (access.agent) {
        agents.push({
          agentId: access.agent.id,
          agentName: access.agent.name,
          agentEmail: access.agent.email,
          role: access.role as AccountRole,
        });
      }
    }

    return agents;
  } catch (error) {
    console.error('[AccountAccess] Error getting account agents:', error);
    return [];
  }
}

/**
 * Invalidate cache for a user
 * Call this when user's access changes
 */
export function invalidateUserCache(userId: string): void {
  accessCache.delete(userId);
}

/**
 * Clear entire access cache
 */
export function clearAccessCache(): void {
  accessCache.clear();
}
