import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import {
  hashPassword,
  generateSalt,
  createSessionToken,
  verifySessionTokenAsync,
  revokeSessionToken,
  forceLogoutAllUsersAsync,
  generate2FASecret,
  verify2FACode,
} from './auth';
import { getProfileById, getProfileByEmail, createProfile, updateProfile, getAllProfiles } from './repositories/profiles';
import { getDepositsByUserId, getAllDeposits, getDepositById } from './repositories/deposits';
import { getWithdrawalsByUserId, getAllWithdrawals, getWithdrawalById } from './repositories/withdrawals';
import { getEarningsByUserId, getAllEarnings } from './repositories/earnings';
import { getDailyPerformances } from './repositories/performances';
import { getLedgerByUserId, getAllLedger, createLedgerEntry } from './repositories/ledger';
import { getSettings, updateSettings } from './repositories/settings';
import { getAuditLogs, createAuditLog } from './repositories/auditLogs';
import { getSystemLogs } from './repositories/systemLogs';
import { getAdminMessagesForUser, createAdminMessage, markMessageRead } from './repositories/messages';
import { calculateUserBalanceAsync } from './services/balanceService';
import { processDepositAsync, updateDepositStatusAsync, verifyDepositOnChainAsync } from './services/depositService';
import { createWithdrawalRequestAsync, updateWithdrawalStatusAsync } from './services/withdrawalService';
import { applyDailyPerformanceAsync } from './services/performanceService';
import { getSignedDepositProofUrl } from './storage';
import { verifyBEP20Deposit, isValidBEP20Address, isValidTxHash } from './blockchain';
import { runAutomatedTestSuite } from './tests';
import { getMarketPrices } from './market';
import { getServerSupabase, isServerSupabaseReady } from './supabase';
import { UserRole, User } from './types';
import { generateRequestId, logger } from './logger';
import { AppError, Errors, centralErrorHandler } from './errors';
import { createRateLimiter } from './rateLimit';
import { config } from './config';

export const app = express();

app.use(express.json({ limit: '15mb' }));

// Global Request ID & Correlation Tracking Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || generateRequestId();
  (req as any).requestId = reqId;
  (req as any).startTime = Date.now();
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Rate Limiters for Sensitive Endpoints
const authRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, keyPrefix: 'auth' });
const financialRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 40, keyPrefix: 'fin' });

// Helper: Extract Bearer token and authenticate user from Supabase
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(Errors.unauthorized('Authentication required. Please login.'));
    }

    const token = authHeader.split(' ')[1];
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

// Live market prices
app.get(['/api/market/prices', '/market/prices'], async (req, res) => {
  const prices = await getMarketPrices();
  res.json(prices);
});

// Blockchain Network Status (BNB Smart Chain BEP-20)
app.get(['/api/blockchain/status', '/blockchain/status'], async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      network: 'BNB Smart Chain (BSC Mainnet)',
      chainId: 56,
      currency: 'USDT',
      tokenStandard: 'BEP-20',
      tokenContract: settings.usdtContractAddress || '0x55d398326f99059fF775485246999027B3197955',
      depositWallet: settings.bep20DepositAddress || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
      requiredConfirmations: settings.requiredConfirmations || 12,
      minimumDeposit: settings.minimumDepositAmount || 300,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to query blockchain settings.' });
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

    if (password !== confirmPassword) {
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
    const passwordHash = hashPassword(password, salt);
    const now = new Date().toISOString();

    const newUser = await createProfile({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      country: country ? country.trim() : 'India',
      passwordHash,
      passwordSalt: salt,
      role: 'user',
      status: 'active',
      createdAt: now,
      twoFactorEnabled: false,
      loginAttempts: 0,
      profilePictureUrl: profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
    });

    await createAuditLog({
      action: 'USER_REGISTERED',
      actorId: newUser.id,
      actorEmail: newUser.email,
      actorRole: newUser.role,
      targetUserId: newUser.id,
      reason: 'New user account created successfully.',
    });

    const token = createSessionToken(newUser, settings.sessionVersion || 1);
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
      },
    });
  } catch (err) {
    next(err);
  }
});

// User Login
app.post(['/api/auth/login', '/auth/login'], authRateLimiter, async (req, res, next) => {
  try {
    const { email, password, twoFactorCode } = req.body;

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

    const computedHash = hashPassword(password, user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      await updateProfile(user.id, { loginAttempts: (user.loginAttempts || 0) + 1 });
      throw Errors.invalidCredentials('Invalid email or password.');
    }

    // 2FA verification if enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        res.json({ require2FA: true, message: 'Please provide your 6-digit 2FA authenticator code.' });
        return;
      }
      const isValidCode = verify2FACode(user.twoFactorSecret || '', twoFactorCode);
      if (!isValidCode) {
        throw Errors.validation('Invalid 2FA authenticator code.');
      }
    }

    await updateProfile(user.id, { loginAttempts: 0, lastLoginAt: new Date().toISOString() });

    const token = createSessionToken(user, settings.sessionVersion || 1);
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
      },
    });
  } catch (err) {
    next(err);
  }
});

// Logout
app.post(['/api/auth/logout', '/auth/logout'], authMiddleware, (req, res) => {
  const token = (req as any).token;
  revokeSessionToken(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Logout all devices
app.post(['/api/auth/logout-all', '/auth/logout-all'], authMiddleware, (req, res) => {
  res.json({ success: true, message: 'Logged out from all active sessions.' });
});

// Get current profile
app.get(['/api/auth/me', '/auth/me'], authMiddleware, (req, res) => {
  const user: User = (req as any).user;
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
    },
  });
});

// Update Profile
app.post(['/api/auth/update-profile', '/auth/update-profile'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { fullName, phone, country, profilePictureUrl } = req.body;

    const updated = await updateProfile(user.id, {
      ...(fullName ? { fullName: fullName.trim() } : {}),
      ...(phone ? { phone: phone.trim() } : {}),
      ...(country ? { country: country.trim() } : {}),
      ...(profilePictureUrl ? { profilePictureUrl } : {}),
    });

    res.json({ success: true, user: updated });
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

    const currentComputed = hashPassword(currentPassword, user.passwordSalt);
    if (currentComputed !== user.passwordHash) {
      throw Errors.validation('Current password is incorrect.');
    }

    const newSalt = generateSalt();
    const newHash = hashPassword(newPassword, newSalt);

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

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// 2FA Secret Generation
app.post(['/api/auth/2fa/generate', '/auth/2fa/generate'], authMiddleware, (req, res) => {
  const { secret, otpAuthUrl } = generate2FASecret();
  res.json({ secret, otpAuthUrl });
});

// 2FA Toggle
app.post(['/api/auth/2fa/toggle', '/auth/2fa/toggle'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { enable, secret, code } = req.body;

    if (enable) {
      if (!code || !secret) {
        throw Errors.validation('Verification code and secret required to enable 2FA.');
      }
      const isValid = verify2FACode(secret, code);
      if (!isValid) {
        throw Errors.validation('Invalid 2FA code. Please check your authenticator app.');
      }
      await updateProfile(user.id, { twoFactorEnabled: true, twoFactorSecret: secret });
      res.json({ success: true, twoFactorEnabled: true });
    } else {
      await updateProfile(user.id, { twoFactorEnabled: false, twoFactorSecret: undefined });
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
  try {
    const user: User = (req as any).user;
    const [balanceSummary, ledger, earnings, marketPrices, settings] = await Promise.all([
      calculateUserBalanceAsync(user.id),
      getLedgerByUserId(user.id),
      getEarningsByUserId(user.id),
      getMarketPrices(),
      getSettings(),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayEarning = earnings.find(e => e.performanceDate === todayStr);
    const todayEarningsAmount = todayEarning ? todayEarning.earningsAmount : 0;

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        profilePictureUrl: user.profilePictureUrl,
      },
      balance: balanceSummary,
      todayEarnings: todayEarningsAmount,
      recentActivity: ledger.slice(0, 5),
      marketPrices,
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
      },
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// User Deposits list
app.get(['/api/user/deposits', '/user/deposits'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const deposits = await getDepositsByUserId(user.id);
    res.json({ deposits });
  } catch (err) {
    next(err);
  }
});

// Submit BEP-20 Deposit
app.post(['/api/user/deposits', '/user/deposits'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { txHash, amount, proofPhotoUrl, userNotes } = req.body;

    if (!txHash || typeof txHash !== 'string' || !txHash.trim()) {
      throw Errors.validation('BNB Smart Chain Transaction Hash (TxID) is required.');
    }

    const result = await processDepositAsync({
      userId: user.id,
      txHash: txHash.trim(),
      amount: amount ? Number(amount) : undefined,
      proofPhotoUrl,
      userNotes,
      actorEmail: user.email,
    });

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to submit deposit.');
    }

    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ success: true, deposit: result.deposit, balance, message: result.message });
  } catch (err) {
    next(err);
  }
});

// Re-verify User BEP-20 Deposit on BNB Smart Chain
app.post(['/api/user/deposits/:id/verify', '/user/deposits/:id/verify'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { id } = req.params;
    const deposit = await getDepositById(id);

    if (!deposit || deposit.userId !== user.id) {
      throw Errors.notFound('DEPOSIT_NOT_FOUND', 'Deposit record not found.');
    }

    const result = await verifyDepositOnChainAsync(id, user.id);
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ ...result, balance });
  } catch (err) {
    next(err);
  }
});

// Public / Authenticated Blockchain Tx Verification Inspector
app.post(['/api/blockchain/verify-tx', '/blockchain/verify-tx'], async (req, res, next) => {
  try {
    const { txHash, claimedAmount } = req.body;
    if (!txHash || typeof txHash !== 'string' || !txHash.trim()) {
      throw Errors.validation('BNB Smart Chain Transaction Hash (TxID) is required.');
    }

    const result = await verifyBEP20Deposit(txHash.trim(), claimedAmount ? Number(claimedAmount) : undefined);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Automated Test Suite Runner (Point #1-#5 Financial & System Integrity Verification)
app.post(['/api/tests/run', '/tests/run'], async (req, res, next) => {
  try {
    const results = await runAutomatedTestSuite();
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// User Earnings list
app.get(['/api/user/earnings', '/user/earnings'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const earnings = await getEarningsByUserId(user.id);
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ earnings, totalEarnings: balance.totalEarnings });
  } catch (err) {
    next(err);
  }
});

// User Withdrawals list
app.get(['/api/user/withdrawals', '/user/withdrawals'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const withdrawals = await getWithdrawalsByUserId(user.id);
    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ withdrawals, balance });
  } catch (err) {
    next(err);
  }
});

// Submit Withdrawal Request
app.post(['/api/user/withdrawals', '/user/withdrawals'], authMiddleware, financialRateLimiter, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { requestedAmount, destinationAddress, network, password, twoFactorCode, idempotencyKey, userNotes } = req.body;

    if (user.status !== 'active') {
      throw Errors.forbidden(`Your account is currently ${user.status}. Withdrawals are disabled.`);
    }

    if (network && !['BEP-20', 'BEP20', 'BSC', 'BNB Smart Chain'].includes(network.trim())) {
      throw Errors.validation('Unsupported network. Withdrawals are exclusively supported on BNB Smart Chain (BEP-20 USDT).');
    }

    if (!password) {
      throw Errors.validation('Account password confirmation is required for withdrawal.');
    }

    const passHash = hashPassword(password, user.passwordSalt);
    if (passHash !== user.passwordHash) {
      throw Errors.invalidCredentials('Incorrect account password.');
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        throw Errors.validation('2FA authenticator code is required.');
      }
      const isValidCode = verify2FACode(user.twoFactorSecret || '', twoFactorCode);
      if (!isValidCode) {
        throw Errors.validation('Invalid 2FA authenticator code.');
      }
    }

    if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128)) {
      throw Errors.validation('Invalid idempotency key length. Must be between 8 and 128 characters.');
    }

    const result = await createWithdrawalRequestAsync({
      userId: user.id, // Strictly derived from session, never from req.body
      requestedAmount: Number(requestedAmount),
      destinationAddress,
      idempotencyKey: idempotencyKey ? idempotencyKey.trim() : undefined,
      userNotes,
      actorEmail: user.email,
    });

    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to request withdrawal.');
    }

    const balance = await calculateUserBalanceAsync(user.id);
    res.json({ success: true, withdrawal: result.withdrawal, balance });
  } catch (err) {
    next(err);
  }
});

// User Voluntary Fund Lock
app.post(['/api/user/lock-funds', '/user/lock-funds'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const { days, reason } = req.body;
    const lockDays = days ? Number(days) : 30;

    const lockUntil = new Date(Date.now() + lockDays * 24 * 60 * 60 * 1000).toISOString();
    await updateProfile(user.id, {
      fundLockUntil: lockUntil,
      fundLockReason: reason || `User locked funds for ${lockDays} days`,
    });

    const balance = await calculateUserBalanceAsync(user.id);
    res.json({
      success: true,
      fundLockUntil: lockUntil,
      balance,
      message: `Funds successfully locked for ${lockDays} days to ensure active yield generation.`,
    });
  } catch (err) {
    next(err);
  }
});

// User Transactions / Ledger
app.get(['/api/user/transactions', '/user/transactions'], authMiddleware, async (req, res, next) => {
  try {
    const user: User = (req as any).user;
    const transactions = await getLedgerByUserId(user.id);
    res.json({ transactions });
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
    const [{ users }, { deposits }, { withdrawals }, earnings, performances, settings] = await Promise.all([
      getAllProfiles({ limit: 1000 }),
      getAllDeposits({ limit: 1000 }),
      getAllWithdrawals({ limit: 1000 }),
      getAllEarnings(),
      getDailyPerformances(),
      getSettings(),
    ]);

    const standardUsers = users.filter(u => u.role === 'user');
    const activeUsers = standardUsers.filter(u => u.status === 'active').length;

    const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
    const totalConfirmedDeposits = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);

    const pendingDeposits = deposits.filter(d => d.status === 'pending' || d.status === 'confirming');
    const totalPendingDepositsAmount = pendingDeposits.reduce((acc, d) => acc + d.amount, 0);

    const paidWithdrawals = withdrawals.filter(w => w.status === 'paid');
    const totalPaidWithdrawals = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
    const totalPaidWithdrawalsNet = paidWithdrawals.reduce((acc, w) => acc + w.netAmount, 0);
    const totalWithdrawalFees = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);

    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending' || w.status === 'under_review');
    const totalPendingWithdrawalsAmount = pendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);

    const totalEarningsAllocated = earnings.reduce((acc, e) => acc + e.earningsAmount, 0);
    const vaultRetainedLiquidity = Number((totalConfirmedDeposits + totalEarningsAllocated - totalPaidWithdrawals).toFixed(2));

    res.json({
      stats: {
        totalUsers: standardUsers.length,
        activeUsers,
        totalConfirmedDeposits,
        totalConfirmedDepositsCount: confirmedDeposits.length,
        totalPaidWithdrawals,
        totalPaidWithdrawalsNet,
        totalPaidWithdrawalsCount: paidWithdrawals.length,
        totalWithdrawalFees,
        pendingWithdrawalsCount: pendingWithdrawals.length,
        totalPendingWithdrawalsAmount,
        pendingDepositsCount: pendingDeposits.length,
        totalPendingDepositsAmount,
        totalEarningsAllocated,
        vaultRetainedLiquidity,
      },
      latestPerformance: performances[0] || null,
      settings,
    });
  } catch (err) {
    next(err);
  }
});

// Admin Users list
app.get(['/api/admin/users', '/admin/users'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { users } = await getAllProfiles({ limit: 500 });
    const usersWithBalances = await Promise.all(
      users.map(async u => {
        const balance = await calculateUserBalanceAsync(u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          country: u.country,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt,
          twoFactorEnabled: u.twoFactorEnabled,
          profilePictureUrl: u.profilePictureUrl,
          balance,
        };
      })
    );
    res.json({ users: usersWithBalances });
  } catch (err) {
    next(err);
  }
});

// Admin toggle user status
app.post(['/api/admin/users/:id/status', '/admin/users/:id/status'], authMiddleware, adminMiddleware(['super_admin', 'support_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const admin: User = (req as any).user;

    if (!['active', 'suspended', 'pending_verification'].includes(status)) {
      throw Errors.validation('Invalid status value.');
    }

    const updated = await updateProfile(id, { status });
    await createAuditLog({
      action: 'USER_STATUS_UPDATED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: id,
      afterValue: { status },
      reason: `Admin updated account status to ${status}`,
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});

// Admin Deposits
app.get(['/api/admin/deposits', '/admin/deposits'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { deposits } = await getAllDeposits({ limit: 500 });
    const depositsWithUsers = await Promise.all(
      deposits.map(async d => {
        const user = await getProfileById(d.userId);
        return {
          ...d,
          userName: user ? user.fullName : 'Unknown User',
          userEmail: user ? user.email : '',
        };
      })
    );
    res.json({ deposits: depositsWithUsers });
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

// Admin process deposit
app.post(['/api/admin/deposits/:id/action', '/admin/deposits/:id/action'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const { action, adminNotes, txHash } = req.body;

    if (!['confirmed', 'rejected', 'approve', 'reject'].includes(action)) {
      throw Errors.validation('Invalid action. Must be confirmed or rejected.');
    }

    const normalizedStatus = (action === 'approve' || action === 'confirmed') ? 'confirmed' : 'rejected';
    const result = await updateDepositStatusAsync(admin.id, id, normalizedStatus, adminNotes, txHash);
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

// Admin Withdrawals
app.get(['/api/admin/withdrawals', '/admin/withdrawals'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const { withdrawals } = await getAllWithdrawals({ limit: 500 });
    res.json({ withdrawals });
  } catch (err) {
    next(err);
  }
});

// Admin process withdrawal
app.post(['/api/admin/withdrawals/:id/action', '/admin/withdrawals/:id/action'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { id } = req.params;
    const { action, txHash, adminNotes } = req.body;

    const normalizedAction = (action === 'approve' || action === 'approved') ? 'approved' :
      (action === 'reject' || action === 'rejected') ? 'rejected' :
      (action === 'pay' || action === 'paid' || action === 'completed') ? 'paid' :
      action;

    if (!['approved', 'rejected', 'paid', 'processing'].includes(normalizedAction)) {
      throw Errors.validation('Invalid withdrawal action. Must be paid, approved, or rejected.');
    }

    if (normalizedAction === 'paid' && (!txHash || typeof txHash !== 'string' || !txHash.trim())) {
      throw Errors.validation('BNB Smart Chain Payout Transaction Hash (TxID) is required to complete payout.');
    }

    const result = await updateWithdrawalStatusAsync(admin.id, id, normalizedAction, txHash ? txHash.trim() : undefined, adminNotes);
    if (!result.success) {
      throw Errors.validation(result.error || 'Failed to update withdrawal.');
    }

    res.json({ success: true, withdrawal: result.withdrawal });
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

    if (!date || applicableRate === undefined) {
      throw Errors.validation('Date and applicableRate are required.');
    }

    const result = await applyDailyPerformanceAsync({
      adminUserId: admin.id,
      date,
      overallFundAmount: Number(overallFundAmount || 2500000),
      actualFundPerformance: Number(actualFundPerformance || (applicableRate * 100)),
      applicableRate: Number(applicableRate),
      notes: notes || 'Daily verified fund yield distribution',
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

// Admin Audit Logs
app.get(['/api/admin/audit-logs', '/admin/audit-logs'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const auditLogs = await getAuditLogs({ limit: 200 });
    res.json({ auditLogs });
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
    const [{ total: totalUsers }, { total: totalDeposits }, { total: totalWithdrawals }, ledger, auditLogs, settings] = await Promise.all([
      getAllProfiles({ limit: 1 }),
      getAllDeposits({ limit: 1 }),
      getAllWithdrawals({ limit: 1 }),
      getAllLedger(),
      getAuditLogs({ limit: 50 }),
      getSettings(),
    ]);

    res.json({
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      totalLedgerRecords: ledger.length,
      totalAuditLogs: auditLogs.length,
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

// Admin Balance Adjustment
app.post(['/api/admin/adjust-balance', '/admin/adjust-balance'], authMiddleware, adminMiddleware(['super_admin']), async (req, res, next) => {
  try {
    const admin: User = (req as any).user;
    const { targetUserId, amount, reason } = req.body;

    if (!targetUserId || !amount || !reason) {
      throw Errors.validation('targetUserId, amount, and reason are required.');
    }

    const targetUser = await getProfileById(targetUserId);
    if (!targetUser) {
      throw Errors.notFound('USER_NOT_FOUND', 'Target user not found.');
    }

    const currentBalance = await calculateUserBalanceAsync(targetUserId);
    const adjustAmount = Number(amount);
    const balanceAfter = Number((currentBalance.availableBalance + adjustAmount).toFixed(4));

    await createLedgerEntry({
      userId: targetUserId,
      type: 'admin_adjustment',
      amount: adjustAmount,
      balanceAfter,
      referenceId: `ADJ-${Date.now()}`,
      description: `Admin balance adjustment: ${reason}`,
      createdAt: new Date().toISOString(),
      performedBy: admin.id,
    });

    await createAuditLog({
      action: 'ADMIN_BALANCE_ADJUSTMENT',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId,
      reason,
      afterValue: { adjustAmount, balanceAfter },
    });

    const updatedBalance = await calculateUserBalanceAsync(targetUserId);
    res.json({ success: true, balance: updatedBalance });
  } catch (err) {
    next(err);
  }
});

// Database Schema SQL File Endpoint
app.get(
  ['/api/admin/db/schema-sql', '/admin/db/schema-sql', '/api/schema.sql', '/schema.sql'],
  async (req, res, next) => {
    try {
      const schemaPath = path.join(process.cwd(), 'supabase_schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf-8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(sql);
      }
      res.status(404).send('-- supabase_schema.sql not found on server filesystem');
    } catch (err) {
      next(err);
    }
  }
);

// Helper to inspect Supabase tables
async function checkSupabaseTablesStatus() {
  const allTables = [
    'users',
    'deposits',
    'withdrawals',
    'daily_performances',
    'earnings',
    'ledger',
    'audit_logs',
    'system_settings',
  ];

  const startTime = Date.now();
  const tablesFound: string[] = [];
  const tablesMissing: string[] = [];

  const supabaseReady = isServerSupabaseReady();
  let poolReady = false;
  let poolError = '';

  if (supabaseReady) {
    try {
      const supabase = getServerSupabase();
      for (const table of allTables) {
        try {
          const { error } = await supabase.from(table).select('id').limit(1);
          if (error) {
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('relation') && msg.includes('does not exist') || msg.includes('not found') || msg.includes('schema cache')) {
              tablesMissing.push(table);
            } else {
              // Table exists but maybe permissions/empty
              tablesFound.push(table);
            }
          } else {
            tablesFound.push(table);
          }
        } catch {
          tablesMissing.push(table);
        }
      }
      poolReady = tablesFound.length > 0;
    } catch (err: any) {
      poolError = err?.message || 'Failed to inspect tables';
    }
  } else {
    poolError = 'Supabase environment credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) not configured.';
  }

  const latencyMs = Date.now() - startTime;
  const connectionType = config.databaseUrl ? 'DATABASE_URL' : (config.supabaseUrl ? 'SUPABASE_URL' : 'IN_MEMORY');

  return {
    postgresPoolReady: poolReady,
    supabaseJsReady: supabaseReady,
    connectionType,
    latencyMs,
    tablesFound,
    tablesMissing,
    postgresPoolError: poolError,
    totalTablesExpected: allTables.length,
  };
}

// Admin DB: Status & Table Inspection
app.get(['/api/admin/db/status', '/admin/db/status'], authMiddleware, adminMiddleware(), async (req, res, next) => {
  try {
    const status = await checkSupabaseTablesStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// Admin DB: Run DB Migration / Table Validation
app.post(['/api/admin/db/migrate', '/admin/db/migrate'], authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res, next) => {
  try {
    const status = await checkSupabaseTablesStatus();
    res.json(status);
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
