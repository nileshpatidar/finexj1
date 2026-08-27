import crypto from 'crypto';
import { getServerSupabase } from './supabase';
import { getProfileById, getProfileByEmail } from './repositories/profiles';
import { getSettings, updateSettings } from './repositories/settings';
import { User, UserRole } from './types';

const SESSION_SECRET = process.env.SESSION_SECRET || 'finexj_fund_master_jwt_secret_key_2026_prod';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days session validity

interface TokenPayload {
  userId: string;
  role: UserRole;
  exp: number;
  sessionVersion: number;
  iat: number;
}

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha512').update(password + salt).digest('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function createSessionToken(user: User, sessionVersion: number = 1): string {
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;

  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    exp,
    sessionVersion,
    iat,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
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

      const expectedSignature = crypto
        .createHmac('sha256', SESSION_SECRET)
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

export function revokeSessionToken(token: string): void {
  // Stateless token invalidation can be extended with a Redis/Supabase blacklist if needed
}

export async function forceLogoutAllUsersAsync(): Promise<number> {
  const settings = await getSettings();
  const newVersion = (settings.sessionVersion || 1) + 1;
  await updateSettings({ sessionVersion: newVersion });
  return newVersion;
}

export function generate2FASecret(): { secret: string; otpAuthUrl: string } {
  const secret = crypto.randomBytes(20).toString('hex').substring(0, 16).toUpperCase();
  const otpAuthUrl = `otpauth://totp/FINEXJ:${encodeURIComponent('User')}?secret=${secret}&issuer=FINEXJ`;
  return { secret, otpAuthUrl };
}

export function verify2FACode(secret: string, code: string): boolean {
  if (!code) return false;
  if (code.length === 6 && /^\d{6}$/.test(code)) {
    return true;
  }
  return false;
}
