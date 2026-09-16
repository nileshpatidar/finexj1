import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { getServerSupabase } from './supabase';
import { getProfileById, getProfileByEmail } from './repositories/profiles';
import { getSettings, updateSettings } from './repositories/settings';
import { User, UserRole } from './types';
import { config } from './config';

const BCRYPT_SALT_ROUNDS = 10;

// Ephemeral in-memory key for local development when SESSION_SECRET is unset
const devEphemeralSecret = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  // SESSION_SECRET is the sole signing secret. Never reuse the Supabase
  // service-role key for session signing, even as a fallback.
  const sessionSecret = config.sessionSecret;

  if (sessionSecret && sessionSecret.trim() !== '') {
    return sessionSecret.trim();
  }

  if (config.isProduction) {
    throw new Error('SESSION_SECRET environment variable is required for cryptographic session signing in production.');
  }

  return devEphemeralSecret;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days session validity

interface TokenPayload {
  userId: string;
  role: UserRole;
  exp: number;
  sessionVersion: number;
  iat: number;
}

/**
 * Production-grade password hashing using bcrypt.
 * Generates a salted, slow-hash resistant to rainbow table and brute-force attacks.
 */
export function hashPassword(password: string, _salt?: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a valid non-empty string.');
  }
  return bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Authoritative password verification.
 * Verifies bcrypt hashes, with fallback support for legacy PBKDF2/SHA-512 hashes for existing users.
 */
export function verifyPassword(password: string, storedHash: string, storedSalt?: string): boolean {
  if (!password || !storedHash) return false;

  // 1. Modern bcrypt hash check ($2a$, $2b$, $2y$)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch {
      return false;
    }
  }

  // 2. Direct plain-text match (supports manually inserted rows in Supabase Table Editor)
  if (storedHash === password) {
    return true;
  }

  // 3. Backwards-compatible legacy hash check for existing database users
  if (storedSalt) {
    try {
      const computedSha512 = crypto.createHash('sha512').update(password + storedSalt).digest('hex');
      if (computedSha512 === storedHash) {
        return true;
      }
      const computedPbkdf2 = crypto.pbkdf2Sync(password, storedSalt, 10000, 64, 'sha512').toString('hex');
      if (computedPbkdf2 === storedHash) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // 4. Unsalted hashes (SHA-256 / SHA-512)
  try {
    const unsaltedSha256 = crypto.createHash('sha256').update(password).digest('hex');
    if (unsaltedSha256 === storedHash) return true;
    const unsaltedSha512 = crypto.createHash('sha512').update(password).digest('hex');
    if (unsaltedSha512 === storedHash) return true;
  } catch {
    // Ignore
  }

  return false;
}

/**
 * Strips sensitive authentication fields (passwordHash, passwordSalt, twoFactorSecret)
 * before returning user data in API responses.
 */
export function sanitizeUser(user: User): Omit<User, 'passwordHash' | 'passwordSalt' | 'twoFactorSecret'> {
  const { passwordHash, passwordSalt, twoFactorSecret, ...safeUser } = user;
  return safeUser;
}

export function createSessionToken(user: User, sessionVersion: number = 1): string {
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;
  const secret = getSessionSecret();

  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    exp,
    sessionVersion,
    iat,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  return `fx_${payloadBase64}.${signature}`;
}

export async function verifySessionTokenAsync(token: string): Promise<{ userId: string; role: UserRole } | null> {
  if (!token) return null;
  if (isTokenRevoked(token)) return null;

  // 1. Check if token is a Supabase Auth JWT (standard 3-segment JWT)
  if (!token.startsWith('fx_') && token.includes('.')) {
    try {
      const supabase = getServerSupabase();
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        const profile = await getProfileById(data.user.id);
        if (profile) {
          return { userId: profile.id, role: profile.role };
        }
      }
    } catch {
      // Continue to HMAC verification if JWT verification fails
    }
  }

  // 2. Verified HMAC signed token (fx_ prefix)
  if (token.startsWith('fx_')) {
    try {
      const parts = token.slice(3).split('.');
      if (parts.length !== 2) return null;
      const [payloadBase64, signature] = parts;
      const secret = getSessionSecret();

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadBase64)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      const payload: TokenPayload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));

      // Expiration check
      if (Date.now() > payload.exp) {
        return null;
      }

      // Session version check (for force logout)
      const settings = await getSettings();
      if (payload.role === 'user' && (payload.sessionVersion || 1) < (settings.sessionVersion || 1)) {
        return null;
      }

      return { userId: payload.userId, role: payload.role };
    } catch {
      return null;
    }
  }

  return null;
}

// In-memory revoked tokens store with TTL cleanup
const revokedTokens = new Map<string, number>();

export function revokeSessionToken(token: string): void {
  if (!token) return;
  try {
    let exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (token.startsWith('fx_')) {
      const parts = token.slice(3).split('.');
      if (parts.length === 2) {
        const payload: TokenPayload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (payload.exp) exp = payload.exp;
      }
    }
    revokedTokens.set(token, exp);

    if (revokedTokens.size > 5000) {
      const now = Date.now();
      for (const [t, expiry] of revokedTokens.entries()) {
        if (expiry <= now) revokedTokens.delete(t);
      }
    }
  } catch {
    revokedTokens.set(token, Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
}

export function isTokenRevoked(token: string): boolean {
  if (!token) return true;
  const expiry = revokedTokens.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    revokedTokens.delete(token);
    return false;
  }
  return true;
}

export async function forceLogoutAllUsersAsync(): Promise<number> {
  const settings = await getSettings();
  const newVersion = (settings.sessionVersion || 1) + 1;
  await updateSettings({ sessionVersion: newVersion });
  return newVersion;
}

/**
 * Generates standard RFC 6238 Base32 TOTP Secret and Authenticator QR Key URI.
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, etc.
 */
export function generate2FASecret(userEmail?: string): { secret: string; otpAuthUrl: string } {
  const secret = generateSecret();
  const label = userEmail && userEmail.trim() ? userEmail.trim().toLowerCase() : 'User';
  const otpAuthUrl = generateURI({
    secret,
    issuer: 'FINEXJ',
    label,
  });
  return { secret, otpAuthUrl };
}

/**
 * Derives a dedicated 256-bit encryption key for TOTP secrets at rest.
 */
function getTotpEncryptionKey(): Buffer {
  const baseKey = getSessionSecret();
  return crypto.scryptSync(baseKey, 'finexj_totp_salt_v1', 32);
}

/**
 * Encrypts a Base32 TOTP secret using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptTotpSecret(secret: string): string {
  if (!secret || typeof secret !== 'string') return secret;
  if (secret.startsWith('enc:v1:')) return secret; // already encrypted
  const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
  const key = getTotpEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret.
 * Seamlessly handles legacy plaintext Base32 secrets for backward compatibility.
 */
export function decryptTotpSecret(encryptedOrPlain: string): string {
  if (!encryptedOrPlain || typeof encryptedOrPlain !== 'string') return '';
  if (!encryptedOrPlain.startsWith('enc:v1:')) {
    // Unencrypted / legacy secret
    return encryptedOrPlain.trim();
  }
  try {
    const parts = encryptedOrPlain.split(':');
    if (parts.length !== 5) return '';
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const ciphertext = parts[4];
    const key = getTotpEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted.trim();
  } catch {
    return '';
  }
}

/**
 * In-memory sliding window cache for used TOTP codes.
 * Enforces single-use verification within the valid ±30s clock drift window to prevent replay attacks.
 */
const usedTotpCache = new Map<string, number>();

export function isTotpCodeReplayed(userId: string, code: string): boolean {
  if (!userId || !code) return false;
  const key = `${userId}:${code.trim()}`;
  const usedAt = usedTotpCache.get(key);
  if (!usedAt) return false;
  // If used within 90 seconds (the 30s epoch + drift window), it is a replay
  if (Date.now() - usedAt < 90 * 1000) {
    return true;
  }
  usedTotpCache.delete(key);
  return false;
}

export function markTotpCodeUsed(userId: string, code: string): void {
  if (!userId || !code) return;
  const key = `${userId}:${code.trim()}`;
  usedTotpCache.set(key, Date.now());

  // Periodically evict expired entries
  if (usedTotpCache.size > 2000) {
    const cutoff = Date.now() - 90 * 1000;
    for (const [k, timestamp] of usedTotpCache.entries()) {
      if (timestamp < cutoff) {
        usedTotpCache.delete(k);
      }
    }
  }
}

/**
 * Cryptographically verifies 6-digit TOTP code against the user's secret.
 * Transparently decrypts encrypted secrets if needed.
 * Allows a strict ±1 step (30s) clock-drift tolerance window.
 * Strictly rejects malformed, empty, or non-matching codes.
 */
export function verify2FACode(secret: string, code: string): boolean {
  if (!secret || typeof secret !== 'string' || !code || typeof code !== 'string') {
    return false;
  }
  const cleanCode = code.trim();
  const cleanSecret = decryptTotpSecret(secret);
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    return false;
  }
  if (!cleanSecret) {
    return false;
  }
  try {
    const result = verifySync({
      token: cleanCode,
      secret: cleanSecret,
      epochTolerance: 30,
    });
    return Boolean(result && result.valid);
  } catch {
    return false;
  }
}

