import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, generateSalt } from './server/db';
import {
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  revokeAllUserSessions,
  generate2FASecret,
  verify2FACode,
} from './server/auth';
import { calculateUserBalance, reconcileLedger } from './server/ledger';
import {
  processDeposit,
  createWithdrawalRequest,
  applyDailyPerformance,
  updateWithdrawalStatus,
  createAdminAdjustment,
  lockUserFundsVoluntarily,
} from './server/rules';
import { generateMockTxHash, isValidBEP20Address } from './server/blockchain';
import { getMarketPrices } from './server/market';
import { runAutomatedTestSuite } from './server/tests';
import { UserRole, User } from './server/types';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper: Extract Bearer token and authenticate user
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please login.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid. Please login again.' });
    return;
  }

  const user = db.getUserById(session.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found.' });
    return;
  }

  (req as any).user = user;
  (req as any).token = token;
  next();
}

// Helper: Admin role authorization middleware
function adminMiddleware(allowedRoles: UserRole[] = ['super_admin', 'finance_admin', 'support_admin', 'readonly_admin']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user: User = (req as any).user;
    if (!user || !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Access denied. Insufficient administrative privileges.' });
      return;
    }
    next();
  };
}

// ==========================================
// 1. PUBLIC & AUTHENTICATION ENDPOINTS
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'USDT Fund Management API' });
});

// App settings
app.get('/api/settings', (req, res) => {
  const settings = db.getSettings();
  res.json({
    bep20DepositAddress: settings.bep20DepositAddress,
    usdtContractAddress: settings.usdtContractAddress,
    requiredConfirmations: settings.requiredConfirmations,
    withdrawalFeePercentage: settings.withdrawalFeePercentage,
    accountAgeRequirementDays: settings.accountAgeRequirementDays,
    depositLockPeriodDays: settings.depositLockPeriodDays,
    telegramSupportUrl: settings.telegramSupportUrl,
  });
});

// Live market prices
app.get('/api/market/prices', async (req, res) => {
  const prices = await getMarketPrices();
  res.json(prices);
});

// Generator for mock BEP-20 Tx Hash (for testing & demo UI)
app.get('/api/blockchain/mock-tx', (req, res) => {
  res.json({ txHash: generateMockTxHash(), network: 'BEP-20', currency: 'USDT' });
});

// Registration
app.post('/api/auth/register', (req, res) => {
  const { fullName, email, phone, country, password, confirmPassword, profilePictureUrl } = req.body;

  if (!fullName || !email || !password) {
    res.status(400).json({ error: 'Full name, email, and password are required.' });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters with letters and numbers.' });
    return;
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    res.status(400).json({ error: 'An account with this email address already exists.' });
    return;
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const now = new Date().toISOString();

  const newUser: User = {
    id: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    country: country ? country.trim() : 'United States',
    passwordHash,
    passwordSalt: salt,
    role: 'user',
    status: 'active',
    createdAt: now,
    twoFactorEnabled: false,
    loginAttempts: 0,
    profilePictureUrl: profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
  };

  db.addUser(newUser);

  db.addAuditLog({
    action: 'USER_REGISTERED',
    actorId: newUser.id,
    actorEmail: newUser.email,
    actorRole: newUser.role,
    targetUserId: newUser.id,
    reason: 'New user account created successfully.',
  });

  const token = createSessionToken(newUser);
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
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password, twoFactorCode } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.status === 'suspended') {
    res.status(403).json({ error: 'Account has been suspended. Please contact support via Telegram.' });
    return;
  }

  const computedHash = hashPassword(password, user.passwordSalt);
  if (computedHash !== user.passwordHash) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    db.updateUser(user.id, { loginAttempts: user.loginAttempts });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // Check 2FA if enabled
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      res.json({ require2FA: true, message: 'Please provide your 6-digit 2FA authenticator code.' });
      return;
    }
    const isValidCode = verify2FACode(user.twoFactorSecret || '', twoFactorCode);
    if (!isValidCode) {
      res.status(400).json({ error: 'Invalid 2FA authenticator code.' });
      return;
    }
  }

  db.updateUser(user.id, { loginAttempts: 0, lastLoginAt: new Date().toISOString() });

  const token = createSessionToken(user);
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
});

// Logout
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = (req as any).token;
  revokeSessionToken(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Logout all devices
app.post('/api/auth/logout-all', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  revokeAllUserSessions(user.id);
  res.json({ success: true, message: 'Logged out from all active sessions.' });
});

// Get current profile
app.get('/api/auth/me', authMiddleware, (req, res) => {
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
app.post('/api/auth/update-profile', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const { fullName, phone, country, profilePictureUrl } = req.body;

  const updated = db.updateUser(user.id, {
    ...(fullName ? { fullName: fullName.trim() } : {}),
    ...(phone ? { phone: phone.trim() } : {}),
    ...(country ? { country: country.trim() } : {}),
    ...(profilePictureUrl ? { profilePictureUrl } : {}),
  });

  res.json({ success: true, user: updated });
});

// Change Password
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }

  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ error: 'New passwords do not match.' });
    return;
  }

  const currentComputed = hashPassword(currentPassword, user.passwordSalt);
  if (currentComputed !== user.passwordHash) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  db.updateUser(user.id, {
    passwordHash: newHash,
    passwordSalt: newSalt,
  });

  db.addAuditLog({
    action: 'PASSWORD_CHANGED',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: 'User successfully updated password.',
  });

  res.json({ success: true, message: 'Password updated successfully.' });
});

// 2FA Secret Generation
app.post('/api/auth/2fa/generate', authMiddleware, (req, res) => {
  const { secret, otpAuthUrl } = generate2FASecret();
  res.json({ secret, otpAuthUrl });
});

// 2FA Toggle
app.post('/api/auth/2fa/toggle', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const { enable, secret, code } = req.body;

  if (enable) {
    if (!code || !secret) {
      res.status(400).json({ error: 'Verification code and secret required to enable 2FA.' });
      return;
    }
    const isValid = verify2FACode(secret, code);
    if (!isValid) {
      res.status(400).json({ error: 'Invalid 2FA code. Please check your authenticator app.' });
      return;
    }
    db.updateUser(user.id, { twoFactorEnabled: true, twoFactorSecret: secret });
    res.json({ success: true, twoFactorEnabled: true });
  } else {
    db.updateUser(user.id, { twoFactorEnabled: false, twoFactorSecret: undefined });
    res.json({ success: true, twoFactorEnabled: false });
  }
});

// ==========================================
// 2. USER FINANCIAL & DASHBOARD ENDPOINTS
// ==========================================

// Complete Home Dashboard Summary
app.get('/api/user/dashboard', authMiddleware, async (req, res) => {
  const user: User = (req as any).user;
  const balanceSummary = calculateUserBalance(user.id);
  const ledger = db.getLedger(user.id);
  const earnings = db.getEarnings(user.id);
  const marketPrices = await getMarketPrices();

  // Today's earnings
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEarning = earnings.find(e => e.performanceDate === todayStr);
  const todayEarningsAmount = todayEarning ? todayEarning.earningsAmount : 0;

  // Recent 5 activities
  const recentActivity = ledger.slice(0, 5);

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
    recentActivity,
    marketPrices,
    serverTime: new Date().toISOString(),
  });
});

// User Deposits list
app.get('/api/user/deposits', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const deposits = db.getDeposits(user.id);
  res.json({ deposits });
});

// Submit BEP-20 Deposit
app.post('/api/user/deposits', authMiddleware, async (req, res) => {
  const user: User = (req as any).user;
  const { txHash, amount } = req.body;

  if (!txHash) {
    res.status(400).json({ error: 'Transaction hash is required.' });
    return;
  }

  const result = await processDeposit({
    userId: user.id,
    txHash,
    amount: amount ? Number(amount) : undefined,
    actorEmail: user.email,
  });

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const balance = calculateUserBalance(user.id);
  res.json({ success: true, deposit: result.deposit, balance });
});

// User Earnings list
app.get('/api/user/earnings', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const earnings = db.getEarnings(user.id);
  const balance = calculateUserBalance(user.id);
  res.json({ earnings, totalEarnings: balance.totalEarnings });
});

// User Withdrawals list
app.get('/api/user/withdrawals', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const withdrawals = db.getWithdrawals(user.id);
  const balance = calculateUserBalance(user.id);
  res.json({ withdrawals, balance });
});

// Submit Withdrawal Request
app.post('/api/user/withdrawals', authMiddleware, async (req, res) => {
  const user: User = (req as any).user;
  const { requestedAmount, destinationAddress, password, twoFactorCode, idempotencyKey, userNotes } = req.body;

  // Password verification
  if (!password) {
    res.status(400).json({ error: 'Account password confirmation is required for withdrawal.' });
    return;
  }
  const passHash = hashPassword(password, user.passwordSalt);
  if (passHash !== user.passwordHash) {
    res.status(401).json({ error: 'Incorrect account password.' });
    return;
  }

  // 2FA verification if enabled
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      res.status(400).json({ error: '2FA authenticator code is required.' });
      return;
    }
    const isValid = verify2FACode(user.twoFactorSecret || '', twoFactorCode);
    if (!isValid) {
      res.status(400).json({ error: 'Invalid 2FA authenticator code.' });
      return;
    }
  }

  const result = await createWithdrawalRequest({
    userId: user.id,
    requestedAmount: Number(requestedAmount),
    destinationAddress,
    idempotencyKey,
    userNotes,
    actorEmail: user.email,
  });

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const balance = calculateUserBalance(user.id);
  res.json({ success: true, withdrawal: result.withdrawal, balance });
});

// User Voluntary Fund Lock / Yield Lock Extension
app.post('/api/user/lock-funds', authMiddleware, async (req, res) => {
  const user: User = (req as any).user;
  const { days, reason } = req.body;

  const lockDays = days ? Number(days) : 30;
  const result = await lockUserFundsVoluntarily(user.id, lockDays, reason);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const balance = calculateUserBalance(user.id);
  res.json({
    success: true,
    fundLockUntil: result.fundLockUntil,
    balance,
    message: `Funds successfully locked for ${lockDays} days to ensure active yield generation.`,
  });
});

// User Transactions / Full Ledger history
app.get('/api/user/transactions', authMiddleware, (req, res) => {
  const user: User = (req as any).user;
  const ledger = db.getLedger(user.id);
  res.json({ transactions: ledger });
});

// ==========================================
// 3. ADMIN DASHBOARD & MANAGEMENT ENDPOINTS
// ==========================================

// Admin overview stats
app.get('/api/admin/dashboard', authMiddleware, adminMiddleware(), (req, res) => {
  const users = db.getUsers();
  const deposits = db.getDeposits();
  const withdrawals = db.getWithdrawals();
  const earnings = db.getEarnings();
  const performances = db.getDailyPerformances();
  const settings = db.getSettings();

  const totalUsers = users.filter(u => u.role === 'user').length;
  const activeUsers = users.filter(u => u.role === 'user' && u.status === 'active').length;

  const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
  const totalConfirmedDeposits = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);

  const paidWithdrawals = withdrawals.filter(w => w.status === 'paid');
  const totalPaidWithdrawals = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalWithdrawalFees = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);

  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending' || w.status === 'under_review');
  const totalPendingWithdrawalsAmount = pendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);

  const totalEarningsAllocated = earnings.reduce((acc, e) => acc + e.earningsAmount, 0);

  const latestPerformance = performances[0] || null;

  res.json({
    stats: {
      totalUsers,
      activeUsers,
      totalConfirmedDeposits,
      totalPaidWithdrawals,
      totalWithdrawalFees,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      totalPendingWithdrawalsAmount,
      totalEarningsAllocated,
    },
    latestPerformance,
    settings,
  });
});

// Admin Users list
app.get('/api/admin/users', authMiddleware, adminMiddleware(), (req, res) => {
  const users = db.getUsers().map(u => {
    const balance = calculateUserBalance(u.id);
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
  });
  res.json({ users });
});

// Admin toggle user status
app.post('/api/admin/users/:id/status', authMiddleware, adminMiddleware(['super_admin', 'support_admin']), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const admin: User = (req as any).user;

  if (!['active', 'suspended', 'pending_verification'].includes(status)) {
    res.status(400).json({ error: 'Invalid status value.' });
    return;
  }

  const updated = db.updateUser(id, { status });
  if (!updated) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  db.addAuditLog({
    action: 'USER_STATUS_UPDATED',
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId: id,
    afterValue: { status },
    reason: `Admin updated account status to ${status}`,
  });

  res.json({ success: true, user: updated });
});

// Admin Deposits
app.get('/api/admin/deposits', authMiddleware, adminMiddleware(), (req, res) => {
  const deposits = db.getDeposits();
  res.json({ deposits });
});

// Admin Withdrawals
app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware(), (req, res) => {
  const withdrawals = db.getWithdrawals();
  res.json({ withdrawals });
});

// Admin process withdrawal
app.post('/api/admin/withdrawals/:id/action', authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res) => {
  const admin: User = (req as any).user;
  const { id } = req.params;
  const { action, txHash, adminNotes } = req.body;

  if (!['approved', 'rejected', 'paid', 'processing'].includes(action)) {
    res.status(400).json({ error: 'Invalid action.' });
    return;
  }

  const result = await updateWithdrawalStatus(admin.id, id, action, txHash, adminNotes);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true, withdrawal: result.withdrawal });
});

// Admin Daily Performance Records & Distribution
app.get('/api/admin/performance', authMiddleware, adminMiddleware(), (req, res) => {
  const performances = db.getDailyPerformances();
  res.json({ performances });
});

app.post('/api/admin/performance', authMiddleware, adminMiddleware(['super_admin', 'finance_admin']), async (req, res) => {
  const admin: User = (req as any).user;
  const { date, overallFundAmount, actualFundPerformance, applicableRate, notes } = req.body;

  if (!date || applicableRate === undefined) {
    res.status(400).json({ error: 'Date and applicableRate are required.' });
    return;
  }

  const result = await applyDailyPerformance({
    adminUserId: admin.id,
    date,
    overallFundAmount: Number(overallFundAmount || 2500000),
    actualFundPerformance: Number(actualFundPerformance || (applicableRate * 100)),
    applicableRate: Number(applicableRate),
    notes: notes || 'Daily verified fund yield distribution',
  });

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json(result);
});

// Admin Audit Logs
app.get('/api/admin/audit-logs', authMiddleware, adminMiddleware(), (req, res) => {
  const auditLogs = db.getAuditLogs();
  res.json({ auditLogs });
});

// Admin Settings Update
app.post('/api/admin/settings', authMiddleware, adminMiddleware(['super_admin']), (req, res) => {
  const admin: User = (req as any).user;
  const newSettings = db.updateSettings(req.body);

  db.addAuditLog({
    action: 'SETTINGS_UPDATED',
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    afterValue: newSettings,
    reason: 'Super Admin updated application & wallet configurations',
  });

  res.json({ success: true, settings: newSettings });
});

// Admin Balance Adjustment
app.post('/api/admin/adjust-balance', authMiddleware, adminMiddleware(['super_admin']), async (req, res) => {
  const admin: User = (req as any).user;
  const { targetUserId, amount, reason } = req.body;

  if (!targetUserId || !amount || !reason) {
    res.status(400).json({ error: 'targetUserId, amount, and reason are required.' });
    return;
  }

  const result = await createAdminAdjustment(admin.id, targetUserId, Number(amount), reason);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const balance = calculateUserBalance(targetUserId);
  res.json({ success: true, balance });
});

// Admin Database Reset for Demonstration
app.post('/api/admin/reset-data', authMiddleware, adminMiddleware(['super_admin']), (req, res) => {
  db.resetToSeed();
  res.json({ success: true, message: 'Database reset to initial demo seeds.' });
});

// Supabase / Database Connection & Schema Migration Endpoints
import { testAndMigrateDatabase } from './server/schema-migrator';
import fs from 'fs';

app.get('/api/admin/db/status', async (req, res) => {
  try {
    const result = await testAndMigrateDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/admin/db/migrate', async (req, res) => {
  try {
    const result = await testAndMigrateDatabase();
    res.json({ success: result.postgresPoolReady, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/admin/db/schema-sql', (req, res) => {
  try {
    const schemaPath = path.join(process.cwd(), 'supabase_schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(sql);
    } else {
      res.status(404).send('-- Schema file not found');
    }
  } catch (err) {
    res.status(500).send('-- Error loading schema');
  }
});

// Run Automated Test Suite
app.post('/api/tests/run', async (req, res) => {
  try {
    const testSummary = await runAutomatedTestSuite();
    res.json(testSummary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ==========================================
// 4. VITE MIDDLEWARE & SPA FALLBACK
// ==========================================

import { seedCloudSqlDatabase } from './server/cloudsql-seed';

async function startServer() {
  // Seed Cloud SQL if configured
  if (process.env.SQL_HOST && process.env.SQL_USER) {
    try {
      await seedCloudSqlDatabase();
    } catch (e) {
      console.warn('Cloud SQL lazy seed note:', e);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`USDT Fund Management Server running on port ${PORT}`);
  });
}

startServer();
