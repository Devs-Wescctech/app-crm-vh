import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const VERSION_PREFIX = 'enc:v1:';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env.GCAL_TOKEN_ENC_KEY;
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      'GCAL_TOKEN_ENC_KEY is not configured. Generate with: openssl rand -base64 32'
    );
  }

  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    throw new Error('GCAL_TOKEN_ENC_KEY is not valid base64.');
  }

  const key = Buffer.from(trimmed, 'base64');
  if (key.toString('base64').replace(/=+$/, '') !== trimmed.replace(/=+$/, '')) {
    throw new Error('GCAL_TOKEN_ENC_KEY failed base64 round-trip validation.');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `GCAL_TOKEN_ENC_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate with: openssl rand -base64 32`
    );
  }

  cachedKey = key;
  return key;
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

export function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') {
    return plainText;
  }
  if (typeof plainText !== 'string') {
    throw new Error('encrypt() expects a string');
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    iv: iv.toString('base64'),
    content: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };

  return VERSION_PREFIX + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decrypt(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  if (typeof value !== 'string') {
    throw new Error('decrypt() expects a string');
  }

  if (!isEncrypted(value)) {
    return value;
  }

  const key = getKey();
  const b64 = value.slice(VERSION_PREFIX.length);

  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error('Failed to parse encrypted token payload (corrupted).');
  }

  if (!payload || !payload.iv || !payload.content || !payload.tag) {
    throw new Error('Encrypted token payload is missing required fields.');
  }

  try {
    const iv = Buffer.from(payload.iv, 'base64');
    const content = Buffer.from(payload.content, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('Failed to decrypt token (wrong key or tampered data).');
  }
}

export function assertKeyConfigured() {
  getKey();
}
