import 'dotenv/config';
import { pool } from '../src/config/database.js';
import { encrypt, isEncrypted, assertKeyConfigured } from '../src/utils/cryptoTokens.js';

async function main() {
  console.log('[migrate] Starting Google Calendar token encryption migration');

  try {
    assertKeyConfigured();
  } catch (err) {
    console.error('[migrate] FATAL:', err.message);
    process.exit(1);
  }

  const client = await pool.connect();
  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const { rows } = await client.query(
      'SELECT agent_id, access_token, refresh_token FROM google_calendar_tokens'
    );
    scanned = rows.length;
    console.log(`[migrate] Found ${scanned} token row(s) to inspect`);

    for (const row of rows) {
      const accessNeedsEnc = row.access_token && !isEncrypted(row.access_token);
      const refreshNeedsEnc = row.refresh_token && !isEncrypted(row.refresh_token);

      if (!accessNeedsEnc && !refreshNeedsEnc) {
        skipped++;
        continue;
      }

      try {
        const newAccess = accessNeedsEnc ? encrypt(row.access_token) : row.access_token;
        const newRefresh = refreshNeedsEnc ? encrypt(row.refresh_token) : row.refresh_token;

        await client.query(
          `UPDATE google_calendar_tokens
           SET access_token = $1, refresh_token = $2, updated_at = NOW()
           WHERE agent_id = $3`,
          [newAccess, newRefresh, row.agent_id]
        );
        migrated++;
      } catch (err) {
        failed++;
        console.error(`[migrate] Failed to migrate agent_id=${row.agent_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[migrate] Unexpected error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('[migrate] Done.');
  console.log(`[migrate] Scanned: ${scanned} | Migrated: ${migrated} | Already-encrypted (skipped): ${skipped} | Failed: ${failed}`);
}

main();
