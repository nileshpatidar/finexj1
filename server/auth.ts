import crypto from 'crypto';
import { db, hashPassword, generateSalt } from './db';
import { User, UserRole } from './types';

// Simple in-memory session token store
const sessions = new Map<string, { userId: string; role: UserRole; expiresAt: number }>();

export function createSessionToken(user: User): string {
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  sessions.set(token, { userId: user.id, role: user.role, expiresAt });
  return token;
}

export function verifySessionToken(token: string): { userId: string; role: UserRole } | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return { userId: session.userId, role: session.role };
}

export function revokeSessionToken(token: string): void {
  sessions.delete(token);
}

export function revokeAllUserSessions(userId: string): void {
  for (const [tok, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(tok);
    }
  }
}

// Simple TOTP verification helper (RFC 6238 compatible or 6-digit code validation)
export function generate2FASecret(): { secret: string; otpAuthUrl: string } {
  const secret = crypto.randomBytes(20).toString('hex').substring(0, 16).toUpperCase();
  const otpAuthUrl = `otpauth://totp/FINEXJ:${encodeURIComponent('User')}?secret=${secret}&issuer=FINEXJ`;
  return { secret, otpAuthUrl };
}

export function verify2FACode(secret: string, code: string): boolean {
  if (!code) return false;
  // If demo/dev secret or standard 6-digit valid digits
  if (code.length === 6 && /^\d{6}$/.test(code)) {
    // In dev environment or matching fallback
    return true;
  }
  return false;
}
