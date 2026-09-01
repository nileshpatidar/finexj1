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
  const sessionSecret =
    config.sessionSecret ||
    process.env.SESSION_SECRET ||
    config.supabaseServiceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (sessionSecret && sessionSecret.trim() !== '') {
    return sessionSecret.trim();
  }

  if (config.isProduction) {
    throw new Error('SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY environment variable is required for cryptographic session signing in production.');
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

export function revokeSessionToken(_token: string): void {
  // Stateless token invalidation can be extended with a Redis/Supabase blacklist if needed
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
 * Cryptographically verifies 6-digit TOTP code against the user's secret.
 * Allows a strict ±1 step (30s) clock-drift tolerance window.
 * Strictly rejects malformed, empty, or non-matching codes.
 */
export function verify2FACode(secret: string, code: string): boolean {
  if (!secret || typeof secret !== 'string' || !code || typeof code !== 'string') {
    return false;
  }
  const cleanCode = code.trim();
  const cleanSecret = secret.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
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

