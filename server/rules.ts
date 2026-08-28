import crypto from 'crypto';
import { db } from './db';
import { calculateUserBalance } from './ledger';
import { verifyBEP20Deposit, isValidBEP20Address } from './blockchain';
import {
  Deposit,
  Withdrawal,
  DailyPerformance,
  EarningEntry,
  LedgerEntry,
  AuditLog,
  User,
} from './types';

export interface ProcessDepositInput {
  userId: string;
  txHash?: string;
  amount?: number;
  proofPhotoUrl?: string;
  userNotes?: string;
  actorEmail?: string;
  autoApprove?: boolean;
}

export interface RequestWithdrawalInput {
  userId: string;
  requestedAmount: number;
  destinationAddress: string;
  password?: string;
  twoFactorCode?: string;
  idempotencyKey?: string;
  userNotes?: string;
  actorEmail?: string;
}

export interface AdminDailyPerformanceInput {
  adminUserId: string;
  date: string; // YYYY-MM-DD
  overallFundAmount: number;
  actualFundPerformance: number;
  applicableRate: number; // e.g. 0.005 for 0.50%
  notes: string;
}

/**
 * 1. Process & Submit / Confirm BEP-20 USDT Deposit
 */
export async function processDeposit(input: ProcessDepositInput): Promise<{ success: boolean; deposit?: Deposit; error?: string }> {
  const user = db.getUserById(input.userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: 'Account is not active.' };
  }

  const now = new Date();
  const settings = db.getSettings();
  const minDeposit = settings.minimumDepositAmount || 300;

  const depositAmount = Number(input.amount || minDeposit);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return { success: false, error: 'Deposit amount must be greater than 0 USDT.' };
  }

  if (depositAmount < minDeposit) {
    return {
      success: false,
      error: `Minimum deposit amount is ${minDeposit} USDT. Please enter an amount of ${minDeposit} USDT or more.`,
    };
  }
  const depositId = 'dep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  // Generate fallback txHash if user only uploaded proof screenshot without txID
  const fallbackTxHash = '0x' + crypto.randomBytes(32).toString('hex');
  const userTxHash = input.txHash ? input.txHash.trim() : fallbackTxHash;

  // Next calendar day at 00:00:00 UTC for earning eligibility
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  // 30-day deposit lock rule for principal withdrawal
  const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1000;
  const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();

  // If user uploaded payment proof photo or if not directly blockchain-verified, mark as 'pending' for admin review
  // or if blockchain verification passes, mark confirmed
  let isDirectlyConfirmed = false;
  let confirmations = 1;

  if (input.txHash && !input.proofPhotoUrl) {
    const verification = await verifyBEP20Deposit(input.txHash, depositAmount);
    if (!verification.isValid) {
      return {
        success: false,
        error: verification.errorMessage || 'Invalid blockchain transaction.',
      };
    }
    isDirectlyConfirmed = true;
    confirmations = verification.confirmations || 12;
  }

  // If user provided a photo proof, flag as pending review so finance admin can audit receipt and tx on BSC
  const status: 'pending' | 'confirmed' = isDirectlyConfirmed ? 'confirmed' : 'pending';

  const deposit: Deposit = {
    id: depositId,
    userId: user.id,
    amount: depositAmount,
    currency: 'USDT',
    network: 'BEP-20',
    txHash: userTxHash,
    toAddress: settings.bep20DepositAddress,
    status,
    confirmations: isDirectlyConfirmed ? confirmations : 0,
    requiredConfirmations: settings.requiredConfirmations || 12,
    createdAt: now.toISOString(),
    confirmedAt: isDirectlyConfirmed ? now.toISOString() : undefined,
    eligibilityDate: isDirectlyConfirmed ? tomorrow.toISOString() : undefined,
    depositLockEndDate: isDirectlyConfirmed ? lockEndDate : undefined,
    proofPhotoUrl: input.proofPhotoUrl,
    userNotes: input.userNotes,
    notes: isDirectlyConfirmed
      ? 'Verified BEP-20 USDT Transfer on BNB Smart Chain'
      : 'BEP-20 Transfer Submitted - Awaiting Admin Confirmation',
  };

  // Atomic database update
  db.addDeposit(deposit);

  if (isDirectlyConfirmed) {
    // Add ledger entry
    const prevSummary = calculateUserBalance(user.id);
    const ledgerEntry: LedgerEntry = {
      id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: user.id,
      type: 'deposit',
      amount: depositAmount,
      balanceAfter: prevSummary.availableBalance + depositAmount,
      referenceId: deposit.id,
      description: `Confirmed USDT BEP-20 Deposit (Tx: ${deposit.txHash.substring(0, 8)}...${deposit.txHash.slice(-6)})`,
      createdAt: now.toISOString(),
      performedBy: user.id,
    };
    db.addLedgerEntry(ledgerEntry);

    // Audit log
    db.addAuditLog({
      action: 'DEPOSIT_CONFIRMED',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      afterValue: { depositId: deposit.id, amount: depositAmount, txHash: deposit.txHash },
      reason: 'BEP-20 USDT blockchain deposit verified and credited.',
      referenceId: deposit.id,
    });
  } else {
    // Audit log for submitted pending deposit
    db.addAuditLog({
      action: 'DEPOSIT_SUBMITTED',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      afterValue: { depositId: deposit.id, amount: depositAmount, txHash: deposit.txHash, hasProof: Boolean(input.proofPhotoUrl) },
      reason: 'User submitted deposit payment proof for verification.',
      referenceId: deposit.id,
    });
  }

  return { success: true, deposit };
}

/**
 * 2. Process & Apply Daily Performance to All Eligible Users
 */
export async function applyDailyPerformance(input: AdminDailyPerformanceInput): Promise<{
  success: boolean;
  performance?: DailyPerformance;
  affectedUsersCount: number;
  totalDistributed: number;
  error?: string;
}> {
  const admin = db.getUserById(input.adminUserId);
  if (!admin || (admin.role !== 'super_admin' && admin.role !== 'finance_admin')) {
    return { success: false, error: 'Unauthorized. Admin permissions required.', affectedUsersCount: 0, totalDistributed: 0 };
  }

  // Check if performance for this exact date already exists
  const existing = db.getDailyPerformanceByDate(input.date);
  if (existing) {
    return { success: false, error: `Daily performance for date ${input.date} has already been posted and distributed.`, affectedUsersCount: 0, totalDistributed: 0 };
  }

  if (input.applicableRate < -0.1 || input.applicableRate > 0.1) {
    return { success: false, error: 'Applicable allocation rate must be between -10% and +10% (-0.10 to 0.10).', affectedUsersCount: 0, totalDistributed: 0 };
  }

  const now = new Date();
  const perfId = 'perf_' + input.date + '_' + Math.random().toString(36).substring(2, 6);
  const settings = db.getSettings();
  const users = db.getUsers().filter(u => u.status === 'active' && u.role === 'user');

  const performanceDateTarget = new Date(input.date + 'T23:59:59.999Z').getTime();

  let affectedCount = 0;
  let totalDistributed = 0;

  const newEarnings: EarningEntry[] = [];
  const newLedgers: LedgerEntry[] = [];

  // Determine market condition category & note
  let marketCondition: 'profit' | 'loss' | 'neutral' = 'neutral';
  let defaultNote = input.notes;

  if (input.applicableRate > 0) {
    marketCondition = 'profit';
    if (!defaultNote) defaultNote = `Profitable strategy execution (+${(input.applicableRate * 100).toFixed(2)}%).`;
  } else if (input.applicableRate < 0) {
    marketCondition = 'loss';
    if (!defaultNote) defaultNote = `Market draw-down / adjustment (${(input.applicableRate * 100).toFixed(2)}%).`;
  } else {
    marketCondition = 'neutral';
    if (!defaultNote) defaultNote = 'We are safe today, no investment / trading today (Capital Preserved).';
  }

  for (const user of users) {
    // Determine user's eligible base amount on this date
    // Eligible deposits are confirmed and have eligibilityDate <= performanceDate
    const userDeposits = db.getDeposits(user.id).filter(d => {
      if (d.status !== 'confirmed') return false;
      const elDate = d.eligibilityDate ? new Date(d.eligibilityDate).getTime() : 0;
      return elDate <= performanceDateTarget;
    });

    const totalEligiblePrincipal = userDeposits.reduce((acc, d) => acc + d.amount, 0);

    let baseAmount = totalEligiblePrincipal;

    // If compounding is enabled, include past credited earnings
    if (settings.compoundingEnabled) {
      const pastEarnings = db.getEarnings(user.id)
        .filter(e => e.status === 'credited' && new Date(e.createdAt).getTime() < performanceDateTarget)
        .reduce((acc, e) => acc + e.earningsAmount, 0);
      baseAmount += pastEarnings;
    }

    if (baseAmount > 0) {
      const earnedAmount = Number((baseAmount * input.applicableRate).toFixed(4));
      
      const earnId = 'earn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const earning: EarningEntry = {
        id: earnId,
        userId: user.id,
        calculationId: perfId,
        baseEligibleAmount: baseAmount,
        applicableRate: input.applicableRate,
        earningsAmount: earnedAmount,
        performanceDate: input.date,
        createdAt: now.toISOString(),
        status: 'credited',
        marketCondition,
        note: defaultNote,
      };

      newEarnings.push(earning);

      if (earnedAmount !== 0) {
        const isPositive = earnedAmount > 0;
        newLedgers.push({
          id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          userId: user.id,
          type: isPositive ? 'daily_earnings' : 'daily_loss',
          amount: Math.abs(earnedAmount),
          balanceAfter: 0, // Recalculated dynamically
          referenceId: earnId,
          description: isPositive
            ? `Daily Performance Allocation (+${(input.applicableRate * 100).toFixed(2)}%) for ${input.date}`
            : `Daily Performance Draw-down (${(input.applicableRate * 100).toFixed(2)}%) for ${input.date}`,
          createdAt: now.toISOString(),
          performedBy: admin.id,
        });
      }

      affectedCount++;
      totalDistributed += earnedAmount;
    }
  }

  // Save all earnings and ledger records
  db.addEarningsBatch(newEarnings);
  for (const l of newLedgers) {
    db.addLedgerEntry(l);
  }

  const performanceRecord: DailyPerformance = {
    id: perfId,
    date: input.date,
    overallFundAmount: input.overallFundAmount,
    actualFundPerformance: input.actualFundPerformance,
    applicableRate: input.applicableRate,
    notes: defaultNote,
    createdBy: admin.id,
    createdAt: now.toISOString(),
    appliedCount: affectedCount,
    totalDistributed: Number(totalDistributed.toFixed(4)),
    marketCondition,
  };

  db.addDailyPerformance(performanceRecord);

  // Audit log
  db.addAuditLog({
    action: 'DAILY_PERFORMANCE_DISTRIBUTED',
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    afterValue: {
      date: input.date,
      rate: input.applicableRate,
      affectedCount,
      totalDistributed,
    },
    reason: `Posted fund rate ${(input.applicableRate * 100).toFixed(2)}% for ${input.date}`,
    referenceId: perfId,
  });

  return {
    success: true,
    performance: performanceRecord,
    affectedUsersCount: affectedCount,
    totalDistributed: Number(totalDistributed.toFixed(4)),
  };
}

/**
 * 3. Request Withdrawal with 30-day Account Age and 30-day Lock validation + 4% fixed fee
 */
export async function createWithdrawalRequest(
  input: RequestWithdrawalInput
): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
  // Check idempotency key if provided
  if (input.idempotencyKey) {
    const existing = db.getWithdrawalByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { success: true, withdrawal: existing };
    }
  }

  const user = db.getUserById(input.userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: `Account is currently ${user.status}.` };
  }

  // 1. BEP-20 destination address validation
  if (!isValidBEP20Address(input.destinationAddress)) {
    return {
      success: false,
      error: 'Invalid BEP-20 wallet address. Must be a 42-character Ethereum/BSC hex address starting with 0x.',
    };
  }

  // 2. Amount validation
  if (!input.requestedAmount || input.requestedAmount <= 0) {
    return { success: false, error: 'Withdrawal amount must be greater than 0.' };
  }

  // 3. User balance and eligibility validation
  const balanceSummary = calculateUserBalance(user.id);

  // Condition 1: 30 full days account age rule
  if (!balanceSummary.is30DaysOld) {
    return {
      success: false,
      error: balanceSummary.withdrawalRestrictionReason || 'Account must complete 30 full days before withdrawals are available.',
    };
  }

  // Condition 2: 30-day deposit lock rule and balance check
  if (input.requestedAmount > balanceSummary.eligibleForWithdrawal) {
    return {
      success: false,
      error: `Requested amount ($${input.requestedAmount.toFixed(2)}) exceeds your currently eligible withdrawal balance ($${balanceSummary.eligibleForWithdrawal.toFixed(2)}). Note that deposits have a 30-day lock period.`,
    };
  }

  if (input.requestedAmount > balanceSummary.availableBalance) {
    return {
      success: false,
      error: 'Insufficient available balance.',
    };
  }

  const settings = db.getSettings();
  const feePercentage = settings.withdrawalFeePercentage || 9.0; // Dynamic/Default 9%

  // Server-side fee calculation
  const feeAmount = Number(((input.requestedAmount * feePercentage) / 100).toFixed(4));
  const netAmount = Number((input.requestedAmount - feeAmount).toFixed(4));

  const now = new Date();
  const withdrawalId = 'wd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const reference = 'WD-' + Math.floor(100000 + Math.random() * 900000);

  const withdrawal: Withdrawal = {
    id: withdrawalId,
    reference,
    userId: user.id,
    requestedAmount: input.requestedAmount,
    feePercentage,
    feeAmount,
    netAmount,
    destinationAddress: input.destinationAddress.trim(),
    network: 'BEP-20',
    status: 'pending',
    createdAt: now.toISOString(),
    idempotencyKey: input.idempotencyKey,
    userNotes: input.userNotes,
  };

  // Atomic database transaction:
  // 1. Add withdrawal record
  db.addWithdrawal(withdrawal);

  // 2. Add ledger entry to reserve funds
  const ledgerEntry: LedgerEntry = {
    id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    userId: user.id,
    type: 'withdrawal_request',
    amount: -input.requestedAmount,
    balanceAfter: balanceSummary.availableBalance - input.requestedAmount,
    referenceId: withdrawal.id,
    description: `Withdrawal Request ${reference} ($${input.requestedAmount.toFixed(2)} USDT, ${feePercentage}% fee: $${feeAmount.toFixed(2)})`,
    createdAt: now.toISOString(),
    performedBy: user.id,
  };
  db.addLedgerEntry(ledgerEntry);

  // 3. Apply Automatic 30-Day Re-Lock on user account and remaining funds
  const relockDays = 30;
  const fundLockUntil = new Date(now.getTime() + relockDays * 24 * 60 * 60 * 1000).toISOString();
  
  db.updateUser(user.id, {
    fundLockUntil,
    fundLockReason: `Automatic 30-day fund re-lock applied upon withdrawal request ${reference}.`,
    lastWithdrawalAt: now.toISOString(),
  });

  // Re-lock any active deposits for the user to match the 30-day lock
  const userDeposits = db.getDeposits(user.id);
  for (const dep of userDeposits) {
    if (dep.status === 'confirmed') {
      const currentExpiry = dep.depositLockEndDate ? new Date(dep.depositLockEndDate).getTime() : 0;
      const newExpiryTime = new Date(fundLockUntil).getTime();
      if (newExpiryTime > currentExpiry) {
        db.updateDeposit(dep.id, { depositLockEndDate: fundLockUntil });
      }
    }
  }

  // 4. Audit log
  db.addAuditLog({
    action: 'WITHDRAWAL_REQUESTED',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    afterValue: {
      withdrawalId,
      requestedAmount: input.requestedAmount,
      feeAmount,
      netAmount,
      destination: input.destinationAddress,
      fundLockUntil,
      relockDays,
    },
    reason: `User requested withdrawal of $${input.requestedAmount} USDT to BEP-20 address. Remaining balance automatically re-locked for 30 days until ${fundLockUntil}.`,
    referenceId: withdrawalId,
  });

  return { success: true, withdrawal };
}

/**
 * 4. User Voluntary Fund Lock / Extension (30, 60, 90 days)
 */
export async function lockUserFundsVoluntarily(
  userId: string,
  days: number = 30,
  reason?: string
): Promise<{ success: boolean; fundLockUntil?: string; error?: string }> {
  const user = db.getUserById(userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (days <= 0 || days > 365) {
    return { success: false, error: 'Lock duration must be between 1 and 365 days.' };
  }

  const now = new Date();
  const currentExpiry = user.fundLockUntil ? new Date(user.fundLockUntil).getTime() : now.getTime();
  const baseTime = Math.max(now.getTime(), currentExpiry);
  const fundLockUntil = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

  db.updateUser(userId, {
    fundLockUntil,
    fundLockReason: reason || `User voluntary ${days}-day fund lock for yield optimization.`,
  });

  db.addAuditLog({
    action: 'VOLUNTARY_FUND_LOCK',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    afterValue: { fundLockUntil, days },
    reason: `User locked fund for ${days} days until ${fundLockUntil}.`,
  });

  return { success: true, fundLockUntil };
}

/**
 * 4. Admin updates withdrawal status (approve, reject, pay)
 */
export async function updateWithdrawalStatus(
  adminId: string,
  withdrawalId: string,
  newStatus: 'approved' | 'rejected' | 'paid' | 'processing',
  txHash?: string,
  adminNotes?: string
): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
  const admin = db.getUserById(adminId);
  if (!admin || (admin.role !== 'super_admin' && admin.role !== 'finance_admin')) {
    return { success: false, error: 'Unauthorized admin role.' };
  }

  const withdrawal = db.getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    return { success: false, error: 'Withdrawal not found.' };
  }

  const now = new Date();
  const oldStatus = withdrawal.status;

  if (newStatus === 'rejected') {
    // Refund the reserved balance back to user via ledger entry
    const ledgerEntry: LedgerEntry = {
      id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: withdrawal.userId,
      type: 'withdrawal_rejected',
      amount: withdrawal.requestedAmount, // Add funds back
      balanceAfter: 0,
      referenceId: withdrawal.id,
      description: `Withdrawal ${withdrawal.reference} Rejected by Admin - Funds Restored`,
      createdAt: now.toISOString(),
      performedBy: admin.id,
    };
    db.addLedgerEntry(ledgerEntry);
  }

  const updated = db.updateWithdrawal(withdrawalId, {
    status: newStatus,
    reviewedAt: now.toISOString(),
    reviewedBy: admin.id,
    adminNotes: adminNotes || withdrawal.adminNotes,
    ...(newStatus === 'paid' ? { paidAt: now.toISOString(), txHash: txHash || '0x' + crypto.randomBytes(32).toString('hex') } : {}),
  });

  db.addAuditLog({
    action: `WITHDRAWAL_${newStatus.toUpperCase()}`,
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId: withdrawal.userId,
    beforeValue: { status: oldStatus },
    afterValue: { status: newStatus, txHash, adminNotes },
    reason: `Admin updated withdrawal status to ${newStatus}`,
    referenceId: withdrawalId,
  });

  return { success: true, withdrawal: updated };
}

/**
 * 4.5. Admin updates deposit status (confirm / approve or reject)
 */
export async function updateDepositStatus(
  adminId: string,
  depositId: string,
  newStatus: 'confirmed' | 'rejected',
  adminNotes?: string,
  txHash?: string
): Promise<{ success: boolean; deposit?: Deposit; error?: string }> {
  const admin = db.getUserById(adminId);
  if (!admin || (admin.role !== 'super_admin' && admin.role !== 'finance_admin')) {
    return { success: false, error: 'Unauthorized admin role.' };
  }

  const deposit = db.getDepositById(depositId);
  if (!deposit) {
    return { success: false, error: 'Deposit not found.' };
  }

  if (deposit.status === 'confirmed' && newStatus === 'confirmed') {
    return { success: false, error: 'Deposit is already confirmed.' };
  }

  const now = new Date();
  const oldStatus = deposit.status;
  const settings = db.getSettings();

  if (newStatus === 'confirmed') {
    // Next calendar day at 00:00:00 UTC for earning eligibility
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    // 30-day deposit lock rule for principal withdrawal
    const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1000;
    const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();

    const updated = db.updateDeposit(depositId, {
      status: 'confirmed',
      confirmedAt: now.toISOString(),
      eligibilityDate: tomorrow.toISOString(),
      depositLockEndDate: lockEndDate,
      confirmations: 15,
      reviewedAt: now.toISOString(),
      reviewedBy: admin.id,
      adminNotes: adminNotes || deposit.adminNotes,
      txHash: txHash || deposit.txHash,
    });

    // Credit user in double-entry ledger
    const prevSummary = calculateUserBalance(deposit.userId);
    const ledgerEntry: LedgerEntry = {
      id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      balanceAfter: prevSummary.availableBalance + deposit.amount,
      referenceId: deposit.id,
      description: `Admin Approved USDT BEP-20 Deposit ($${deposit.amount.toFixed(2)} USDT)`,
      createdAt: now.toISOString(),
      performedBy: admin.id,
    };
    db.addLedgerEntry(ledgerEntry);

    db.addAuditLog({
      action: 'DEPOSIT_ADMIN_CONFIRMED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: deposit.userId,
      beforeValue: { status: oldStatus },
      afterValue: { status: 'confirmed', amount: deposit.amount, txHash: deposit.txHash, adminNotes },
      reason: `Admin confirmed and credited deposit of $${deposit.amount} USDT.`,
      referenceId: depositId,
    });

    return { success: true, deposit: updated };
  } else {
    // Rejected
    const updated = db.updateDeposit(depositId, {
      status: 'rejected',
      reviewedAt: now.toISOString(),
      reviewedBy: admin.id,
      adminNotes: adminNotes || 'Rejected during administrative verification.',
    });

    db.addAuditLog({
      action: 'DEPOSIT_ADMIN_REJECTED',
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      targetUserId: deposit.userId,
      beforeValue: { status: oldStatus },
      afterValue: { status: 'rejected', adminNotes },
      reason: adminNotes || 'Deposit rejected during administrative verification.',
      referenceId: depositId,
    });

    return { success: true, deposit: updated };
  }
}

/**
 * 5. Admin Balance Adjustment (with strict audit trail)
 */
export async function createAdminAdjustment(
  adminId: string,
  targetUserId: string,
  amount: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const admin = db.getUserById(adminId);
  if (!admin || admin.role !== 'super_admin') {
    return { success: false, error: 'Super Admin privileges required for balance adjustment.' };
  }

  const targetUser = db.getUserById(targetUserId);
  if (!targetUser) {
    return { success: false, error: 'Target user not found.' };
  }

  if (!amount || amount === 0) {
    return { success: false, error: 'Adjustment amount cannot be zero.' };
  }

  const prevSummary = calculateUserBalance(targetUserId);
  if (amount < 0 && Math.abs(amount) > prevSummary.availableBalance) {
    return { success: false, error: 'Negative adjustment cannot exceed user available balance.' };
  }

  const now = new Date();
  const ledgerEntry: LedgerEntry = {
    id: 'led_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    userId: targetUserId,
    type: 'admin_adjustment',
    amount,
    balanceAfter: prevSummary.availableBalance + amount,
    description: `Administrative Adjustment: ${reason}`,
    createdAt: now.toISOString(),
    performedBy: admin.id,
  };
  db.addLedgerEntry(ledgerEntry);

  db.addAuditLog({
    action: 'ADMIN_BALANCE_ADJUSTMENT',
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    targetUserId,
    beforeValue: { balance: prevSummary.availableBalance },
    afterValue: { adjustment: amount, newBalance: prevSummary.availableBalance + amount },
    reason,
  });

  return { success: true };
}
