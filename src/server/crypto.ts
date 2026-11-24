import crypto from 'node:crypto';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    // Ephemeral fallback derived from process secret only for local dev bootstrapping when ENCRYPTION_KEY is unset
    const fallbackSeed = process.env.SESSION_SECRET || 'pagepulse-dev-local-fallback-key';
    return crypto.createHash('sha256').update(fallbackSeed).digest();
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) {
    return utf8;
  }

  return crypto.createHash('sha256').update(raw).digest();
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    'pagepulse-session-signing-key'
  );
}

/**
 * Encrypts a Meta Page Access Token using AES-256-GCM.
 * Format: ivHex:authTagHex:ciphertextHex
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a stored AES-256-GCM Page Access Token in memory.
 */
export function decryptToken(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface SessionPayload {
  userId: string;
  facebookUserId: string;
  exp: number;
}

export function signSessionToken(userId: string, facebookUserId: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const payload: SessionPayload = {
    userId,
    facebookUserId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [encoded, providedSig] = token.split('.');
  if (!encoded || !providedSig) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createSignedOAuthState(redirectOrigin?: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = {
    nonce,
    origin: redirectOrigin || '',
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  return `${encoded}.${sig}`;
}

export function verifySignedOAuthState(
  stateParam: string | undefined,
  cookieState: string | undefined
): { valid: boolean; origin?: string } {
  if (!stateParam || !stateParam.includes('.')) {
    return { valid: false };
  }

  // If the CSRF cookie is present, enforce exact match
  if (cookieState && cookieState !== stateParam) {
    return { valid: false };
  }

  const [encoded, providedSig] = stateParam.split('.');
  if (!encoded || !providedSig) {
    return { valid: false };
  }

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false };
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      nonce: string;
      origin?: string;
      exp: number;
    };
    if (!parsed.nonce || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }
    return { valid: true, origin: parsed.origin };
  } catch {
    return { valid: false };
  }
}

/**
 * Parses and verifies Meta's signed_request payload for Data Deletion / Deauthorization callbacks.
 */
export function parseMetaSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const parts = signedRequest.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedSig, payload] = parts;
  const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest();

  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(jsonStr) as { user_id?: string };
  } catch {
    return null;
  }
}
