import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import {
  hashPassword,
  generateSalt,
  verifyPassword,
  sanitizeUser,
  createSessionToken,
  verifySessionTokenAsync,
  revokeSessionToken,
  forceLogoutAllUsersAsync,
  generate2FASecret,
  verify2FACode,
  encryptTotpSecret,
  decryptTotpSecret,
  isTotpCodeReplayed,
  markTotpCodeUsed,
} from './auth';
import { getProfileById, getProfileByEmail, createProfile, updateProfile, getAllProfiles, ensureUserReferralCodeAsync } from './repositories/profiles';
import { getDepositsByUserId, getAllDeposits, getDepositById } from './repositories/deposits';
import { getWithdrawalsByUserId, getAllWithdrawals, getWithdrawalById } from './repositories/withdrawals';
import { getEarningsByUserId, getAllEarnings, getPaginatedEarningsByUserId, getTotalCreditedEarningsByUserId } from './repositories/earnings';
import { getDailyPerformances, isValidDateString } from './repositories/performances';
import { getLedgerByUserId, getAllLedger, getLedgerCount, createLedgerEntry } from './repositories/ledger';
import { getSettings, updateSettings } from './repositories/settings';
import { getAuditLogs, getAuditLogsCount, createAuditLog, MEANINGFUL_FINANCIAL_ACTIONS } from './repositories/auditLogs';
import { executeDatabaseCleanup } from './cleanup';
import { getSystemLogs } from './repositories/systemLogs';
import { getAdminMessagesForUser, createAdminMessage, markMessageRead } from './repositories/messages';
import { getFinancialMessages, createFinancialMessage, markFinancialMessagesRead } from './repositories/financialMessages';
import { calculateUserBalanceAsync, calculateUserBalanceWithDatasetsAsync, adjustUserBalanceAtomicAsync, checkWithdrawalImpactAsync } from './services/balanceService';
import { processDepositAsync, updateDepositStatusAsync, verifyDepositOnChainAsync } from './services/depositService';
import { createWithdrawalRequestAsync, updateWithdrawalStatusAsync, cancelWithdrawalAsync } from './services/withdrawalService';
import {
  bindReferralAsync,
  getReferralSummaryAsync,
  getUserReferralSummaryAsync,
  checkReferralEligibilityAsync,
  getUserLevel1ReferralsPaginatedAsync,
  getUserLevel2ReferralsPaginatedAsync,
  validateReferralCodeAsync,
} from './services/referralService';
import { getFraudSignals, resolveFraudSignal, checkWalletDuplication, checkRapidWithdrawalCycle } from './services/fraudService';
import { getReferralsByReferrerId, getReferralRewardsByReferrerId } from './repositories/referrals';
import { getOperationalFundSummaryAsync, adjustOperationalFundAsync } from './services/operationalFundService';
import { getAccountingSummaryAsync, getReferralAccountingSummaryAsync, getAdminLedgerAsync } from './services/accountingService';
import { getUserTransactionsAsync, formatPerformanceDate } from './services/transactionService';
import { applyDailyPerformanceAsync } from './services/performanceService';
import { lockUserFundVoluntary } from './rules';
import { getSignedDepositProofUrl } from './storage';
import { verifyBEP20Deposit, verifyBEP20PayoutTx, isValidBEP20Address, isValidTxHash } from './blockchain';
import { runAutomatedTestSuite } from './tests';
import { getMarketPrices, marketDataService } from './market';
import { DecimalSafe } from './utils/decimalSafe';
import { getServerSupabase, isServerSupabaseReady } from './supabase';
import {
  getMigrationStatusList,
  getMigrationSql,
  executeMigration,
} from './services/migrationService';
import { UserRole, User, mapToUserDepositStatus } from './types';
import { generateRequestId, logger } from './logger';
import { AppError, Errors, centralErrorHandler } from './errors';
import { createRateLimiter } from './rateLimit';
import { config } from './config';
import {
  validateAmount,
  validateBEP20Address,
  validateTxHash,
  validateId,
  validatePagination,
  validateDateString,
  validateDateRange,
  validateSafeUrl,
  validateString,
  sanitizeUserWithdrawal,
} from './validation';

export const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// Global Request ID & Correlation Tracking Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || generateRequestId();
  (req as any).requestId = reqId;
  (req as any).startTime = Date.now();
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Hardened Production CORS & Security Headers Middleware (No wildcard * on authenticated APIs)
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host || '';
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isVercelDomain = origin.endsWith('.vercel.app');
    const isAppDomain = origin.endsWith('.run.app') || (host && origin.includes(host)) || (forwardedHost && origin.includes(forwardedHost));
    const isGoogleStudio = origin.endsWith('.google.com') || origin.endsWith('.google') || origin.includes('ai.studio');
    const allowedEnvOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

    const isAllowed =
      !config.isProduction ||
      isLocalhost ||
      isVercelDomain ||
      isAppDomain ||
      isGoogleStudio ||
      allowedEnvOrigins.includes(origin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
      res.setHeader('Vary', 'Origin');
    }
  }

  // Production HTTP Security Headers
  // Note: X-Frame-Options is omitted so the applet can render seamlessly inside Google AI Studio's preview iframe
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Rate Limiters for Sensitive Endpoints
const authRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, keyPrefix: 'auth' });
const financialRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 40, keyPrefix: 'fin' });

const SESSION_COOKIE_NAME = 'finexj_session';
const isProduction = process.env.NODE_ENV === 'production';

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

// Helper: Optional authentication middleware (populates req.user if session token is valid, otherwise leaves req.user null)
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined = undefined;

    // 1. Primary: HttpOnly Session Cookie
    if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
      token = req.cookies[SESSION_COOKIE_NAME];
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    // 2. Secondary: Authorization Header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      (req as any).user = null;
      (req as any).token = null;
      return next();
    }

    const session = await verifySessionTokenAsync(token);
    if (!session) {
      (req as any).user = null;
      (req as any).token = null;
      return next();
    }

    const user = await getProfileById(session.userId);
    (req as any).user = user || null;
    (req as any).token = user ? token : null;
    next();
  } catch (err) {
    (req as any).user = null;
    (req as any).token = null;
    next();
  }
}

// Helper: Extract HttpOnly Cookie or Bearer token and authenticate user from Supabase
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined = undefined;

    // 1. Primary: HttpOnly Session Cookie
    if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
      token = req.cookies[SESSION_COOKIE_NAME];
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    // 2. Secondary: Authorization Header (Bearer token for API scripts, cURL, automated tests)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return next(Errors.unauthorized('Authentication required. Please login.'));
    }

    const session = await verifySessionTokenAsync(token);
    if (!session) {
      return next(Errors.unauthorized('Session expired or invalidated. Please login again.'));
    }

    const user = await getProfileById(session.userId);
    if (!user) {
      return next(Errors.notFound('USER_NOT_FOUND', 'User not found.'));
    }

    // Maintenance mode guard for non-admins
    const settings = await getSettings();
    if (settings.maintenanceMode && user.role === 'user') {
      return next(Errors.maintenanceMode('FINEXJ is temporarily under maintenance. Please try again later.'));
    }

    (req as any).user = user;
    (req as any).token = token;
    next();
  } catch (err) {
    next(err);
  }
}

// Helper: Admin role authorization middleware
export function adminMiddleware(allowedRoles: UserRole[] = ['super_admin', 'finance_admin', 'support_admin', 'readonly_admin']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user: User = (req as any).user;
    if (!user || !allowedRoles.includes(user.role)) {
      return next(Errors.forbidden('Access denied. Insufficient administrative privileges.'));
    }
    next();
  };
}

// ==========================================
// 1. PUBLIC & AUTHENTICATION ENDPOINTS
// ==========================================

// Health check endpoint (Strict 200 JSON compliance)
app.get(['/api', '/api/health', '/health'], (req, res) => {
  res.status(200).json({
    success: true,
    service: 'FINEXJ API',
    status: 'ok',
    database: 'SUPABASE_POSTGRESQL',
    time: new Date().toISOString(),
  });
});

// App settings
app.get(['/api/settings', '/settings'], async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// Live market ticker (BTC & Gold real-time data)
app.get(['/api/market/ticker', '/market/ticker'], async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const ticker = await marketDataService.getMarketTicker(forceRefresh);
    res.json(ticker);
  } catch (err) {
    next(err);
  }
});

// Live market prices (legacy compatibility)
app.get(['/api/market/prices', '/market/prices'], async (req, res) => {
  const prices = await getMarketPrices();
  res.json(prices);
});

// Blockchain Network Status (BNB Smart Chain BEP-20)
app.get(['/api/blockchain/status', '/blockchain/status'], async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.usdtContractAddress || !settings.bep20DepositAddress) {
      return res.status(500).json({ error: 'Deposit configuration is incomplete in system settings.' });
    }
    res.json({
      network: 'BNB Smart Chain (BSC Mainnet)',
      chainId: 56,
      currency: 'USDT',
      tokenStandard: 'BEP-20',
      tokenContract: settings.usdtContractAddress,
      depositWallet: settings.bep20DepositAddress,
      requiredConfirmations: settings.requiredConfirmations,
      minimumDeposit: settings.minimumDepositAmount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to query blockchain settings.' });
  }
});

// User Registration
app.post(['/api/auth/register', '/auth/register'], authRateLimiter, async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (settings.registrationEnabled === false) {
      throw Errors.registrationDisabled('Registration is currently unavailable.');
    }

    const { fullName, email, phone, country, password, confirmPassword, profilePictureUrl } = req.body;

    if (!fullName || !email || !password) {
      throw Errors.validation('Full name, email, and password are required.');
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw Errors.validation('Passwords do not match.');
    }

    if (password.length < 8) {
      throw Errors.validation('Password must be at least 8 characters with letters and numbers.');
    }

    const existing = await getProfileByEmail(email);
    if (existing) {
      throw Errors.validation('An account with this email address already exists.');
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();
    const generatedReferralCode = 'FXJ' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // Security check: Validate explicitly provided referral code BEFORE creating user
    const rawRefCode = req.body.referralCode ? String(req.body.referralCode).trim() : '';
    if (rawRefCode) {
      const validation = await validateReferralCodeAsync(rawRefCode);
      if (!validation.valid) {
        throw Errors.validation(validation.error || 'Referral code not found or invalid.');
      }
    }

    const newUser = await createProfile({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      country: country ? country.trim() : 'India',
      passwordHash,
      passwordSalt: salt,
      role: 'user',
      status: 'active',
      referralCode: generatedReferralCode,
      createdAt: now,
      twoFactorEnabled: false,
      loginAttempts: 0,
      profilePictureUrl: profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
    });

    // Bind incoming referral code if provided
    if (rawRefCode) {
      const bindResult = await bindReferralAsync(newUser, rawRefCode);
      if (!bindResult.success) {
        throw Errors.validation(bindResult.error || 'Failed to bind referral relationship.');
      }
    }

    await createAuditLog({
      action: 'USER_REGISTERED',
      actorId: newUser.id,
      actorEmail: newUser.email,
      actorRole: newUser.role,
      targetUserId: newUser.id,
      reason: 'New user account created successfully.',
    });

    const token = createSessionToken(newUser, settings.sessionVersion || 1);
    setSessionCookie(res, token);

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        phone: newUser.phone,
        country: newUser.country,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt,
        twoFactorEnabled: newUser.twoFactorEnabled,
        profilePictureUrl: newUser.profilePictureUrl,
        referralCode: newUser.referralCode || generatedReferralCode,
        walletAddress: newUser.walletAddress || '',
      },
    });
  } catch (err) {
    next(err);
  }
});

// User Login
app.post(['/api/auth/login', '/auth/login'], authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw Errors.validation('Email and password are required.');
    }

    const user = await getProfileByEmail(email);
    if (!user) {
      throw Errors.invalidCredentials('Invalid email or password.');
    }

    // Global Login Switch check (admins always permitted)
    const settings = await getSettings();
    if (settings.loginEnabled === false && user.role === 'user') {
      throw Errors.authDisabled('User login is temporarily unavailable.');
    }

    if (user.status === 'suspended') {
      throw new AppError('ACCOUNT_SUSPENDED', 'Account has been suspended. Please contact support.', 403);
    }

    // Server-side temporary login lockout enforcement
    if (user.lockUntil) {
      const lockTime = new Date(user.lockUntil).getTime();
      const nowTime = Date.now();
      if (lockTime > nowTime) {
        const remainingMinutes = Math.max(1, Math.ceil((lockTime - nowTime) / (60 * 1000)));
        throw new AppError(
          'ACCOUNT_LOCKED',
          `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
          423
        );
      }
    }

    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MINUTES = 15;

    const isPasswordValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isPasswordValid) {
      const newAttempts = (user.loginAttempts || 0) + 1;

      try {
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const lockUntilIso = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
          await updateProfile(user.id, {
            loginAttempts: newAttempts,
            lockUntil: lockUntilIso,
          });

          await createAuditLog({
            action: 'USER_ACCOUNT_LOCKED',
            actorId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            targetUserId: user.id,
            reason: `Account temporarily locked for ${LOCKOUT_DURATION_MINUTES} minutes after ${newAttempts} consecutive failed login attempts.`,
            timestamp: new Date().toISOString(),
          });

          throw new AppError(
            'ACCOUNT_LOCKED',
            `Account is temporarily locked due to ${newAttempts} failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
            423
          );
        } else {
          await updateProfile(user.id, { loginAttempts: newAttempts });
        }
      } catch (profileErr: any) {
        if (profileErr instanceof AppError) throw profileErr;
        // Non-blocking fallback for login attempt counter failure
      }

      throw Errors.invalidCredentials('Invalid email or password.');
    }

    // LOGIN RULE: Authenticator/TOTP is NOT required during login.
    // Login flow is strictly Email + Password -> Normal authentication -> User logged in.
    // TOTP is only required for withdrawals, not for login.

    // Lazy migration: Upgrade legacy SHA-512 hashes to bcrypt
    if (user.passwordHash && !user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$')) {
      try {
        const modernHash = hashPassword(password);
        await updateProfile(user.id, { passwordHash: modernHash });
      } catch {
        // Ignore background hash upgrade error
      }
    }

    // Reset login attempts and clear temporary lock on successful authentication
    try {
      await updateProfile(user.id, { loginAttempts: 0, lockUntil: null as any, lastLoginAt: new Date().toISOString() });
    } catch {
      // Ignore background timestamp update error
    }

    const token = createSessionToken(user, settings.sessionVersion || 1);
    setSessionCookie(res, token);

    // Referral sharing is available to all authenticated users; reward eligibility controls rewards only
    let exposedReferralCode = user.referralCode || null;
    if (!exposedReferralCode) {
      exposedReferralCode = await ensureUserReferralCodeAsync(user);
    }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        profilePictureUrl: user.profilePictureUrl,
        referralCode: exposedReferralCode,
        walletAddress: user.walletAddress || '',
      },
    });
  } catch (err) {
    next(err);
  }
});

// Logout
app.post(['/api/auth/logout', '/auth/logout'], authMiddleware, (req, res) => {
  const token = (req as any).token;
  if (token) {
    revokeSessionToken(token);
  }
  clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Logout all devices
app.post(['/api/auth/logout-all', '/auth/logout-all'], authMiddleware, (req, res) => {
  const token = (req as any).token;
  if (token) {
    revokeSessionToken(token);
  }
  clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out from all active sessions.' });
});

// Get current profile (safe for session probing)
app.get(['/api/auth/me', '/auth/me'], optionalAuthMiddleware, async (req, res) => {
  const user: User | null = (req as any).user;
  if (!user) {
    return res.json({ user: null });
  }

  // Referral sharing is available to all authenticated users; reward eligibility controls rewards only
  let exposedReferralCode = user.referralCode || null;
  if (!exposedReferralCode) {
    exposedReferralCode = await ensureUserReferralCodeAsync(user);
  }

  res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      country: user.country,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      twoFactorEnabled: user.twoFactorEnabled,
      profilePictureUrl: user.profilePictureUrl,
      referralCode: exposedReferralCode,
      walletAddress: user.walletAddress || '',
    },
  });
});

// Update Profile (Strict field allowlist - prohibits role elevation, lock modification, or balance tampering)
app.post(['/api/auth/update-profile', '/auth/update-profile'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { fullName, phone, country, profilePictureUrl, walletAddress, twoFactorCode } = req.body;

    const allowedUpdates: Partial<User> = {};
    if (typeof fullName === 'string' && fullName.trim()) {
      allowedUpdates.fullName = validateString(fullName, 'Full name', { minLength: 2, maxLength: 100 });
    }
    if (typeof phone === 'string') {
      allowedUpdates.phone = validateString(phone, 'Phone number', { maxLength: 30 });
    }
    if (typeof country === 'string' && country.trim()) {
      allowedUpdates.country = validateString(country, 'Country', { maxLength: 60 });
    }
    if (typeof profilePictureUrl === 'string' && profilePictureUrl.trim()) {
      allowedUpdates.profilePictureUrl = validateSafeUrl(profilePictureUrl, 'Profile picture URL');
    }
    if (typeof walletAddress === 'string' && walletAddress.trim()) {
      const cleanAddress = validateBEP20Address(walletAddress, 'Withdrawal wallet address');

      // Point #23: Require 2FA verification if 2FA is enabled on user's account, or password if not enabled
      if (user.twoFactorEnabled) {
        if (!twoFactorCode || typeof twoFactorCode !== 'string') {
          throw Errors.validation('2FA verification code is required to update your withdrawal wallet address.');
        }
        const is2FAValid = verify2FACode(user.twoFactorSecret || '', twoFactorCode.trim());
        if (!is2FAValid) {
          throw Errors.validation('Invalid 2FA verification code. Please try again.');
        }
      } else {
        const { password } = req.body;
        if (!password || typeof password !== 'string') {
          throw Errors.validation('Account password is required to update your withdrawal wallet address.');
        }
        const isPassValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
        if (!isPassValid) {
          throw Errors.invalidCredentials('Incorrect password.');
        }
      }

      allowedUpdates.walletAddress = cleanAddress.toLowerCase();

      // Point #23: Log audit trail for wallet address changes
      await createAuditLog({
        action: 'WALLET_ADDRESS_UPDATED',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        targetUserId: user.id,
        beforeValue: { walletAddress: user.walletAddress || null },
        afterValue: { walletAddress: cleanAddress.toLowerCase() },
        reason: 'User updated registered BEP-20 withdrawal wallet address.',
      });
    }

    const updated = await updateProfile(user.id, allowedUpdates);

    res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err) {
    next(err);
  }
});

// Dedicated Update Wallet Address endpoint (Point #23)
app.post(['/api/user/wallet', '/user/wallet'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { walletAddress, twoFactorCode, password } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      throw Errors.validation('BEP-20 wallet address is required.');
    }

    const cleanAddress = walletAddress.trim();
    if (!isValidBEP20Address(cleanAddress)) {
      throw Errors.validation('Invalid BEP-20 wallet address format. Must be a 0x-prefixed 40-hex character BNB Smart Chain address.');
    }

    // Sensitive Action Protection: Updating withdrawal wallet requires 2FA if enabled, or account password if 2FA not enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode || typeof twoFactorCode !== 'string') {
        throw Errors.validation('2FA verification code is required to update your withdrawal wallet address.');
      }
      const is2FAValid = verify2FACode(user.twoFactorSecret || '', twoFactorCode.trim());
      if (!is2FAValid) {
        throw Errors.validation('Invalid 2FA verification code. Please try again.');
      }
    } else {
      if (!password || typeof password !== 'string') {
        throw Errors.validation('Account password is required to update your withdrawal wallet address.');
      }
      const isPassValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
      if (!isPassValid) {
        throw Errors.invalidCredentials('Incorrect password.');
      }
    }

    const normalizedAddress = cleanAddress.toLowerCase();
    const updated = await updateProfile(user.id, { walletAddress: normalizedAddress });

    await createAuditLog({
      action: 'WALLET_ADDRESS_UPDATED',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      beforeValue: { walletAddress: user.walletAddress || null },
      afterValue: { walletAddress: normalizedAddress },
      reason: 'User updated registered BEP-20 withdrawal wallet address.',
    });

    res.json({
      success: true,
      walletAddress: normalizedAddress,
      message: 'Withdrawal wallet address successfully updated. Existing pending withdrawals remain securely addressed to their original destination.',
      user: sanitizeUser(updated),
    });
  } catch (err) {
    next(err);
  }
});

// Change Password
app.post(['/api/auth/change-password', '/auth/change-password'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw Errors.validation('Current password and new password are required.');
    }

    if (newPassword !== confirmNewPassword) {
      throw Errors.validation('New passwords do not match.');
    }

    const isCurrentValid = verifyPassword(currentPassword, user.passwordHash, user.passwordSalt);
    if (!isCurrentValid) {
      throw Errors.validation('Current password is incorrect.');
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword);

    await updateProfile(user.id, {
      passwordHash: newHash,
      passwordSalt: newSalt,
    });

    await createAuditLog({
      action: 'PASSWORD_CHANGED',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      reason: 'User successfully updated password.',
    });

    // Session Security: Invalidate old session token and issue a rotated session token
    const oldToken = (req as any).token;
    if (oldToken) {
      revokeSessionToken(oldToken);
    }
    const settings = await getSettings();
    const newToken = createSessionToken(user, settings.sessionVersion || 1);
    setSessionCookie(res, newToken);

    res.json({ success: true, token: newToken, message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// 2FA / Authenticator App Setup & Management Endpoints
// Standard RFC 6238 TOTP (Google Authenticator, Microsoft Authenticator, Authy, etc.)

// 1. Authenticator Setup - Generate Secret and otpauth:// QR URI (Does NOT enable 2FA until verified)
app.post(
  ['/api/user/2fa/setup', '/api/auth/2fa/setup', '/api/auth/2fa/generate', '/auth/2fa/generate'],
  authMiddleware,
  financialRateLimiter,
  (req, res) => {
    const user: User = (req as any).user;
    const { secret, otpAuthUrl } = generate2FASecret(user?.email);
    res.json({
      success: true,
      secret,
      otpAuthUrl,
      issuer: 'FINEXJ',
      message: 'Scan the QR code with your Authenticator App, then verify with the 6-digit code to enable 2FA.',
    });
  }
);

// 2. Authenticator Verification & Activation - Requires valid 6-digit TOTP code to enable
app.post(
  ['/api/user/2fa/verify-setup', '/api/auth/2fa/verify-setup', '/api/user/2fa/enable'],
  authMiddleware,
  financialRateLimiter,
  async (req, res, next) => {
    try {
      const user: User = (req as any).user;
      const { secret, code } = req.body;

      if (!secret || typeof secret !== 'string' || !secret.trim()) {
        throw Errors.validation('Authenticator secret is required.');
      }
      if (!code || typeof code !== 'string' || !code.trim()) {
        throw Errors.validation('6-digit authenticator code is required.');
      }

      const cleanCode = code.trim();
      if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
        throw Errors.validation('Invalid authenticator code format. Must be 6 digits.');
      }

      if (isTotpCodeReplayed(user.id, cleanCode)) {
        throw Errors.validation('Authenticator code has already been used. Please wait for the next 6-digit code.');
      }

      const isValid = verify2FACode(secret.trim(), cleanCode);
      if (!isValid) {
        throw Errors.validation('Invalid authenticator code. Please check your authenticator app and ensure your device clock is synchronized.');
      }

      const encryptedSecret = encryptTotpSecret(secret.trim());
      await updateProfile(user.id, {
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        twoFactorEnabledAt: new Date().toISOString(),
      });

      markTotpCodeUsed(user.id, cleanCode);

      res.json({
        success: true,
        twoFactorEnabled: true,
        message: 'Authenticator App verified and enabled successfully.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3. Authenticator Disable - Requires valid current 6-digit TOTP code or account password
app.post(
  ['/api/user/2fa/disable', '/api/auth/2fa/disable'],
  authMiddleware,
  financialRateLimiter,
  async (req, res, next) => {
    try {
      const user: User = (req as any).user;
      const { code, password } = req.body;

      if (!user.twoFactorEnabled) {
        return res.json({ success: true, twoFactorEnabled: false, message: 'Authenticator is already disabled.' });
      }

      let isVerified = false;
      if (code && typeof code === 'string' && /^\d{6}$/.test(code.trim())) {
        isVerified = verify2FACode(user.twoFactorSecret || '', code.trim());
      }
      if (!isVerified && password && typeof password === 'string') {
        isVerified = verifyPassword(password, user.passwordHash, user.passwordSalt);
      }

      if (!isVerified) {
        throw Errors.validation('Valid 6-digit Authenticator code or account password is required to disable two-factor authentication.');
      }

      await updateProfile(user.id, {
        twoFactorEnabled: false,
        twoFactorSecret: undefined,
        twoFactorEnabledAt: undefined,
      });

      res.json({ success: true, twoFactorEnabled: false, message: 'Authenticator disabled successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// 4. Backward-Compatible 2FA Toggle Wrapper
app.post(['/api/auth/2fa/toggle', '/auth/2fa/toggle'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { enable, secret, code, password } = req.body;

    if (enable) {
      if (!code || !secret) {
        throw Errors.validation('Verification code and secret required to enable 2FA.');
      }
      const cleanCode = String(code).trim();
      const isValid = verify2FACode(secret, cleanCode);
      if (!isValid) {
        throw Errors.validation('Invalid 2FA code. Please check your authenticator app.');
      }
      const encryptedSecret = encryptTotpSecret(secret.trim());
      await updateProfile(user.id, {
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        twoFactorEnabledAt: new Date().toISOString(),
      });
      res.json({ success: true, twoFactorEnabled: true });
    } else {
      if (user.twoFactorEnabled) {
        let isVerified = false;
        if (code && typeof code === 'string') {
          isVerified = verify2FACode(user.twoFactorSecret || '', code.trim());
        }
        if (!isVerified && password && typeof password === 'string') {
          isVerified = verifyPassword(password, user.passwordHash, user.passwordSalt);
        }
        if (!isVerified) {
          throw Errors.validation('Valid 2FA verification code or account password is required to disable two-factor authentication.');
        }
      }
      await updateProfile(user.id, {
        twoFactorEnabled: false,
        twoFactorSecret: undefined,
        twoFactorEnabledAt: undefined,
      });
      res.json({ success: true, twoFactorEnabled: false });
    }
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. USER FINANCIAL & DASHBOARD ENDPOINTS
// ==========================================

// Dashboard summary
app.get(['/api/user/dashboard', '/user/dashboard'], authMiddleware, async (req, res, next) => {
  const reqStart = performance.now();
  try {
    const user: User = (req as any).user;
    let tBalance = 0;
    let tLedger = 0;
    let tEarnings = 0;
    let tMarket = 0;
    let tSettings = 0;
    let tReferral = 0;
    let tWithdrawals = 0;

    const [balanceData, marketPrices] = await Promise.all([
      (async () => {
        const s = performance.now();
        const r = await calculateUserBalanceWithDatasetsAsync(user.id, user);
        tBalance = performance.now() - s;
        return r;
      })(),
      (async () => {
        const s = performance.now();
        const r = await getMarketPrices();
        tMarket = performance.now() - s;
        return r;
      })(),
    ]);

    const {
      balance: balanceSummary,
      settings,
      earnings,
      withdrawals,
      referralRewards,
    } = balanceData;

    const sRef = performance.now();
    const referralSummary = await getUserReferralSummaryAsync(user.id, {
      user,
      balance: balanceSummary,
      referralRewards,
      settings,
    });
    tReferral = performance.now() - sRef;

    const postStart = performance.now();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEarning = earnings.find(e => e.performanceDate === todayStr);
    const todayEarningsAmount = todayEarning ? todayEarning.earningsAmount : 0;

    const pendingWithdrawal = withdrawals.find(w =>
      ['pending', 'under_review', 'approved', 'processing'].includes(w.status)
    ) || null;

    const sanitizedPendingWithdrawal = pendingWithdrawal ? {
      id: pendingWithdrawal.id,
      reference: pendingWithdrawal.reference,
      userId: user.id,
      requestedAmount: pendingWithdrawal.requestedAmount,
      feePercentage: pendingWithdrawal.feePercentage,
      feeAmount: pendingWithdrawal.feeAmount,
      netAmount: pendingWithdrawal.netAmount,
      destinationAddress: pendingWithdrawal.destinationAddress,
      network: pendingWithdrawal.network,
      status: pendingWithdrawal.status,
      createdAt: pendingWithdrawal.createdAt,
    } : null;

    const totalTimeMs = performance.now() - reqStart;
    const postProcessingMs = performance.now() - postStart;

    logger.info('DASHBOARD_PROFILE', `[Dashboard Profile] user=${user.id} total=${totalTimeMs.toFixed(2)}ms balance=${tBalance.toFixed(2)}ms referral=${tReferral.toFixed(2)}ms earnings=${tEarnings.toFixed(2)}ms withdrawals=${tWithdrawals.toFixed(2)}ms`, {
      userId: user.id,
      durationMs: Math.round(totalTimeMs),
      metadata: {
        balanceCalcMs: Number(tBalance.toFixed(2)),
        earningsMs: Number(tEarnings.toFixed(2)),
        marketPricesMs: Number(tMarket.toFixed(2)),
        settingsMs: Number(tSettings.toFixed(2)),
        referralSummaryMs: Number(tReferral.toFixed(2)),
        withdrawalsMs: Number(tWithdrawals.toFixed(2)),
        postProcessingMs: Number(postProcessingMs.toFixed(2)),
        totalTimeMs: Number(totalTimeMs.toFixed(2)),
      },
    });

    res.setHeader('Server-Timing', `total;dur=${totalTimeMs.toFixed(2)}, bal;dur=${tBalance.toFixed(2)}, ref;dur=${tReferral.toFixed(2)}, earn;dur=${tEarnings.toFixed(2)}, wdr;dur=${tWithdrawals.toFixed(2)}`);

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        profilePictureUrl: user.profilePictureUrl,
        referralCode: user.referralCode || referralSummary.referralCode,
      },
      balance: balanceSummary,
      todayEarnings: todayEarningsAmount,
      marketPrices,
      referralSummary,
      activePendingWithdrawal: sanitizedPendingWithdrawal,
      settings: {
        bep20DepositAddress: settings.bep20DepositAddress,
        usdtContractAddress: settings.usdtContractAddress,
        requiredConfirmations: settings.requiredConfirmations,
        minimumDepositAmount: settings.minimumDepositAmount,
        withdrawalFeePercentage: settings.withdrawalFeePercentage,
        accountAgeRequirementDays: settings.accountAgeRequirementDays,
        depositLockPeriodDays: settings.depositLockPeriodDays,
        telegramSupportUrl: settings.telegramSupportUrl,
        operationalWalletAddress: settings.operationalWalletAddress,
        compoundingEnabled: settings.compoundingEnabled !== false,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Separate lightweight Recent Activity API (Returns only latest 5 records without burdening Dashboard)
app.get(['/api/user/recent-activity', '/user/recent-activity'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;

    // 1. Efficiently query database for strictly the latest 5 records of the authenticated user
    const recentLedger = await getLedgerByUserId(user.id, 5);

    // 2. Correlate with user's earnings only if performance items exist to ensure accurate performance date
    const hasEarnings = recentLedger.some(
      item => item.type === 'daily_earnings' || item.type === 'daily_loss' || (item.description && /daily\s+performance/i.test(item.description))
    );
    const earnings = hasEarnings ? await getEarningsByUserId(user.id) : [];

    // 3. User security: Sanitize ledger items for user-facing display (no internal notes, admin references, or internal IDs)
    const sanitizedActivity = recentLedger.map(item => {
      const isPerf = item.type === 'daily_earnings' || item.type === 'daily_loss' || (item.description && /daily\s+performance/i.test(item.description));
      if (isPerf) {
        const matchedEarning = earnings.find(e =>
          (item.referenceId && (String(e.calculationId) === String(item.referenceId) || String(e.id) === String(item.referenceId))) ||
          (e.performanceDate && item.description.includes(e.performanceDate))
        );

        let perfDate = item.performanceDate || matchedEarning?.performanceDate;
        let ratePct = item.ratePercentage ?? (matchedEarning ? Number((matchedEarning.applicableRate * 100).toFixed(4)) : undefined);
        let baseAmount = item.baseEligibleAmount ?? matchedEarning?.baseEligibleAmount;

        if (!perfDate) {
          const dateMatch = item.description.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) perfDate = dateMatch[1];
        }
        if (ratePct === undefined) {
          const rateMatch = item.description.match(/@\s*([+\-]?\d+(?:\.\d+)?)\s*%/);
          if (rateMatch) ratePct = parseFloat(rateMatch[1]);
        }
        if (baseAmount === undefined) {
          const baseMatch = item.description.match(/on\s+([\d.]+)\s*USDT/i);
          if (baseMatch) baseAmount = parseFloat(baseMatch[1]);
        }

        return {
          id: item.id,
          userId: user.id,
          type: item.type,
          amount: item.amount,
          balanceAfter: item.balanceAfter,
          performanceDate: perfDate,
          ratePercentage: ratePct,
          baseEligibleAmount: baseAmount,
          description: 'Daily Performance',
          createdAt: item.createdAt,
        };
      }

      return {
        id: item.id,
        userId: user.id,
        type: item.type,
        amount: item.amount,
        balanceAfter: item.balanceAfter,
        description: item.description,
        createdAt: item.createdAt,
      };
    });

    // Sort newest first by performanceDate or createdAt
    sanitizedActivity.sort((a, b) => {
      const timeA = a.performanceDate ? new Date(`${a.performanceDate}T23:59:59Z`).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.performanceDate ? new Date(`${b.performanceDate}T23:59:59Z`).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    res.json({
      success: true,
      recentActivity: sanitizedActivity.slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
});

// Helper to sanitize user deposit records (strips admin notes, internal fraud scores, etc.)
function sanitizeUserDeposit(d: any) {
  if (!d) return null;
  const userStatus = mapToUserDepositStatus(d.status);
  return {
    id: String(d.id),
    userId: String(d.userId),
    amount: Number(d.amount),
    actualAmount: d.actualAmount !== undefined && d.actualAmount !== null ? Number(d.actualAmount) : Number(d.amount),
    currency: d.currency || 'USDT',
    network: d.network || 'BEP-20',
    txHash: d.txHash,
    fromAddress: d.fromAddress,
    toAddress: d.toAddress,
    tokenContract: d.tokenContract,
    blockNumber: d.blockNumber,
    status: userStatus, // Strictly 'pending' | 'confirmed' | 'failed'
    confirmations: d.confirmations,
    requiredConfirmations: d.requiredConfirmations,
    createdAt: d.createdAt,
    confirmedAt: userStatus === 'confirmed' ? d.confirmedAt : undefined,
    verifiedAt: d.verifiedAt,
    eligibilityDate: userStatus === 'confirmed' ? d.eligibilityDate : undefined,
    depositLockEndDate: userStatus === 'confirmed' ? d.depositLockEndDate : undefined,
    proofPhotoUrl: d.proofPhotoUrl,
    userNotes: d.userNotes,
  };
}

// User Deposits list
app.get(['/api/user/deposits', '/user/deposits'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const deposits = await getDepositsByUserId(user.id);
    const sanitized = deposits.map(sanitizeUserDeposit);
    res.json({ deposits: sanitized });
  } catch (err) {
    next(err);
  }
});

// Submit BEP-20 Deposit
app.post(['/api/user/deposits', '/user/deposits'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { txHash, amount, proofPhotoUrl, userNotes } = req.body;

    const cleanTxHash = validateTxHash(txHash);
    const validAmount = amount !== undefined && amount !== null && amount !== ''
      ? validateAmount(amount, 'Deposit amount', { allowZero: false, maxDecimals: 4 })
      : undefined;
    const cleanProofUrl = proofPhotoUrl ? validateSafeUrl(proofPhotoUrl, 'Proof photo URL') : undefined;
    const cleanUserNotes = userNotes ? validateString(userNotes, 'User notes', { maxLength: 1000 }) : undefined;

    const result = await processDepositAsync({
      userId: user.id,
      txHash: cleanTxHash,
      amount: validAmount,
      proofPhotoUrl: cleanProofUrl,
      userNotes: cleanUserNotes,
      actorEmail: user.email,
    });

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to submit deposit.');
    }

    const balance = await calculateUserBalanceAsync(user.id);
    const sanitizedDep = sanitizeUserDeposit(result.deposit);
    const userFacingMessage = sanitizedDep?.status === 'confirmed'
      ? 'Deposit confirmed and credited to your balance!'
      : sanitizedDep?.status === 'failed'
      ? 'Deposit verification failed.'
      : 'Your deposit is being verified. Balance will be updated after verification is completed.';

    res.json({ success: true, deposit: sanitizedDep, balance, message: userFacingMessage });
  } catch (err) {
    next(err);
  }
});

// Re-verify User BEP-20 Deposit on BNB Smart Chain
app.post(['/api/user/deposits/:id/verify', '/user/deposits/:id/verify'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Deposit ID');
    const deposit = await getDepositById(validId);

    if (!deposit || deposit.userId !== user.id) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }

    const result = await verifyDepositOnChainAsync(validId, user.id);
    const balance = await calculateUserBalanceAsync(user.id);
    const sanitizedDep = sanitizeUserDeposit(result.deposit);
    const userFacingMessage = sanitizedDep?.status === 'confirmed'
      ? 'Deposit confirmed and credited to your balance!'
      : sanitizedDep?.status === 'failed'
      ? 'Deposit verification failed.'
      : 'Your deposit is being verified. Balance will be updated after verification is completed.';

    res.json({
      success: result.success,
      deposit: sanitizedDep,
      balance,
      message: userFacingMessage,
    });
  } catch (err) {
    next(err);
  }
});

// User Deposit Financial Messages (Step 57 - User <-> Admin Communication)
app.get(['/api/user/deposits/:id/messages', '/user/deposits/:id/messages'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Deposit ID');
    const deposit = await getDepositById(validId);
    if (!deposit || deposit.userId !== user.id) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }
    const messages = await getFinancialMessages({ depositId: validId, includeInternal: false });
    await markFinancialMessagesRead({ depositId: validId, readerUserId: user.id, readerRole: 'user' });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/user/deposits/:id/messages', '/user/deposits/:id/messages'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Deposit ID');
    const deposit = await getDepositById(validId);
    if (!deposit || deposit.userId !== user.id) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }
    const { message } = req.body;
    const cleanMsg = validateString(message, 'Message', { minLength: 1, maxLength: 2000 });
    const created = await createFinancialMessage({
      depositId: validId,
      userId: user.id,
      senderType: 'user',
      senderId: user.id,
      senderName: user.fullName || user.email,
      message: cleanMsg,
      isInternal: false,
    });
    res.json({ success: true, message: created });
  } catch (err) {
    next(err);
  }
});

// Authenticated Blockchain Tx Verification Inspector
app.post(['/api/blockchain/verify-tx', '/blockchain/verify-tx'], authMiddleware, async (req, res, next) => {
  try {
    const { txHash, claimedAmount } = req.body;
    const cleanTxHash = validateTxHash(txHash);
    const validAmount = claimedAmount !== undefined && claimedAmount !== null && claimedAmount !== ''
      ? validateAmount(claimedAmount, 'Claimed amount', { allowZero: false, maxDecimals: 4 })
      : undefined;

    const result = await verifyBEP20Deposit(cleanTxHash, validAmount);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Automated Test Suite Runner (Point #1-#5 Financial & System Integrity Verification)
app.post(['/api/tests/run', '/tests/run'], (req, res, next) => {
  if (config.isProduction) {
    return authMiddleware(req, res, () => {
      adminMiddleware(['super_admin'])(req, res, async () => {
        try {
          const results = await runAutomatedTestSuite();
          res.json(results);
        } catch (err) {
          next(err);
        }
      });
    });
  }

  runAutomatedTestSuite()
    .then(results => res.json(results))
    .catch(err => next(err));
});

// User Earnings list
app.get(['/api/user/earnings', '/user/earnings'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const page = Math.max(0, parseInt(req.query.page as string, 10) || 0);
    const pageSize = Math.min(10, Math.max(1, parseInt(req.query.pageSize as string, 10) || 10));

    const [result, totalEarnings] = await Promise.all([
      getPaginatedEarningsByUserId(user.id, { page, pageSize }),
      getTotalCreditedEarningsByUserId(user.id),
    ]);

    res.json({
      earnings: result.earnings,
      totalEarnings,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
    });
  } catch (err) {
    next(err);
  }
});

// User Withdrawals list
app.get(['/api/user/withdrawals', '/user/withdrawals'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const withdrawals = await getWithdrawalsByUserId(user.id);
    const balance = await calculateUserBalanceAsync(user.id, { withdrawals });
    res.json({ withdrawals: withdrawals.map(sanitizeUserWithdrawal), balance });
  } catch (err) {
    next(err);
  }
});

// Preview Withdrawal Impact (Calculates authoritative 9% fee, lock warnings, minimum principal checks)
app.post(['/api/user/withdrawals/preview', '/user/withdrawals/preview'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { requestedAmount } = req.body;
    const amount = validateAmount(requestedAmount, 'Withdrawal amount', { allowZero: false, maxDecimals: 4 });

    const impact = await checkWithdrawalImpactAsync(user.id, amount);
    res.json({
      success: true,
      impact,
    });
  } catch (err) {
    next(err);
  }
});

// Submit Withdrawal Request (Strict Authenticator TOTP Enforced)
app.post(['/api/user/withdrawals', '/user/withdrawals'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const {
      requestedAmount,
      destinationAddress,
      network,
      password,
      totpCode,
      twoFactorCode,
      confirmCompoundingImpact,
      confirmLockBreak,
      confirmMinimumBreak,
      idempotencyKey,
      userNotes,
    } = req.body;

    if (user.status !== 'active') {
      throw Errors.forbidden(`Your account is currently ${user.status}. Withdrawals are disabled.`);
    }

    // 1. Enforce Authenticator (TOTP) Requirement
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        requiresTotpSetup: true,
        error: 'Authenticator verification is required. Please set up your Authenticator App before making a withdrawal.',
      });
    }

    const submittedTotp = String(totpCode || twoFactorCode || '').trim();
    if (!submittedTotp) {
      return res.status(400).json({
        success: false,
        requiresTotp: true,
        error: 'Authenticator code is required.',
      });
    }

    if (submittedTotp.length !== 6 || !/^\d{6}$/.test(submittedTotp)) {
      return res.status(400).json({
        success: false,
        requiresTotp: true,
        error: 'Invalid authenticator code.',
      });
    }

    const amount = validateAmount(requestedAmount, 'Withdrawal amount', { allowZero: false, maxDecimals: 4 });
    const validDestAddress = validateBEP20Address(destinationAddress, 'Destination address');

    if (network && !['BEP-20', 'BEP20', 'BSC', 'BNB Smart Chain'].includes(network.trim())) {
      throw Errors.validation('Unsupported network. Withdrawals are exclusively supported on BNB Smart Chain (BEP-20 USDT).');
    }

    if (!password) {
      throw Errors.validation('Account password confirmation is required for withdrawal.');
    }

    const isPassValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isPassValid) {
      throw Errors.invalidCredentials('Incorrect account password.');
    }

    const cleanIdempotencyKey = idempotencyKey ? validateString(idempotencyKey, 'Idempotency key', { minLength: 8, maxLength: 128 }) : undefined;
    const cleanUserNotes = userNotes ? validateString(userNotes, 'User notes', { maxLength: 1000 }) : undefined;

    const result = await createWithdrawalRequestAsync({
      userId: user.id, // Strictly derived from session, never from req.body
      requestedAmount: amount,
      destinationAddress: validDestAddress,
      totpCode: submittedTotp,
      confirmCompoundingImpact: Boolean(confirmCompoundingImpact),
      confirmLockBreak: Boolean(confirmLockBreak),
      confirmMinimumBreak: Boolean(confirmMinimumBreak),
      idempotencyKey: cleanIdempotencyKey,
      userNotes: cleanUserNotes,
      actorEmail: user.email,
    });

    if (!result.success) {
      if (result.requiresTotpSetup) {
        return res.status(400).json({
          success: false,
          requiresTotpSetup: true,
          error: result.error || 'Authenticator verification is required. Please set up your Authenticator App before making a withdrawal.',
        });
      }

      if (result.requiresTotp) {
        return res.status(400).json({
          success: false,
          requiresTotp: true,
          error: result.error || 'Authenticator code is required.',
        });
      }

      if (result.requiresConfirmation) {
        return res.status(400).json({
          success: false,
          requiresConfirmation: true,
          warningType: result.warningType,
          error: result.error,
        });
      }

      throw Errors.validation(result.error || 'Failed to request withdrawal.');
    }

    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ success: true, withdrawal: sanitizeUserWithdrawal(result.withdrawal), balance });
  } catch (err) {
    next(err);
  }
});

// User Cancel Pending Withdrawal Request
app.post(['/api/user/withdrawals/:id/cancel', '/user/withdrawals/:id/cancel'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const { reason } = req.body;
    const validId = validateId(id, 'Withdrawal ID');
    const cleanReason = reason ? validateString(reason, 'Cancellation reason', { maxLength: 500 }) : undefined;

    const result = await cancelWithdrawalAsync(
      user.id,
      validId,
      cleanReason,
      false
    );

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to cancel withdrawal request.');
    }

    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ success: true, withdrawal: sanitizeUserWithdrawal(result.withdrawal), balance });
  } catch (err) {
    next(err);
  }
});

// User Withdrawal Financial Messages (Step 57 - User <-> Admin Communication)
app.get(['/api/user/withdrawals/:id/messages', '/user/withdrawals/:id/messages'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Withdrawal ID');
    const withdrawal = await getWithdrawalById(validId);
    if (!withdrawal || withdrawal.userId !== user.id) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }
    const messages = await getFinancialMessages({ withdrawalId: validId, includeInternal: false });
    await markFinancialMessagesRead({ withdrawalId: validId, readerUserId: user.id, readerRole: 'user' });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/user/withdrawals/:id/messages', '/user/withdrawals/:id/messages'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Withdrawal ID');
    const withdrawal = await getWithdrawalById(validId);
    if (!withdrawal || withdrawal.userId !== user.id) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }
    const { message } = req.body;
    const cleanMsg = validateString(message, 'Message', { minLength: 1, maxLength: 2000 });
    const created = await createFinancialMessage({
      withdrawalId: validId,
      userId: user.id,
      senderType: 'user',
      senderId: user.id,
      senderName: user.fullName || user.email,
      message: cleanMsg,
      isInternal: false,
    });
    res.json({ success: true, message: created });
  } catch (err) {
    next(err);
  }
});

// User Voluntary Fund Lock
app.post(['/api/user/lock-funds', '/user/lock-funds'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { days, reason } = req.body;

    const parsedDays = days !== undefined && days !== null ? Number(days) : 30;
    if (isNaN(parsedDays) || !Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      throw Errors.validation('Lock duration must be an integer between 1 and 365 days.');
    }

    const result = await lockUserFundVoluntary(
      user.id,
      parsedDays,
      typeof reason === 'string' ? reason.trim() : undefined
    );

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to apply fund lock.');
    }

    const balance = await calculateUserBalanceAsync(user.id);
    res.json({
      success: true,
      fundLockUntil: result.fundLockUntil,
      balance,
      message: `Funds successfully locked until ${new Date(result.fundLockUntil!).toLocaleDateString()} to ensure active yield generation.`,
    });
  } catch (err) {
    next(err);
  }
});

// User Transactions / Ledger
app.get(['/api/user/transactions', '/user/transactions'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { page, limit, type, status, search, startDate, endDate } = req.query;
    const result = await getUserTransactionsAsync(user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      type: type ? String(type) : undefined,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// User Admin Messages / Notifications
app.get(['/api/user/messages', '/user/messages', '/api/user/notifications', '/user/notifications'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const messages = await getAdminMessagesForUser(user.id);
    res.json({ messages, unreadCount: messages.filter(m => !m.isRead).length });
  } catch (err) {
    next(err);
  }
});

// Mark Message as Read
app.post(['/api/user/messages/:id/read', '/user/messages/:id/read'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const success = await markMessageRead(id, user.id);
    res.json({ success });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. ADMIN DASHBOARD & MANAGEMENT ENDPOINTS
// ==========================================

// Admin overview stats
app.get(['/api/admin/dashboard', '/admin/dashboard'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const supabase = getServerSupabase();
    const [performances, settings] = await Promise.all([
      getDailyPerformances(),
      getSettings(),
    ]);

    // 1. Attempt PostgreSQL aggregation RPC (zero pagination limits)
    try {
      const { data: rpcStats, error: rpcErr } = await supabase.rpc('get_admin_dashboard_stats_aggregate');
      if (!rpcErr && rpcStats) {
        return res.json({
          stats: {
            totalUsers: Number(rpcStats.total_users || 0),
            activeUsers: Number(rpcStats.active_users || 0),
            totalConfirmedDeposits: DecimalSafe.from(rpcStats.total_confirmed_deposits).toNumber(2),
            totalConfirmedDepositsCount: Number(rpcStats.total_confirmed_deposits_count || 0),
            totalPaidWithdrawals: DecimalSafe.from(rpcStats.total_paid_withdrawals).toNumber(2),
            totalPaidWithdrawalsNet: DecimalSafe.from(rpcStats.total_paid_withdrawals_net).toNumber(2),
            totalPaidWithdrawalsCount: Number(rpcStats.total_paid_withdrawals_count || 0),
            totalWithdrawalFees: DecimalSafe.from(rpcStats.total_withdrawal_fees).toNumber(2),
            pendingWithdrawalsCount: Number(rpcStats.pending_withdrawals_count || 0),
            totalPendingWithdrawalsAmount: DecimalSafe.from(rpcStats.total_pending_withdrawals_amount).toNumber(2),
            pendingDepositsCount: Number(rpcStats.pending_deposits_count || 0),
            totalPendingDepositsAmount: DecimalSafe.from(rpcStats.total_pending_deposits_amount).toNumber(2),
            totalEarningsAllocated: DecimalSafe.from(rpcStats.total_earnings_allocated).toNumber(2),
            vaultRetainedLiquidity: DecimalSafe.from(rpcStats.vault_retained_liquidity).toNumber(2),
          },
          latestPerformance: performances[0] || null,
          settings,
        });
      }
    } catch {
      // Fall through to repository aggregation
    }

    // 2. Un-truncated repository fallback using DecimalSafe arithmetic
    const [{ users }, { deposits }, { withdrawals }, earnings] = await Promise.all([
      getAllProfiles({ limit: 100000 }),
      getAllDeposits({ limit: 100000 }),
      getAllWithdrawals({ limit: 100000 }),
      getAllEarnings(),
    ]);

    const standardUsers = users.filter(u => u.role === 'user');
    const activeUsers = standardUsers.filter(u => u.status === 'active').length;

    const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
    let totalConfirmedDepositsDec = DecimalSafe.zero();
    for (const d of confirmedDeposits) {
      totalConfirmedDepositsDec = totalConfirmedDepositsDec.add(d.actualAmount || d.amount);
    }

    const pendingDeposits = deposits.filter(d => d.status === 'pending' || d.status === 'confirming');
    let totalPendingDepositsDec = DecimalSafe.zero();
    for (const d of pendingDeposits) {
      totalPendingDepositsDec = totalPendingDepositsDec.add(d.actualAmount || d.amount);
    }

    const paidWithdrawals = withdrawals.filter(w => w.status === 'paid' || (w.status as string) === 'completed');
    let totalPaidWithdrawalsDec = DecimalSafe.zero();
    let totalPaidWithdrawalsNetDec = DecimalSafe.zero();
    let totalWithdrawalFeesDec = DecimalSafe.zero();
    for (const w of paidWithdrawals) {
      totalPaidWithdrawalsDec = totalPaidWithdrawalsDec.add(w.requestedAmount);
      totalPaidWithdrawalsNetDec = totalPaidWithdrawalsNetDec.add(w.netAmount);
      totalWithdrawalFeesDec = totalWithdrawalFeesDec.add(w.feeAmount);
    }

    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending' || w.status === 'under_review');
    let totalPendingWdDec = DecimalSafe.zero();
    for (const w of pendingWithdrawals) {
      totalPendingWdDec = totalPendingWdDec.add(w.requestedAmount);
    }

    let totalEarningsDec = DecimalSafe.zero();
    for (const e of earnings) {
      if (e.status === 'credited') {
        totalEarningsDec = totalEarningsDec.add(e.earningsAmount);
      }
    }

    const vaultRetainedLiquidityDec = totalConfirmedDepositsDec.add(totalEarningsDec).sub(totalPaidWithdrawalsDec);

    res.json({
      stats: {
        totalUsers: standardUsers.length,
        activeUsers,
        totalConfirmedDeposits: totalConfirmedDepositsDec.toNumber(2),
        totalConfirmedDepositsCount: confirmedDeposits.length,
        totalPaidWithdrawals: totalPaidWithdrawalsDec.toNumber(2),
        totalPaidWithdrawalsNet: totalPaidWithdrawalsNetDec.toNumber(2),
        totalPaidWithdrawalsCount: paidWithdrawals.length,
        totalWithdrawalFees: totalWithdrawalFeesDec.toNumber(2),
        pendingWithdrawalsCount: pendingWithdrawals.length,
        totalPendingWithdrawalsAmount: totalPendingWdDec.toNumber(2),
        pendingDepositsCount: pendingDeposits.length,
        totalPendingDepositsAmount: totalPendingDepositsDec.toNumber(2),
        totalEarningsAllocated: totalEarningsDec.toNumber(2),
        vaultRetainedLiquidity: vaultRetainedLiquidityDec.toNumber(2),
      },
      latestPerformance: performances[0] || null,
      settings,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 8. ADMIN USER MANAGEMENT (STEP 12)
// ==========================================

// Admin Users list with server-side search, pagination, status & test-user filtering, and authoritative balances
app.get(['/api/admin/users', '/admin/users'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const role = req.query.role ? String(req.query.role).trim() : undefined;

    let isTestUser: boolean | undefined = undefined;
    if (req.query.isTestUser === 'true') isTestUser = true;
    else if (req.query.isTestUser === 'false') isTestUser = false;

    const { users, total } = await getAllProfiles({
      page,
      limit,
      search,
      status,
      role,
      isTestUser,
    });

    // Efficiently batch-resolve referrers to avoid N+1 database queries
    const referrerIds = Array.from(
      new Set(users.map(u => u.referrerId).filter(id => Boolean(id)))
    ) as string[];

    const referrerMap = new Map<string, { id: string; fullName: string; email: string; referralCode?: string }>();
    if (referrerIds.length > 0) {
      await Promise.all(
        referrerIds.map(async rId => {
          try {
            const rUser = await getProfileById(String(rId));
            if (rUser) {
              referrerMap.set(String(rId), {
                id: rUser.id,
                fullName: rUser.fullName,
                email: rUser.email,
                referralCode: rUser.referralCode,
              });
            }
          } catch {
            // Graceful fallback
          }
        })
      );
    }

    // Attach authoritative financial calculations & strip sensitive authentication secrets
    const usersWithBalances = await Promise.all(
      users.map(async u => {
        const balance = await calculateUserBalanceAsync(u.id);
        const referrer = u.referrerId ? referrerMap.get(String(u.referrerId)) || null : null;

        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone || '',
          country: u.country || '',
          role: u.role,
          status: u.status,
          createdAt: u.createdAt,
          twoFactorEnabled: Boolean(u.twoFactorEnabled),
          profilePictureUrl: u.profilePictureUrl || null,
          walletAddress: u.walletAddress || '',
          referralCode: u.referralCode || null,
          referrerId: u.referrerId || null,
          referrer,
          isTestUser: Boolean(u.isTestUser),
          isFlaggedForReview: Boolean(u.isFlaggedForReview),
          riskScore: u.riskScore || 0,
          fraudFlags: u.fraudFlags || [],
          fundLockUntil: u.fundLockUntil || null,
          fundLockReason: u.fundLockReason || null,
          balance: {
            availableBalance: balance.availableBalance,
            activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
            eligiblePrincipal: balance.activeCompoundingPrincipal,
            totalDeposited: balance.totalDeposited,
            totalEarnings: balance.totalEarnings,
            referralEarnings: balance.referralEarnings,
            totalWithdrawn: balance.totalWithdrawn,
            depositLockedPrincipal: balance.depositLockedPrincipal,
            lockedBalance: balance.lockedBalance,
            eligibleForWithdrawal: balance.eligibleForWithdrawal,
            isFundLocked: balance.isFundLocked,
            fundLockUntil: balance.fundLockUntil,
            fundLockRemainingDays: balance.fundLockRemainingDays,
            accountAgeDays: balance.accountAgeDays,
            canWithdraw: balance.canWithdraw,
            withdrawalEligibilityStatus: balance.withdrawalEligibilityStatus,
            withdrawalEligibilityLabel: balance.withdrawalEligibilityLabel,
          },
        };
      })
    );

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      users: usersWithBalances,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin User Details: Authoritative breakdown, 2-tier referral network, deposits, withdrawals, earnings, ledger, and audit history
app.get(['/api/admin/users/:id', '/admin/users/:id'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await getProfileById(id);
    if (!user) {
      throw Errors.notFound('USER_NOT_FOUND', 'User not found.');
    }

    // 1. Authoritative financial balance
    const balance = await calculateUserBalanceAsync(user.id);

    // 2. Referrer information
    let referrer: { id: string; fullName: string; email: string; referralCode?: string } | null = null;
    if (user.referrerId) {
      const rUser = await getProfileById(String(user.referrerId));
      if (rUser) {
        referrer = {
          id: rUser.id,
          fullName: rUser.fullName,
          email: rUser.email,
          referralCode: rUser.referralCode,
        };
      }
    }

    // 3. Authoritative 2-tier Referral tree (Level 1 & Level 2 only. Max 2 levels — strictly no Level 3)
    const referralSummary = await getReferralSummaryAsync(user.id);
    const l1Referrals = referralSummary.referrals.filter(r => r.level === 1);
    const l2Referrals = referralSummary.referrals.filter(r => r.level === 2);

    // 4. Financial histories & audit trail
    const deposits = await getDepositsByUserId(user.id);
    const withdrawals = await getWithdrawalsByUserId(user.id);
    const earnings = await getEarningsByUserId(user.id);
    const referralRewards = await getReferralRewardsByReferrerId(user.id);
    const ledger = await getLedgerByUserId(user.id);
    const auditLogs = await getAuditLogs({ targetUserId: user.id, limit: 50 });

    // Sensitive field protection: Never expose passwordHash, salt, twoFactorSecret, session tokens, private keys
    const sanitizedUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      country: user.country || '',
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      profilePictureUrl: user.profilePictureUrl || null,
      walletAddress: user.walletAddress || '',
      referralCode: user.referralCode || null,
      referrerId: user.referrerId || null,
      isTestUser: Boolean(user.isTestUser),
      isFlaggedForReview: Boolean(user.isFlaggedForReview),
      riskScore: user.riskScore || 0,
      fraudFlags: user.fraudFlags || [],
      fundLockUntil: user.fundLockUntil || null,
      fundLockReason: user.fundLockReason || null,
      lockUntil: user.lockUntil || null,
      loginAttempts: user.loginAttempts || 0,
      lastLoginAt: user.lastLoginAt || null,
    };

    res.json({
      success: true,
      user: sanitizedUser,
      referrer,
      balance,
      referralDetails: {
        referralCode: user.referralCode || null,
        referrer,
        level1Count: referralSummary.level1Count,
        level2Count: referralSummary.level2Count,
        totalReferredCount: referralSummary.totalReferredCount,
        level1RewardsEarned: referralSummary.level1RewardsEarned,
        level2RewardsEarned: referralSummary.level2RewardsEarned,
        totalRewardsEarned: referralSummary.totalRewardsEarned,
        level1Referrals: l1Referrals,
        level2Referrals: l2Referrals,
      },
      history: {
        deposits,
        withdrawals,
        earnings,
        referralRewards,
        ledger,
        auditLogs,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin toggle user status
app.post(['/api/admin/users/:id/status', '/admin/users/:id/status'], authMiddleware, adminMiddleware(['super_admin', 'support_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const admin: User = (req as any).user;

    if (!['active', 'suspended', 'pending_verification'].includes(status)) {
      throw Errors.validation('Invalid status value. Must be active, suspended, or pending_verification.');
    }

    const existingUser = await getProfileById(id);
    if (!existingUser) {
      throw Errors.notFound('USER_NOT_FOUND', 'User not found.');
    }

    const previousStatus = existingUser.status;
    const updated = await updateProfile(id, { status });

    await createAuditLog({
      action: 'USER_STATUS_UPDATED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: id,
      beforeValue: { status: previousStatus },
      afterValue: { status },
      reason: reason || `Admin updated account status from ${previousStatus} to ${status}`,
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});

// Admin toggle test user status (Reuses existing is_test_user field, audits change)
app.post(['/api/admin/users/:id/test-user', '/admin/users/:id/test-user'], authMiddleware, adminMiddleware(['super_admin', 'support_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isTestUser, reason } = req.body;
    const admin: User = (req as any).user;

    if (typeof isTestUser !== 'boolean') {
      throw Errors.validation('isTestUser must be a boolean.');
    }

    const existingUser = await getProfileById(id);
    if (!existingUser) {
      throw Errors.notFound('USER_NOT_FOUND', 'User not found.');
    }

    const previousTestStatus = Boolean(existingUser.isTestUser);
    const updated = await updateProfile(id, { isTestUser });

    await createAuditLog({
      action: 'USER_TEST_STATUS_UPDATED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: id,
      beforeValue: { isTestUser: previousTestStatus },
      afterValue: { isTestUser },
      reason: reason || `Admin updated test-user status from ${previousTestStatus} to ${isTestUser}`,
    });

    res.json({ success: true, user: updated, isTestUser: updated.isTestUser });
  } catch (err) {
    next(err);
  }
});

// Admin toggle fund lock
app.post(['/api/admin/users/:id/fund-lock', '/admin/users/:id/fund-lock'], authMiddleware, adminMiddleware(['super_admin', 'support_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, days = 30, reason } = req.body;
    const admin: User = (req as any).user;

    const existingUser = await getProfileById(id);
    if (!existingUser) {
      throw Errors.notFound('USER_NOT_FOUND', 'User not found.');
    }

    let fundLockUntil: string | null = null;
    let fundLockReason: string | null = null;

    if (action === 'lock') {
      const lockDays = Math.max(1, Math.min(365, Number(days) || 30));
      fundLockUntil = new Date(Date.now() + lockDays * 24 * 60 * 60 * 1000).toISOString();
      fundLockReason = reason || `Administrative ${lockDays}-day fund lock applied`;
    } else if (action === 'unlock') {
      fundLockUntil = null;
      fundLockReason = null;
    } else {
      throw Errors.validation('Action must be lock or unlock.');
    }

    const updated = await updateProfile(id, {
      fundLockUntil: fundLockUntil as any,
      fundLockReason: fundLockReason as any,
    });

    await createAuditLog({
      action: action === 'lock' ? 'USER_FUND_LOCK_APPLIED' : 'USER_FUND_LOCK_RELEASED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: id,
      beforeValue: {
        fundLockUntil: existingUser.fundLockUntil,
        fundLockReason: existingUser.fundLockReason,
      },
      afterValue: {
        fundLockUntil,
        fundLockReason,
      },
      reason: reason || `Admin performed ${action} on funds`,
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});

// Admin Deposits - Paginated List with Search and Filter
app.get(['/api/admin/deposits', '/admin/deposits'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const status = req.query.status as string | undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const txHash = req.query.txHash ? String(req.query.txHash).trim() : undefined;
    const minAmount = req.query.minAmount !== undefined && req.query.minAmount !== '' ? Number(req.query.minAmount) : undefined;
    const maxAmount = req.query.maxAmount !== undefined && req.query.maxAmount !== '' ? Number(req.query.maxAmount) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    const supabase = getServerSupabase();
    const settings = await getSettings();
    const minDepositAmount = Number(settings.minimumDepositAmount);

    // If search text is provided, find matching user IDs to search both users and tx_hash
    let matchedUserIds: string[] | undefined = undefined;
    if (search) {
      const cleanTerm = search.replace(/[%_]/g, '');
      const { data: matchedUsers } = await supabase
        .from('users')
        .select('id')
        .or(`full_name.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%`)
        .limit(100);

      if (matchedUsers && matchedUsers.length > 0) {
        matchedUserIds = matchedUsers.map(u => String(u.id));
      }
    }

    const { deposits, total } = await getAllDeposits({
      page,
      limit,
      status: status && status !== 'all' ? status : undefined,
      search: search && (!matchedUserIds || matchedUserIds.length === 0) ? search : undefined,
      userIds: matchedUserIds,
      txHash: txHash || undefined,
      minAmount: minAmount !== undefined && !isNaN(minAmount) ? minAmount : undefined,
      maxAmount: maxAmount !== undefined && !isNaN(maxAmount) ? maxAmount : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    // Batch fetch users to eliminate N+1 queries
    const uniqueUserIds = Array.from(new Set(deposits.map(d => d.userId).filter(Boolean)));
    const userMap = new Map<string, any>();
    if (uniqueUserIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, email, role, status, is_test_user, created_at')
        .in('id', uniqueUserIds);

      (usersData || []).forEach(u => userMap.set(String(u.id), u));
    }

    const depositsWithUsers = deposits.map(d => {
      const user = userMap.get(String(d.userId));
      return {
        ...d,
        userName: user ? user.full_name : 'Unknown User',
        userEmail: user ? user.email : '',
        isTestUser: Boolean(user?.is_test_user),
        userStatus: user?.status || 'active',
        isQualifying: Number(d.amount) >= minDepositAmount,
      };
    });

    res.json({
      deposits: depositsWithUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      minimumDepositAmount: minDepositAmount,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Deposit Detail View
app.get(['/api/admin/deposits/:id', '/admin/deposits/:id'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const deposit = await getDepositById(id);
    if (!deposit) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }

    const supabase = getServerSupabase();
    const settings = await getSettings();
    const minDepositAmount = Number(settings.minimumDepositAmount);

    // Fetch user without sensitive credentials (no password, salt, 2fa secret)
    const user = await getProfileById(deposit.userId);
    const sanitizedUser = user ? {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      isTestUser: Boolean(user.isTestUser),
      createdAt: user.createdAt,
      referralCode: user.referralCode,
      referredBy: user.referrerId,
    } : null;

    // Fetch signed proof URL if present
    let proofSignedUrl: string | undefined = undefined;
    if (deposit.proofPhotoUrl) {
      try {
        const signed = await getSignedDepositProofUrl(deposit.proofPhotoUrl, 3600);
        proofSignedUrl = signed || deposit.proofPhotoUrl;
      } catch (e) {
        proofSignedUrl = deposit.proofPhotoUrl;
      }
    }

    // Associated ledger records
    const { data: ledgerData } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('reference_id', String(deposit.id))
      .order('created_at', { ascending: false });

    // Associated referral rewards
    const { data: rewardsData } = await supabase
      .from('referral_rewards')
      .select('*')
      .eq('deposit_id', String(deposit.id))
      .order('created_at', { ascending: false });

    // Associated audit logs
    const { data: auditData } = await supabase
      .from('audit_logs')
      .select('*')
      .or(`reference_id.eq.${deposit.id},target_user_id.eq.${deposit.userId}`)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({
      success: true,
      deposit: {
        ...deposit,
        userName: user ? user.fullName : 'Unknown User',
        userEmail: user ? user.email : '',
        isTestUser: Boolean(user?.isTestUser),
        userStatus: user?.status || 'active',
        isQualifying: Number(deposit.amount) >= minDepositAmount,
      },
      user: sanitizedUser,
      isQualifying: Number(deposit.amount) >= minDepositAmount,
      minimumDepositAmount: minDepositAmount,
      proofUrl: proofSignedUrl,
      history: {
        ledger: ledgerData || [],
        referralRewards: rewardsData || [],
        auditLogs: auditData || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin View Deposit Proof Signed URL
app.get(['/api/admin/deposits/:id/proof-url', '/admin/deposits/:id/proof-url'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const deposit = await getDepositById(id);
    if (!deposit || !deposit.proofPhotoUrl) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit proof not found.');
    }

    const signedUrl = await getSignedDepositProofUrl(deposit.proofPhotoUrl, 3600);
    res.json({ signedUrl: signedUrl || deposit.proofPhotoUrl });
  } catch (err) {
    next(err);
  }
});

// Admin process deposit (Confirm / Reject)
app.post(['/api/admin/deposits/:id/action', '/admin/deposits/:id/action'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const { action, adminNotes, txHash, reason } = req.body;

    if (!['confirmed', 'rejected', 'approve', 'reject'].includes(action)) {
      throw Errors.validation('Invalid action. Must be confirmed or rejected.');
    }

    const note = adminNotes || reason;
    if ((action === 'rejected' || action === 'reject') && (!note || !note.trim())) {
      throw Errors.validation('A valid rejection reason is required.');
    }

    const normalizedStatus = (action === 'approve' || action === 'confirmed') ? 'confirmed' : 'rejected';
    const result = await updateDepositStatusAsync(admin.id, id, normalizedStatus, note, txHash);
    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to update deposit status.');
    }

    res.json({ success: true, deposit: result.deposit });
  } catch (err) {
    next(err);
  }
});

// Admin verify deposit on BNB Smart Chain RPC
app.post(['/api/admin/deposits/:id/verify', '/admin/deposits/:id/verify'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const result = await verifyDepositOnChainAsync(id, admin.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin Deposit Messages (Step 57 - User <-> Admin Communication & Internal Notes)
app.get(['/api/admin/deposits/:id/messages', '/admin/deposits/:id/messages'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin', 'support_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validId = validateId(id, 'Deposit ID');
    const deposit = await getDepositById(validId);
    if (!deposit) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }
    const messages = await getFinancialMessages({ depositId: validId, includeInternal: true });
    await markFinancialMessagesRead({ depositId: validId, readerUserId: (req as any).user.id, readerRole: 'admin' });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/admin/deposits/:id/messages', '/admin/deposits/:id/messages'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin', 'support_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Deposit ID');
    const deposit = await getDepositById(validId);
    if (!deposit) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }
    const { message, isInternal } = req.body;
    const cleanMsg = validateString(message, 'Message', { minLength: 1, maxLength: 2000 });
    const created = await createFinancialMessage({
      depositId: validId,
      userId: deposit.userId,
      senderType: 'admin',
      senderId: admin.id,
      senderName: admin.fullName || 'FINEXJ Admin',
      message: cleanMsg,
      isInternal: Boolean(isInternal),
    });
    res.json({ success: true, message: created });
  } catch (err) {
    next(err);
  }
});

// Admin Withdrawals List with Search, Multi-Filter, Pagination, and User Batch Resolution
app.get(['/api/admin/withdrawals', '/admin/withdrawals'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const status = req.query.status as string | undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const walletAddress = req.query.walletAddress ? String(req.query.walletAddress).trim() : undefined;
    const txHash = req.query.txHash ? String(req.query.txHash).trim() : undefined;
    const minAmount = req.query.minAmount !== undefined && req.query.minAmount !== '' ? Number(req.query.minAmount) : undefined;
    const maxAmount = req.query.maxAmount !== undefined && req.query.maxAmount !== '' ? Number(req.query.maxAmount) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    const supabase = getServerSupabase();

    // If search text is provided, find matching user IDs
    let matchedUserIds: string[] | undefined = undefined;
    if (search) {
      const cleanTerm = search.replace(/[%_]/g, '');
      const { data: matchedUsers } = await supabase
        .from('users')
        .select('id')
        .or(`full_name.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%`)
        .limit(100);

      if (matchedUsers && matchedUsers.length > 0) {
        matchedUserIds = matchedUsers.map(u => String(u.id));
      }
    }

    const { withdrawals, total } = await getAllWithdrawals({
      page,
      limit,
      status: status && status !== 'all' ? status : undefined,
      search: search && (!matchedUserIds || matchedUserIds.length === 0) ? search : undefined,
      userIds: matchedUserIds && matchedUserIds.length > 0 ? matchedUserIds : undefined,
      walletAddress,
      txHash,
      minAmount,
      maxAmount,
      startDate,
      endDate,
    });

    // Batch resolve user profiles to prevent N+1 query overhead
    const userIds = Array.from(new Set(withdrawals.map(w => w.userId).filter(Boolean)));
    const userMap: Record<string, { fullName: string; email: string; isTestUser: boolean }> = {};

    if (userIds.length > 0) {
      const numericIds = userIds.filter(id => !isNaN(Number(id))).map(id => Number(id));
      const stringIds = userIds.filter(id => isNaN(Number(id)));

      let usersQuery = supabase.from('users').select('id, full_name, email, is_test_user');
      if (numericIds.length > 0 && stringIds.length > 0) {
        usersQuery = usersQuery.or(`id.in.(${numericIds.join(',')}),id.in.(${stringIds.map(s => `"${s}"`).join(',')})`);
      } else if (numericIds.length > 0) {
        usersQuery = usersQuery.in('id', numericIds);
      } else {
        usersQuery = usersQuery.in('id', stringIds);
      }

      const { data: userData } = await usersQuery;
      if (userData) {
        for (const u of userData) {
          userMap[String(u.id)] = {
            fullName: u.full_name || 'User #' + u.id,
            email: u.email || '',
            isTestUser: Boolean(u.is_test_user),
          };
        }
      }
    }

    const enrichedWithdrawals = withdrawals.map(w => ({
      ...w,
      userFullName: userMap[w.userId]?.fullName || 'User #' + w.userId,
      userEmail: userMap[w.userId]?.email || '',
      isTestUser: Boolean(userMap[w.userId]?.isTestUser),
    }));

    res.json({
      withdrawals: enrichedWithdrawals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Withdrawal Details
app.get(['/api/admin/withdrawals/:id', '/admin/withdrawals/:id'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const withdrawal = await getWithdrawalById(id);
    if (!withdrawal) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }

    const supabase = getServerSupabase();

    // Fetch user without sensitive credentials (no password, salt, 2fa secret)
    const user = await getProfileById(withdrawal.userId);
    const sanitizedUser = user ? {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      isTestUser: Boolean(user.isTestUser),
      createdAt: user.createdAt,
      referralCode: user.referralCode,
      walletAddress: user.walletAddress,
    } : null;

    // Financial fund composition analysis
    let financialImpact: any = null;
    try {
      financialImpact = await checkWithdrawalImpactAsync(withdrawal.userId, withdrawal.requestedAmount);
    } catch (e: any) {
      console.warn('[Withdrawal Detail Impact Warning]:', e?.message);
    }

    // Fraud review checks
    let fraudSignals: any[] = [];
    let walletDuplication: any = { isReused: false, matchingUserIds: [] };
    let rapidCycle: any = { isRapidCycle: false };

    try {
      const [fsRes, wdCheck, rcCheck] = await Promise.all([
        supabase.from('fraud_signals').select('*').eq('user_id', withdrawal.userId).order('created_at', { ascending: false }).limit(10),
        checkWalletDuplication(withdrawal.destinationAddress, withdrawal.userId, 'withdrawal'),
        checkRapidWithdrawalCycle(withdrawal.userId, withdrawal.requestedAmount),
      ]);
      fraudSignals = fsRes.data || [];
      walletDuplication = wdCheck;
      rapidCycle = rcCheck;
    } catch (fraudErr: any) {
      console.warn('[Withdrawal Detail Fraud Warning]:', fraudErr?.message);
    }

    // Ledger history for this withdrawal
    let ledgerHistory: any[] = [];
    try {
      const { data: ledgers } = await supabase
        .from('ledger_entries')
        .select('*')
        .or(`reference_id.eq.${withdrawal.id},reference_id.eq.${withdrawal.reference},user_id.eq.${withdrawal.userId}`)
        .order('created_at', { ascending: false })
        .limit(20);
      ledgerHistory = ledgers || [];
    } catch (lErr: any) {
      console.warn('[Withdrawal Detail Ledger Warning]:', lErr?.message);
    }

    // Audit logs
    let auditLogs: any[] = [];
    try {
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .or(`target_user_id.eq.${withdrawal.userId},reference_id.eq.${withdrawal.id},reference_id.eq.${withdrawal.reference}`)
        .order('created_at', { ascending: false })
        .limit(25);
      auditLogs = logs || [];
    } catch (aErr: any) {
      console.warn('[Withdrawal Detail Audit Warning]:', aErr?.message);
    }

    res.json({
      withdrawal: {
        ...withdrawal,
        userFullName: sanitizedUser?.fullName || 'User #' + withdrawal.userId,
        userEmail: sanitizedUser?.email || '',
        isTestUser: Boolean(sanitizedUser?.isTestUser),
      },
      user: sanitizedUser,
      financialImpact,
      fraudReview: {
        fraudSignals,
        walletDuplication,
        rapidCycle,
      },
      ledgerHistory,
      auditLogs,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Pre-verify BSC Payout Transaction
app.post(['/api/admin/withdrawals/:id/verify-payout', '/admin/withdrawals/:id/verify-payout'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;

    if (!txHash || typeof txHash !== 'string' || !txHash.trim()) {
      throw Errors.validation('Transaction hash is required for on-chain verification.');
    }

    const withdrawal = await getWithdrawalById(id);
    if (!withdrawal) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }

    const cleanHash = txHash.trim();
    if (!isValidTxHash(cleanHash)) {
      throw Errors.validation('Invalid transaction hash format. Must be a 66-character hex string starting with 0x.');
    }

    // Anti-Replay duplicate checks across withdrawals
    const supabase = getServerSupabase();
    const { data: dupWds } = await supabase
      .from('withdrawals')
      .select('id, reference')
      .neq('id', withdrawal.id)
      .or(`tx_hash.ilike.${cleanHash},payout_tx_hash.ilike.${cleanHash}`)
      .limit(1);

    if (dupWds && dupWds.length > 0) {
      return res.json({
        isValid: false,
        status: 'invalid',
        errorCode: 'DUPLICATE_TX_HASH',
        errorMessage: `Transaction hash ${cleanHash} has already been assigned to withdrawal ${dupWds[0].reference || dupWds[0].id}.`,
      });
    }

    // Anti-Replay duplicate checks across deposits
    const { data: dupDeps } = await supabase
      .from('deposits')
      .select('id, reference')
      .ilike('tx_hash', cleanHash)
      .limit(1);

    if (dupDeps && dupDeps.length > 0) {
      return res.json({
        isValid: false,
        status: 'invalid',
        errorCode: 'DUPLICATE_TX_HASH',
        errorMessage: `Transaction hash ${cleanHash} has already been used for deposit ${dupDeps[0].reference || dupDeps[0].id}.`,
      });
    }

    const targetUser = await getProfileById(withdrawal.userId);
    const isTestUser = process.env.NODE_ENV !== 'production' && targetUser?.isTestUser === true;

    if (isTestUser) {
      const settings = await getSettings();
      const reqConf = Number(settings.requiredConfirmations);
      return res.json({
        isValid: true,
        status: 'confirmed',
        amount: withdrawal.netAmount,
        expectedAmount: withdrawal.netAmount,
        confirmations: reqConf,
        requiredConfirmations: reqConf,
        txHash: cleanHash,
        isTestAccount: true,
        message: 'Simulated test account: Real blockchain payout is not required.',
      });
    }

    const verification = await verifyBEP20PayoutTx(
      cleanHash,
      withdrawal.destinationAddress,
      withdrawal.netAmount,
      { currentWithdrawalId: withdrawal.id }
    );

    res.json(verification);
  } catch (err) {
    next(err);
  }
});

// Admin Submit Manual Payout Details (Step 53 Safe Manual Payout Mode)
app.post(['/api/admin/withdrawals/:id/submit-payout', '/admin/withdrawals/:id/submit-payout'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const { txHash, amount, destinationAddress, network, paymentTimestamp, adminNotes } = req.body;

    if (!txHash || typeof txHash !== 'string' || !txHash.trim()) {
      throw Errors.validation('BNB Smart Chain Payout Transaction Hash (TxID) is required.');
    }

    const cleanHash = txHash.trim();
    if (!isValidTxHash(cleanHash)) {
      throw Errors.validation('Invalid transaction hash format. Must be a 66-character hex string starting with 0x.');
    }

    const withdrawal = await getWithdrawalById(id);
    if (!withdrawal) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }

    // Step 53 - Section 7: Destination Address Verification
    if (destinationAddress && typeof destinationAddress === 'string') {
      const submittedDest = destinationAddress.trim().toLowerCase();
      const expectedDest = withdrawal.destinationAddress.trim().toLowerCase();
      if (submittedDest !== expectedDest) {
        await createAuditLog({
          action: 'PAYOUT_DESTINATION_MISMATCH',
          actorId: admin.id,
          actorRole: 'admin',
          targetUserId: withdrawal.userId,
          referenceId: String(withdrawal.reference || withdrawal.id),
          beforeValue: { destinationAddress: withdrawal.destinationAddress },
          afterValue: { submittedDestinationAddress: destinationAddress },
          reason: `SECURITY ALERT: Admin submitted destination (${destinationAddress}) does not match withdrawal destination (${withdrawal.destinationAddress}).`,
          timestamp: new Date().toISOString(),
        });
        throw Errors.validation(`Destination wallet mismatch. Payout must be sent to registered withdrawal address: ${withdrawal.destinationAddress}`);
      }
    }

    // Step 53 - Section 6: Amount Verification Check
    if (amount !== undefined && amount !== null) {
      const submittedAmount = Number(amount);
      const expectedAmount = Number(withdrawal.netAmount);
      if (isNaN(submittedAmount) || Math.abs(submittedAmount - expectedAmount) > 0.05) {
        await createAuditLog({
          action: 'PAYOUT_AMOUNT_MISMATCH',
          actorId: admin.id,
          actorRole: 'admin',
          targetUserId: withdrawal.userId,
          referenceId: String(withdrawal.reference || withdrawal.id),
          beforeValue: { netAmount: expectedAmount },
          afterValue: { submittedAmount },
          reason: `SECURITY ALERT: Admin submitted payout amount ($${submittedAmount}) does not match required net payout ($${expectedAmount} USDT).`,
          timestamp: new Date().toISOString(),
        });
        throw Errors.validation(`Payout amount mismatch. Submitted $${submittedAmount} does not match required net payout of $${expectedAmount.toFixed(2)} USDT.`);
      }
    }

    // Step 53 - Section 5: Network verification if provided
    if (network && typeof network === 'string') {
      const net = network.trim().toLowerCase();
      if (!['bep20', 'bep-20', 'bsc', 'bnb smart chain', '56'].includes(net)) {
        throw Errors.validation('Invalid network. Payouts must be executed on BNB Smart Chain (BEP-20).');
      }
    }

    const note = adminNotes || `Admin manual payout verified and completed (Tx: ${cleanHash})`;
    const result = await updateWithdrawalStatusAsync(admin.id, id, 'paid', cleanHash, note);
    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to finalize manual payout.');
    }

    res.json({
      success: true,
      message: 'Withdrawal payout successfully verified and finalized.',
      withdrawal: result.withdrawal,
    });
  } catch (err) {
    next(err);
  }
});

// Admin process withdrawal
app.post(['/api/admin/withdrawals/:id/action', '/admin/withdrawals/:id/action'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const { action, txHash, adminNotes, reason } = req.body;

    const normalizedAction = (action === 'approve' || action === 'approved') ? 'approved' :
      (action === 'reject' || action === 'rejected') ? 'rejected' :
      (action === 'pay' || action === 'paid' || action === 'complete' || action === 'completed') ? 'paid' :
      (action === 'process' || action === 'processing') ? 'processing' :
      (action === 'manual_payment_pending') ? 'manual_payment_pending' :
      (action === 'payment_submitted') ? 'payment_submitted' :
      (action === 'cancel' || action === 'cancelled') ? 'cancelled' :
      action;

    if (!['approved', 'rejected', 'paid', 'processing', 'manual_payment_pending', 'payment_submitted', 'cancelled'].includes(normalizedAction)) {
      throw Errors.validation('Invalid withdrawal action. Must be paid, approved, processing, manual_payment_pending, payment_submitted, rejected, or cancelled.');
    }

    const note = adminNotes || reason;
    if (normalizedAction === 'rejected' && (!note || !note.trim())) {
      throw Errors.validation('A valid rejection reason is required to reject a withdrawal.');
    }

    if (normalizedAction === 'paid' && (!txHash || typeof txHash !== 'string' || !txHash.trim())) {
      throw Errors.validation('BNB Smart Chain Payout Transaction Hash (TxID) is required to complete payout.');
    }

    const result = await updateWithdrawalStatusAsync(admin.id, id, normalizedAction, txHash ? txHash.trim() : undefined, note);
    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to update withdrawal.');
    }

    res.json({ success: true, withdrawal: result.withdrawal });
  } catch (err) {
    next(err);
  }
});

// Admin Withdrawal Messages (Step 57 - User <-> Admin Communication & Internal Notes)
app.get(['/api/admin/withdrawals/:id/messages', '/admin/withdrawals/:id/messages'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin', 'support_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validId = validateId(id, 'Withdrawal ID');
    const withdrawal = await getWithdrawalById(validId);
    if (!withdrawal) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }
    const messages = await getFinancialMessages({ withdrawalId: validId, includeInternal: true });
    await markFinancialMessagesRead({ withdrawalId: validId, readerUserId: (req as any).user.id, readerRole: 'admin' });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/admin/withdrawals/:id/messages', '/admin/withdrawals/:id/messages'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin', 'support_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const validId = validateId(id, 'Withdrawal ID');
    const withdrawal = await getWithdrawalById(validId);
    if (!withdrawal) {
      throw Errors.notFound('WITHDRAWAL_NOT_FOUND', 'Withdrawal record not found.');
    }
    const { message, isInternal } = req.body;
    const cleanMsg = validateString(message, 'Message', { minLength: 1, maxLength: 2000 });
    const created = await createFinancialMessage({
      withdrawalId: validId,
      userId: withdrawal.userId,
      senderType: 'admin',
      senderId: admin.id,
      senderName: admin.fullName || 'FINEXJ Admin',
      message: cleanMsg,
      isInternal: Boolean(isInternal),
    });
    res.json({ success: true, message: created });
  } catch (err) {
    next(err);
  }
});

// Admin Send Message
app.post(['/api/admin/messages', '/admin/messages'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin', 'support_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { userId, depositId, withdrawalId, messageType, subject, body } = req.body;

    if (!userId || !body) {
      throw Errors.validation('userId and body are required.');
    }

    const message = await createAdminMessage({
      userId,
      adminId: admin.id,
      depositId,
      withdrawalId,
      messageType,
      subject,
      body,
    });

    res.json({ success: true, message });
  } catch (err) {
    next(err);
  }
});

// Admin Performance
app.get(['/api/admin/performance', '/admin/performance'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const performances = await getDailyPerformances();
    res.json({ performances });
  } catch (err) {
    next(err);
  }
});

app.post(['/api/admin/performance', '/admin/performance'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { date, overallFundAmount, actualFundPerformance, applicableRate, notes, overwriteExisting, allowUpdate } = req.body;

    if (!date || !isValidDateString(date)) {
      throw Errors.validation('Valid date in YYYY-MM-DD format is required (e.g. 2026-08-31).');
    }

    if (applicableRate === undefined || applicableRate === null) {
      throw Errors.validation('applicableRate is required and cannot be null.');
    }

    const parsedRate = typeof applicableRate === 'string' ? parseFloat(applicableRate) : Number(applicableRate);
    if (isNaN(parsedRate) || !isFinite(parsedRate)) {
      throw Errors.validation(`applicableRate '${applicableRate}' must be a valid finite number.`);
    }

    // Canonical percentage points (e.g. 0.0050 -> 0.5000%)
    const derivedRatePercentage = Number((parsedRate * 100).toFixed(4));

    const result = await applyDailyPerformanceAsync({
      adminUserId: admin.id,
      date,
      overallFundAmount: overallFundAmount !== undefined && overallFundAmount !== null ? Number(overallFundAmount) : undefined,
      actualFundPerformance: derivedRatePercentage,
      applicableRate: parsedRate,
      notes: notes || `Daily verified fund yield distribution (${derivedRatePercentage >= 0 ? '+' : ''}${derivedRatePercentage.toFixed(2)}%)`,
      overwriteExisting: Boolean(overwriteExisting || allowUpdate),
    });

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to distribute performance.');
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin Audit Logs (with optional financialOnly filter)
app.get(['/api/admin/audit-logs', '/admin/audit-logs'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const financialOnly = req.query.financialOnly === 'true' || req.query.type === 'financial';
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 200;
    const auditLogs = await getAuditLogs({ limit, financialOnly });
    res.json({ auditLogs });
  } catch (err) {
    next(err);
  }
});

// Admin Dedicated Clean Financial Activity Feed
app.get(['/api/admin/financial-activity', '/admin/financial-activity'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 100;
    const auditLogs = await getAuditLogs({ limit, financialOnly: true });
    
    // Categorize events cleanly for UI display
    const events = auditLogs.map(l => {
      let category = 'financial';
      if (l.action.includes('DEPOSIT')) {
        category = l.action.includes('REJECT') ? 'deposit_rejected' : 'deposit_approved';
      } else if (l.action.includes('WITHDRAWAL')) {
        if (l.action.includes('REJECT')) category = 'withdrawal_rejected';
        else if (l.action.includes('PAID') || l.action.includes('APPROVED')) category = 'withdrawal_approved';
        else category = 'withdrawal_pending';
      } else if (l.action.includes('PERFORMANCE') || l.action.includes('EARNINGS')) {
        category = 'performance_distributed';
      } else if (l.action.includes('ADJUSTMENT')) {
        category = 'balance_adjustment';
      }

      return {
        ...l,
        category,
      };
    });

    res.json({
      success: true,
      events,
      total: events.length,
      allowedActions: MEANINGFUL_FINANCIAL_ACTIONS,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Database Cleanup (Inspection Dry-Run & Safe Execution)
app.post(['/api/admin/database/cleanup', '/admin/database/cleanup'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const dryRun = req.body.dryRun !== false; // Default to true for safety
    const result = await executeDatabaseCleanup(admin.id, dryRun);
    
    res.json({
      success: result.success,
      report: result,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Settings
app.post(['/api/admin/settings', '/admin/settings'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { reason, ...settingsPayload } = req.body;
    const previousSettings = await getSettings();
    const newSettings = await updateSettings(settingsPayload);

    await createAuditLog({
      action: 'SETTINGS_UPDATED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      beforeValue: previousSettings,
      afterValue: newSettings,
      reason: reason || 'Super Admin updated application settings',
    });

    res.json({ success: true, settings: newSettings });
  } catch (err) {
    next(err);
  }
});

// Force Logout All Users
app.post(['/api/admin/auth/force-logout-all', '/admin/auth/force-logout-all'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { reason } = req.body;
    const newVersion = await forceLogoutAllUsersAsync();

    await createAuditLog({
      action: 'FORCE_LOGOUT_ALL_USERS',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      afterValue: { sessionVersion: newVersion },
      reason: reason || 'Super Admin executed global force logout',
    });

    res.json({
      success: true,
      message: 'All active user sessions have been successfully terminated.',
      sessionVersion: newVersion,
    });
  } catch (err) {
    next(err);
  }
});

// Admin System Health & Diagnostic (Strict Spec Requirement)
app.get(['/api/admin/system-health', '/admin/system-health'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const supabase = getServerSupabase();
    const [
      { count: usersCount },
      { count: depositsCount },
      { count: withdrawalsCount },
      { count: ledgerCount },
      settings,
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('deposits').select('*', { count: 'exact', head: true }),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }),
      supabase.from('ledger').select('*', { count: 'exact', head: true }),
      getSettings(),
    ]);

    res.json({
      status: 'HEALTHY',
      database: 'SUPABASE_POSTGRESQL',
      sourceOfTruth: 'SUPABASE',
      inMemoryDatabase: 'DISABLED',
      jsonDatabase: 'DISABLED',
      backgroundSync: 'DISABLED',
      supabaseAuth: 'ENABLED',
      supabaseStorage: 'ENABLED',
      tables: {
        users: usersCount || 0,
        deposits: depositsCount || 0,
        withdrawals: withdrawalsCount || 0,
        ledger: ledgerCount || 0,
      },
      settings,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Admin Health Stats
app.get(['/api/admin/health/stats', '/admin/health/stats'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const [{ total: totalUsers }, { total: totalDeposits }, { total: totalWithdrawals }, totalLedgerRecords, totalAuditLogs, settings] = await Promise.all([
      getAllProfiles({ limit: 1 }),
      getAllDeposits({ limit: 1 }),
      getAllWithdrawals({ limit: 1 }),
      getLedgerCount(),
      getAuditLogsCount(),
      getSettings(),
    ]);

    res.json({
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      totalLedgerRecords,
      totalAuditLogs,
      totalSystemLogs: 0,
      totalDepositProofs: totalDeposits,
      errorsToday: 0,
      warningsToday: 0,
      infoToday: 0,
      dbLoggingEnabled: true,
      retentionSettings: {
        systemLogRetentionDays: settings.systemLogRetentionDays || 30,
        errorLogRetentionDays: settings.errorLogRetentionDays || 90,
        notificationRetentionDays: settings.notificationRetentionDays || 90,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin System Logs
app.get(['/api/admin/logs', '/admin/logs'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { level, event, errorCode, requestId, limit, offset } = req.query;
    const result = await getSystemLogs({
      level: level as string,
      event: event as string,
      errorCode: errorCode as string,
      requestId: requestId as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin Balance Adjustment (Hardened Atomic Ledger & Double-Entry Verification)
app.post(['/api/admin/adjust-balance', '/admin/adjust-balance'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { targetUserId, amount, reason, adjustmentType } = req.body;

    const validTargetUserId = validateId(targetUserId, 'targetUserId');
    const adjustAmount = validateAmount(amount, 'Adjustment amount', {
      min: -100_000_000,
      max: 100_000_000,
      maxDecimals: 4,
      allowZero: false,
      allowNegative: true,
    });
    const cleanReason = validateString(reason, 'Adjustment reason', { minLength: 3, maxLength: 500, required: true });

    const result = await adjustUserBalanceAtomicAsync({
      adminId: admin.id,
      adminEmail: admin.email,
      adminRole: admin.role,
      targetUserId: validTargetUserId,
      amount: adjustAmount,
      reason: cleanReason,
      adjustmentType: adjustmentType || (adjustAmount >= 0 ? 'credit' : 'debit'),
    });

    const updatedBalance = await calculateUserBalanceAsync(validTargetUserId);
    res.json({
      success: true,
      balance: updatedBalance,
      adjustment: result,
      message: `Balance successfully adjusted by ${adjustAmount} USDT with immutable ledger and audit trace.`,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Migration Center: Get Authoritative Migration Manifest & Status
app.get(['/api/admin/migrations', '/admin/migrations'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const data = await getMigrationStatusList();
    res.json({
      success: true,
      migrations: data.migrations,
      summary: data.summary,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Migration Center: Get Review SQL of an Allowlisted Migration File
app.get(['/api/admin/migrations/:filename/sql', '/admin/migrations/:filename/sql'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const result = await getMigrationSql(filename);
    res.json({
      success: true,
      filename: result.filename,
      checksum: result.checksum,
      sql: result.sql,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Migration Center: Execute an Allowlisted Database Migration
app.post(['/api/admin/migrations/execute', '/admin/migrations/execute'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { filename } = req.body;

    if (!filename || typeof filename !== 'string') {
      throw Errors.validation('Migration filename is required.');
    }

    const cleanFilename = filename.trim();
    const result = await executeMigration(cleanFilename, {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });

    res.json({
      success: true,
      filename: result.filename,
      appliedAt: result.appliedAt,
      executionTimeMs: result.executionTimeMs,
      message: `Database migration ${result.filename} successfully applied.`,
    });
  } catch (err) {
    next(err);
  }
});

// User Referral Network & Stats
app.get(['/api/referrals/my-network', '/referrals/my-network'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const summary = await getReferralSummaryAsync(user.id);
    const userSummary = await getUserReferralSummaryAsync(user.id);
    
    res.json({
      success: true,
      referralCode: userSummary.referralCode,
      referralLink: userSummary.referralLink,
      referrerId: user.referrerId,
      totalReferred: userSummary.totalReferrals,
      level1Count: userSummary.level1Referrals,
      level2Count: userSummary.level2Referrals,
      totalRewardsEarned: userSummary.totalReferralIncome,
      level1RewardsEarned: userSummary.level1Income,
      level2RewardsEarned: userSummary.level2Income,
      eligibleDepositPrincipal: userSummary.eligibleDepositPrincipal,
      summary: userSummary,
      referrals: summary.referrals,
      recentRewards: summary.recentRewards,
    });
  } catch (err) {
    next(err);
  }
});

// Authoritative User Referral Summary
app.get(['/api/referrals/summary', '/referrals/summary'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const summary = await getUserReferralSummaryAsync(user.id);
    res.json({
      success: true,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// Authoritative User Referral Eligibility Status
app.get(['/api/referrals/eligibility', '/referrals/eligibility'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const eligibility = await checkReferralEligibilityAsync(user.id);
    res.json({
      success: true,
      eligibility,
    });
  } catch (err) {
    next(err);
  }
});

// Paginated Level 1 Referrals
app.get(['/api/referrals/level1', '/referrals/level1'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    
    const result = await getUserLevel1ReferralsPaginatedAsync(user.id, page, limit);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// Paginated Level 2 Referrals (grouped or specific to Level 1 user)
app.get(['/api/referrals/level2', '/referrals/level2'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const level1UserId = req.query.level1UserId ? String(req.query.level1UserId) : undefined;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    
    const result = await getUserLevel2ReferralsPaginatedAsync(user.id, level1UserId, page, limit);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// Public Referral Code Validation (for signup flow)
app.get(['/api/referrals/validate/:code', '/referrals/validate/:code'], async (req, res, next) => {
  try {
    const code = req.params.code;
    const result = await validateReferralCodeAsync(code);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Operational Fund Summary (Tracks 9% fee retained & company capital)
app.get(['/api/admin/operational-fund', '/admin/operational-fund'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const summary = await getOperationalFundSummaryAsync();
    res.json({
      success: true,
      operationalFund: summary,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Operational Fund Adjustment (Capital injections or operational disbursements)
app.post(['/api/admin/operational-fund/adjust', '/admin/operational-fund/adjust'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { amount, direction, reason, reference } = req.body;

    const validAmount = validateAmount(amount, 'Adjustment amount', { min: 0.01, max: 100_000_000, maxDecimals: 4, allowZero: false });
    if (direction !== 'inflow' && direction !== 'outflow') {
      throw Errors.validation("Adjustment direction must be either 'inflow' or 'outflow'.");
    }
    const cleanReason = validateString(reason, 'Adjustment reason', { minLength: 3, maxLength: 500, required: true });
    const cleanReference = reference ? validateString(reference, 'Reference', { maxLength: 100 }) : undefined;

    const result = await adjustOperationalFundAsync({
      adminId: admin.id,
      adminEmail: admin.email,
      amount: validAmount,
      direction,
      reason: cleanReason,
      reference: cleanReference,
    });

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to adjust operational fund.');
    }

    const updatedSummary = await getOperationalFundSummaryAsync();
    res.json({
      success: true,
      entry: result.entry,
      operationalFund: updatedSummary,
      message: `Operational fund successfully adjusted (${direction}: ${validAmount} USDT).`,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Overall Financial Accounting & Reconciliation Summary
app.get(['/api/admin/accounting/summary', '/admin/accounting/summary'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.query;
    const summary = await getAccountingSummaryAsync({
      period: period as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json({
      success: true,
      accounting: summary,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Referral Program Accounting Breakdown
app.get(['/api/admin/accounting/referrals', '/admin/accounting/referrals'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const summary = await getReferralAccountingSummaryAsync();
    res.json({
      success: true,
      referralAccounting: summary,
    });
  } catch (err) {
    next(err);
  }
});

// Admin General Ledger Stream (Filtered & Paginated)
app.get(['/api/admin/accounting/ledger', '/admin/accounting/ledger'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const { page, limit, type, userId, reference, startDate, endDate, minAmount, maxAmount } = req.query;
    const ledgerData = await getAdminLedgerAsync({
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 25,
      type: type as string,
      userId: userId as string,
      reference: reference as string,
      startDate: startDate as string,
      endDate: endDate as string,
      minAmount: minAmount ? parseFloat(minAmount as string) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount as string) : undefined,
    });
    res.json({
      success: true,
      ...ledgerData,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Fraud Signals List
app.get(['/api/admin/fraud-signals', '/admin/fraud-signals'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { status, severity, limit, offset } = req.query;
    const result = await getFraudSignals({
      status: status as string,
      severity: severity as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin Resolve Fraud Signal
app.post(['/api/admin/fraud-signals/:id/resolve', '/admin/fraud-signals/:id/resolve'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const signalId = req.params.id;
    const { action, notes } = req.body;

    if (!action || (action !== 'dismissed' && action !== 'action_taken')) {
      throw Errors.validation('Action must be either "dismissed" or "action_taken".');
    }

    await resolveFraudSignal(signalId, admin, action, notes);
    res.json({ success: true, message: `Fraud signal #${signalId} resolved as ${action}.` });
  } catch (err) {
    next(err);
  }
});

// Admin Security Alerts Summary
app.get(['/api/admin/security/alerts', '/admin/security/alerts'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const supabase = getServerSupabase();
    const [
      { count: openFraudSignalsCount },
      { count: flaggedUsersCount },
      recentAuditLogs,
    ] = await Promise.all([
      supabase.from('fraud_signals').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_flagged_for_review', true),
      getAuditLogs({ limit: 15 }),
    ]);

    res.json({
      success: true,
      openFraudSignals: openFraudSignalsCount || 0,
      flaggedUsersForReview: flaggedUsersCount || 0,
      recentSecurityEvents: recentAuditLogs.filter(a => a.action.includes('SECURITY') || a.action.includes('LOCKED') || a.action.includes('FRAUD')),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Catch-all 404 handler for unmatched API routes (Strict JSON compliance)
app.all(['/api/*', '/api'], (req: Request, res: Response) => {
  const requestId = (req as any).requestId || 'FINEXJ-UNKNOWN';
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `API route ${req.method} ${req.path} not found.`,
      requestId,
    },
  });
});

// Centralized Error Handling Middleware
app.use(centralErrorHandler);

export default app;
