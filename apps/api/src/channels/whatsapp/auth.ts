import type {
  AuthenticationState,
  SignalDataTypeMap,
  AuthenticationCreds,
} from '@whiskeysockets/baileys';
import { initAuthCreds, proto, BufferJSON } from '@whiskeysockets/baileys';
import { eq, and } from 'drizzle-orm';
import { db, whatsappAuthState } from '../../db/index.js';

/**
 * PostgreSQL-backed authentication state for Baileys v7
 * Stores credentials and Signal keys in the database
 */
export class PostgresAuthState {
  public state: AuthenticationState;
  private accountId: string;
  private initialized = false;

  constructor(accountId: string) {
    this.accountId = accountId;
    this.state = {
      creds: initAuthCreds(),
      keys: {
        get: async (type, ids) => this.getKeys(type, ids),
        set: async (data) => this.setKeys(data),
      },
    };
  }

  /**
   * Initialize auth state from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load credentials
      const credsRow = await db.query.whatsappAuthState.findFirst({
        where: and(
          eq(whatsappAuthState.accountId, this.accountId),
          eq(whatsappAuthState.dataType, 'creds'),
          eq(whatsappAuthState.dataKey, 'main')
        ),
      });

      if (credsRow) {
        const creds = JSON.parse(credsRow.dataValue, BufferJSON.reviver);
        this.state.creds = creds;
        console.log(`[PostgresAuthState] Loaded credentials for ${this.accountId}`);
      } else {
        console.log(`[PostgresAuthState] No existing credentials for ${this.accountId}, using fresh`);
      }

      this.initialized = true;
    } catch (error) {
      console.error(`[PostgresAuthState] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Save credentials to database
   */
  async saveCreds(): Promise<void> {
    try {
      const serialized = JSON.stringify(this.state.creds, BufferJSON.replacer);

      await db
        .insert(whatsappAuthState)
        .values({
          accountId: this.accountId,
          dataType: 'creds',
          dataKey: 'main',
          dataValue: serialized,
        })
        .onConflictDoUpdate({
          target: [whatsappAuthState.accountId, whatsappAuthState.dataType, whatsappAuthState.dataKey],
          set: {
            dataValue: serialized,
            updatedAt: new Date(),
          },
        });

      console.log(`[PostgresAuthState] Saved credentials for ${this.accountId}`);
    } catch (error) {
      console.error(`[PostgresAuthState] Failed to save credentials:`, error);
      throw error;
    }
  }

  /**
   * Get Signal keys from database
   */
  private async getKeys<T extends keyof SignalDataTypeMap>(
    type: T,
    ids: string[]
  ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
    const result: { [id: string]: SignalDataTypeMap[T] } = {};

    if (ids.length === 0) return result;

    try {
      const rows = await db.query.whatsappAuthState.findMany({
        where: and(
          eq(whatsappAuthState.accountId, this.accountId),
          eq(whatsappAuthState.dataType, type)
        ),
      });

      const dataMap = new Map(rows.map(r => [r.dataKey, r.dataValue]));

      for (const id of ids) {
        const data = dataMap.get(id);
        if (data) {
          result[id] = JSON.parse(data, BufferJSON.reviver);
        }
      }
    } catch (error) {
      console.error(`[PostgresAuthState] Failed to get keys:`, error);
    }

    return result;
  }

  /**
   * Set Signal keys in database
   * Uses transaction for batching - much faster than sequential operations
   */
  private async setKeys(data: { [type: string]: { [id: string]: unknown } }): Promise<void> {
    const upsertOps: Array<{
      accountId: string;
      dataType: string;
      dataKey: string;
      dataValue: string;
    }> = [];

    const deleteOps: Array<{ type: string; key: string }> = [];

    for (const [type, entries] of Object.entries(data)) {
      for (const [id, value] of Object.entries(entries)) {
        if (value === null || value === undefined) {
          deleteOps.push({ type, key: id });
        } else {
          upsertOps.push({
            accountId: this.accountId,
            dataType: type,
            dataKey: id,
            dataValue: JSON.stringify(value, BufferJSON.replacer),
          });
        }
      }
    }

    try {
      // Use transaction for all operations - significantly faster
      await db.transaction(async (tx) => {
        // Batch upsert in transaction
        for (const op of upsertOps) {
          await tx
            .insert(whatsappAuthState)
            .values(op)
            .onConflictDoUpdate({
              target: [whatsappAuthState.accountId, whatsappAuthState.dataType, whatsappAuthState.dataKey],
              set: {
                dataValue: op.dataValue,
                updatedAt: new Date(),
              },
            });
        }

        // Batch delete in same transaction
        for (const { type, key } of deleteOps) {
          await tx
            .delete(whatsappAuthState)
            .where(
              and(
                eq(whatsappAuthState.accountId, this.accountId),
                eq(whatsappAuthState.dataType, type),
                eq(whatsappAuthState.dataKey, key)
              )
            );
        }
      });
    } catch (error) {
      console.error(`[PostgresAuthState] Failed to set keys:`, error);
      throw error;
    }
  }

  /**
   * Clear all auth data for this account
   */
  async clearAuth(): Promise<void> {
    try {
      await db
        .delete(whatsappAuthState)
        .where(eq(whatsappAuthState.accountId, this.accountId));

      console.log(`[PostgresAuthState] Cleared auth for ${this.accountId}`);
    } catch (error) {
      console.error(`[PostgresAuthState] Failed to clear auth:`, error);
      throw error;
    }
  }
}
