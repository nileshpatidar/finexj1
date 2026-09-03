import crypto from 'crypto';
import { logger } from '../logger';

interface OtpRecord {
  userId: string;
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
  action: string;
}

// In-memory OTP storage with 10-minute TTL
const otpStore = new Map<string, OtpRecord>();

// Expiration time in milliseconds (10 minutes)
const OTP_EXPIRATION_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/**
 * Generates and stores a secure 6-digit email OTP for withdrawal authorization.
 */
export async function generateWithdrawalOtp(
  userId: string,
  email: string,
  isTestUser: boolean = false
): Promise<{ success: boolean; message: string; expiresInSeconds: number; devCode?: string }> {
  // Generate cryptographically secure 6-digit numeric OTP
  const code = isTestUser ? '123456' : crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + OTP_EXPIRATION_MS;

  const key = `withdrawal_${userId}`;
  otpStore.set(key, {
    userId,
    email,
    code,
    expiresAt,
    attempts: 0,
    action: 'withdrawal',
  });

  logger.info('WITHDRAWAL_OTP_GENERATED', `Generated withdrawal OTP for user ${email}`, {
    userId,
    metadata: { expiresAt: new Date(expiresAt).toISOString() },
  });

  // Simulated email dispatch (in production this calls SMTP/SendGrid/SES)
  console.log(`[FINEXJ SECURITY DISPATCH] Withdrawal OTP for ${email}: ${code} (Expires in 10 minutes)`);

  const response: { success: boolean; message: string; expiresInSeconds: number; devCode?: string } = {
    success: true,
    message: `Security verification OTP sent to your registered email (${maskEmail(email)}). The code expires in 10 minutes.`,
    expiresInSeconds: Math.floor(OTP_EXPIRATION_MS / 1000),
  };

  // Provide devCode in non-production or for test users
  if (process.env.NODE_ENV !== 'production' || isTestUser) {
    response.devCode = code;
  }

  return response;
}

/**
 * Validates the email OTP submitted with a withdrawal request.
 * Enforces maximum 3 attempts and single-use invalidation.
 */
export function verifyWithdrawalOtp(
  userId: string,
  submittedCode: string,
  isTestUser: boolean = false
): { valid: boolean; error?: string } {
  // Always accept test codes for verified test users
  if (isTestUser && (submittedCode === '123456' || submittedCode === '000000')) {
    return { valid: true };
  }

  const key = `withdrawal_${userId}`;
  const record = otpStore.get(key);

  if (!record) {
    return {
      valid: false,
      error: 'No active withdrawal verification code found. Please request a new security code.',
    };
  }

  const now = Date.now();
  if (now > record.expiresAt) {
    otpStore.delete(key);
    return {
      valid: false,
      error: 'Security verification code has expired. Please request a new code.',
    };
  }

  record.attempts += 1;
  if (record.attempts > MAX_ATTEMPTS) {
    otpStore.delete(key);
    return {
      valid: false,
      error: 'Too many incorrect attempts. For your security, this verification code has been invalidated. Please request a new code.',
    };
  }

  const cleanSubmitted = (submittedCode || '').trim();
  if (cleanSubmitted !== record.code) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      valid: false,
      error: `Invalid security verification code. ${remaining} attempt(s) remaining.`,
    };
  }

  // Verification successful: consume and invalidate code immediately (single-use)
  otpStore.delete(key);
  return { valid: true };
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
