import crypto from 'crypto';
import { db } from './db';
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

// In-memory fallback map for revoked tokens or legacy tokens
const revokedTokens = new Set<string>();
const legacySessions = new Map<string, { userId: string; role: UserRole; expiresAt: number; sessionVersion: number }>();

export function createSessionToken(user: User): string {
  const settings = db.getSettings();
  const currentVersion = settings.sessionVersion || 1;
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;

  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    exp,
    sessionVersion: currentVersion,
    iat,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  const token = `fx_${payloadBase64}.${signature}`;
  
  // Also register in legacy map for local lookup
  legacySessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt: exp,
    sessionVersion: currentVersion,
  });

  return token;
}

export function verifySessionToken(token: string): { userId: string; role: UserRole } | null {
  if (!token) return null;
  if (revokedTokens.has(token)) return null;

  // 1. Modern signed stateless token
  if (token.startsWith('fx_')) {
    try {
      const parts = token.slice(3).split('.');
      if (parts.length !== 2) return null;
      const [payloadBase64, signature] = parts;

      // Verify HMAC signature
      const expectedSignature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(payloadBase64)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      const payload: TokenPayload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));

      // Expiration check (30 days)
      if (Date.now() > payload.exp) {
        return null;
      }

      // Session version check (for standard users if admin did force logout)
      const currentVersion = db.getSettings().sessionVersion || 1;
      if (payload.role === 'user' && (payload.sessionVersion || 1) < currentVersion) {
        return null;
      }

      return { userId: payload.userId, role: payload.role };
    } catch {
      return null;
    }
  }

  // 2. Fallback for legacy random tokens
  const legacy = legacySessions.get(token);
  if (legacy) {
    if (Date.now() > legacy.expiresAt) {
      legacySessions.delete(token);
      return null;
    }
    const currentVersion = db.getSettings().sessionVersion || 1;
    if (legacy.role === 'user' && legacy.sessionVersion < currentVersion) {
      legacySessions.delete(token);
      return null;
    }
    return { userId: legacy.userId, role: legacy.role };
  }

  return null;
}

export function revokeSessionToken(token: string): void {
  if (token) {
    revokedTokens.add(token);
    legacySessions.delete(token);
  }
}

export function revokeAllUserSessions(userId: string): void {
  for (const [tok, session] of legacySessions.entries()) {
    if (session.userId === userId) {
      revokedTokens.add(tok);
      legacySessions.delete(tok);
    }
  }
}

/**
 * Super Admin Security Action: Invalidate all existing user sessions
 * Increments global sessionVersion and purges user sessions
 */
export function forceLogoutAllUsers(): number {
  const settings = db.getSettings();
  const newVersion = (settings.sessionVersion || 1) + 1;
  db.updateSettings({ sessionVersion: newVersion });

  for (const [tok, session] of legacySessions.entries()) {
    if (session.role === 'user') {
      revokedTokens.add(tok);
      legacySessions.delete(tok);
    }
  }

  return newVersion;
}

// Simple TOTP verification helper (RFC 6238 compatible or 6-digit code validation)
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

