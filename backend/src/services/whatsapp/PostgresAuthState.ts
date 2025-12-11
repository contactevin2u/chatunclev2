import { AuthenticationState, SignalDataTypeMap, initAuthCreds, proto, BufferJSON } from '@whiskeysockets/baileys';
import { query, queryOne, execute } from '../../config/database';

/**
 * PostgreSQL-based auth state storage for Baileys
 * Stores session credentials in the database instead of filesystem
 * This ensures sessions persist across deploys/restarts
 */
export async function usePostgresAuthState(accountId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  // Table for storing auth keys (signal protocol keys)
  const ensureTable = async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
        account_id UUID NOT NULL,
        key_type VARCHAR(100) NOT NULL,
        key_id VARCHAR(255) NOT NULL,
        key_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (account_id, key_type, key_id)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_auth_keys_account
      ON whatsapp_auth_keys(account_id)
    `);
    // Composite index for the common query pattern: WHERE account_id = $1 AND key_type = $2
    await query(`
      CREATE INDEX IF NOT EXISTS idx_auth_keys_account_type
      ON whatsapp_auth_keys(account_id, key_type)
    `);
  };

  await ensureTable();

  // Load credentials from database
  const loadCreds = async (): Promise<any> => {
    const row = await queryOne(
      'SELECT session_data FROM accounts WHERE id = $1',
      [accountId]
    );

    if (row?.session_data) {
      try {
        return JSON.parse(JSON.stringify(row.session_data), BufferJSON.reviver);
      } catch (e) {
        console.error('[PgAuth] Failed to parse creds:', e);
      }
    }
    return initAuthCreds();
  };

  // Save credentials to database
  const saveCreds = async () => {
    const credsJson = JSON.stringify(creds, BufferJSON.replacer);
    await execute(
      `UPDATE accounts
       SET session_data = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [credsJson, accountId]
    );
    console.log(`[PgAuth] Saved credentials for account ${accountId}`);
  };

  // Read auth keys from database
  const readData = async (type: string): Promise<Map<string, any>> => {
    const rows = await query(
      'SELECT key_id, key_data FROM whatsapp_auth_keys WHERE account_id = $1 AND key_type = $2',
      [accountId, type]
    );

    const data = new Map<string, any>();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(JSON.stringify(row.key_data), BufferJSON.reviver);
        data.set(row.key_id, parsed);
      } catch (e) {
        console.error(`[PgAuth] Failed to parse key ${row.key_id}:`, e);
      }
    }
    return data;
  };

  // Write auth keys to database
  const writeData = async (type: string, id: string, value: any) => {
    const jsonValue = JSON.stringify(value, BufferJSON.replacer);
    await query(
      `INSERT INTO whatsapp_auth_keys (account_id, key_type, key_id, key_data)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (account_id, key_type, key_id)
       DO UPDATE SET key_data = EXCLUDED.key_data, updated_at = NOW()`,
      [accountId, type, id, jsonValue]
    );
  };

  // Delete auth keys from database
  const removeData = async (type: string, id: string) => {
    await execute(
      'DELETE FROM whatsapp_auth_keys WHERE account_id = $1 AND key_type = $2 AND key_id = $3',
      [accountId, type, id]
    );
  };

  const creds = await loadCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [key: string]: SignalDataTypeMap[T] } = {};
          const allKeys = await readData(type);

          for (const id of ids) {
            const value = allKeys.get(id);
            if (value) {
              if (type === 'app-state-sync-key') {
                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[T];
              } else {
                data[id] = value;
              }
            }
          }
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              if (value) {
                tasks.push(writeData(category, id, value));
              } else {
                tasks.push(removeData(category, id));
              }
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    saveCreds,
  };
}

/**
 * Clear all auth data for an account (on logout)
 */
export async function clearPostgresAuthState(accountId: string): Promise<void> {
  await execute(
    'DELETE FROM whatsapp_auth_keys WHERE account_id = $1',
    [accountId]
  );
  await execute(
    'UPDATE accounts SET session_data = NULL WHERE id = $1',
    [accountId]
  );
  console.log(`[PgAuth] Cleared auth state for account ${accountId}`);
}
