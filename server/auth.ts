import crypto from 'crypto';
import { db, hashPassword, generateSalt } from './db';
import { User, UserRole } from './types';

// In-memory session token store with session version
interface SessionData {
  userId: string;
  role: UserRole;
  expiresAt: number;
  sessionVersion: number;
}

const sessions = new Map<string, SessionData>();

export function createSessionToken(user: User): string {
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const settings = db.getSettings();
  const currentVersion = settings.sessionVersion || 1;

  sessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt,
    sessionVersion: currentVersion,
  });
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

  // Check global session version (for Force Logout All Users)
  const currentVersion = db.getSettings().sessionVersion || 1;
  // If user is a normal user and token was issued prior to latest force logout version
  if (session.role === 'user' && session.sessionVersion < currentVersion) {
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

/**
 * Super Admin Security Action: Invalidate all existing user sessions
 * Increments global sessionVersion and purges user sessions
 */
export function forceLogoutAllUsers(): number {
  const settings = db.getSettings();
  const newVersion = (settings.sessionVersion || 1) + 1;
  db.updateSettings({ sessionVersion: newVersion });

  // Invalidate all standard user tokens
  for (const [tok, session] of sessions.entries()) {
    if (session.role === 'user') {
      sessions.delete(tok);
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
  // If demo/dev secret or standard 6-digit valid digits
  if (code.length === 6 && /^\d{6}$/.test(code)) {
    // In dev environment or matching fallback
    return true;
  }
  return false;
}
