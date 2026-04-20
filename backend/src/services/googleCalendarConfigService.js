import { query } from '../config/database.js';
import { encrypt, decrypt } from '../utils/cryptoTokens.js';

const KEY_CLIENT_ID = 'gcal_client_id';
const KEY_CLIENT_SECRET = 'gcal_client_secret';
const KEY_REDIRECT_URI = 'gcal_redirect_uri';

async function readSetting(key) {
  const result = await query(
    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
    [key]
  );
  const v = result.rows[0]?.setting_value;
  return v && v.trim() !== '' ? v : null;
}

async function upsertSetting(key, value, type = 'text') {
  await query(
    `INSERT INTO system_settings (id, setting_key, setting_value, setting_type)
     VALUES (uuid_generate_v4(), $1, $2, $3)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = $2, setting_type = $3, updated_at = NOW()`,
    [key, value, type]
  );
}

async function deleteSetting(key) {
  await query('DELETE FROM system_settings WHERE setting_key = $1', [key]);
}

function maskSecret(plain) {
  if (!plain) return null;
  const tail = plain.length > 4 ? plain.slice(-4) : plain;
  return `••••••••${tail}`;
}

/**
 * Resolve effective config used by the OAuth client.
 * Per-field fallback: each field can come from DB (preferred) or env var.
 * Returns nulls when neither source provides a value.
 */
export async function getConfig() {
  const [dbClientId, dbClientSecretEnc, dbRedirectUri] = await Promise.all([
    readSetting(KEY_CLIENT_ID),
    readSetting(KEY_CLIENT_SECRET),
    readSetting(KEY_REDIRECT_URI),
  ]);

  let dbClientSecret = null;
  let secretDecryptError = null;
  if (dbClientSecretEnc) {
    try {
      dbClientSecret = decrypt(dbClientSecretEnc);
    } catch (err) {
      secretDecryptError = err.message;
      console.error('[GCal Config] Failed to decrypt stored client secret:', err.message);
    }
  }

  const clientId = dbClientId || process.env.GCAL_CLIENT_ID || null;
  const clientSecret = dbClientSecret || process.env.GCAL_CLIENT_SECRET || null;
  const redirectUri = dbRedirectUri || process.env.GCAL_REDIRECT_URI || null;

  return {
    clientId,
    clientSecret,
    redirectUri,
    sources: {
      clientId: dbClientId ? 'db' : (process.env.GCAL_CLIENT_ID ? 'env' : 'none'),
      clientSecret: dbClientSecret
        ? 'db'
        : (process.env.GCAL_CLIENT_SECRET ? 'env' : 'none'),
      redirectUri: dbRedirectUri ? 'db' : (process.env.GCAL_REDIRECT_URI ? 'env' : 'none'),
    },
    secretDecryptError,
  };
}

/** Cheap predicate used by status endpoints. */
export async function isConfigured() {
  const cfg = await getConfig();
  return !!(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
}

/**
 * Save admin-supplied config to DB.
 * - clientId / redirectUri: empty string means "clear DB override" (fall back to env).
 * - clientSecret: undefined or empty string means "preserve existing DB value".
 *   Use `clearClientSecret: true` to explicitly remove the DB-stored secret.
 */
export async function saveConfig({
  clientId,
  clientSecret,
  redirectUri,
  clearClientSecret = false,
} = {}) {
  if (typeof clientId === 'string') {
    const trimmed = clientId.trim();
    if (trimmed) {
      await upsertSetting(KEY_CLIENT_ID, trimmed);
    } else {
      await deleteSetting(KEY_CLIENT_ID);
    }
  }

  if (typeof redirectUri === 'string') {
    const trimmed = redirectUri.trim();
    if (trimmed) {
      await upsertSetting(KEY_REDIRECT_URI, trimmed);
    } else {
      await deleteSetting(KEY_REDIRECT_URI);
    }
  }

  if (clearClientSecret) {
    await deleteSetting(KEY_CLIENT_SECRET);
  } else if (typeof clientSecret === 'string' && clientSecret.trim() !== '') {
    const enc = encrypt(clientSecret.trim());
    await upsertSetting(KEY_CLIENT_SECRET, enc);
  }

  return getMaskedConfig();
}

/**
 * Returns config safe to send to the admin UI.
 * - clientId and redirectUri: full values (not secret).
 * - clientSecret: never returned in plaintext; only a mask + a `hasValue` flag.
 */
export async function getMaskedConfig() {
  const cfg = await getConfig();
  return {
    clientId: cfg.clientId || '',
    redirectUri: cfg.redirectUri || '',
    clientSecretHasValue: !!cfg.clientSecret,
    clientSecretMasked: maskSecret(cfg.clientSecret),
    sources: cfg.sources,
    configured: !!(cfg.clientId && cfg.clientSecret && cfg.redirectUri),
    secretDecryptError: cfg.secretDecryptError,
  };
}
