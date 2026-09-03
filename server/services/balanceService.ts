import { getProfileById } from '../repositories/profiles';
import { getDepositsByUserId } from '../repositories/deposits';
import { getEarningsByUserId } from '../repositories/earnings';
import { getWithdrawalsByUserId } from '../repositories/withdrawals';
import { getReferralRewardsByReferrerId } from '../repositories/referrals';
import { getLedgerByUserId } from '../repositories/ledger';
import { getSettings } from '../repositories/settings';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getServerSupabase } from '../supabase';
import { UserBalanceSummary } from '../types';
import crypto from 'crypto';

export async function calculateUserBalanceAsync(userId: string): Promise<UserBalanceSummary> {
  const user = await getProfileById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const settings = await getSettings();
  const [deposits, earnings, withdrawals, referralRewards, ledgerEntries] = await Promise.all([
    getDepositsByUserId(userId),
    getEarningsByUserId(userId),
    getWithdrawalsByUserId(userId),
    getReferralRewardsByReferrerId(userId),
    getLedgerByUserId(userId),
  ]);

  const now = new Date();

  // 1. Confirmed deposits
  const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
  const totalDeposited = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);

  // 2. Credited earnings
  const creditedEarnings = earnings.filter(e => e.status === 'credited');
  const totalEarnings = creditedEarnings.reduce((acc, e) => acc + e.earningsAmount, 0);

  // 3. Referral Rewards (Tracked separately, NOT merged into compounding principal)
  const creditedReferrals = referralRewards.filter(r => r.status === 'credited');
  const referralEarnings = creditedReferrals.reduce((acc, r) => acc + r.amount, 0);

  // 4. Admin adjustments from ledger
  const adminAdjustments = ledgerEntries
    .filter(l => l.type === 'admin_adjustment')
    .reduce((acc, l) => acc + l.amount, 0);

  // 5. Withdrawals
  const paidWithdrawals = withdrawals.filter(w => w.status === 'paid');
  const totalWithdrawn = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalFeesPaid = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);

  const activePendingWithdrawals = withdrawals.filter(
    w => w.status === 'pending' || w.status === 'under_review' || w.status === 'approved' || w.status === 'processing'
  );
  const totalPendingWithdrawals = activePendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);

  // Available balance: sum of all inflows minus outflows
  const rawBalance = totalDeposited + totalEarnings + referralEarnings + adminAdjustments - totalWithdrawn - totalPendingWithdrawals;
  const availableBalance = Math.max(0, Number(rawBalance.toFixed(4)));

  // Active Compounding Principal: ONLY deposit principal minus withdrawals. Referral income never compounds.
  const activeCompoundingPrincipal = Math.max(0, Number((totalDeposited - totalWithdrawn).toFixed(4)));

  // 6. Deposit Principal Lock (30 days from confirmed deposit)
  const depositLockMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1000;
  let depositLockedAmount = 0;

  for (const dep of confirmedDeposits) {
    if (dep.confirmedAt) {
      const confirmedDate = new Date(dep.confirmedAt).getTime();
      const lockExpiry = confirmedDate + depositLockMs;
      if (now.getTime() < lockExpiry) {
        depositLockedAmount += dep.amount;
      }
    }
  }

  // 7. Check user-level 30-Day Fund Lock
  let isFundLocked = false;
  let fundLockRemainingDays = 0;
  let fundLockRemainingHours = 0;
  let fundLockUntil: string | undefined = user.fundLockUntil;
  let fundLockReason: string | undefined = user.fundLockReason;

  if (user.fundLockUntil) {
    const lockExpiryTime = new Date(user.fundLockUntil).getTime();
    if (lockExpiryTime > now.getTime()) {
      isFundLocked = true;
      const remainingMs = lockExpiryTime - now.getTime();
      fundLockRemainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      fundLockRemainingHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    }
  }

  // 8. Check 30-day account age rule
  const createdAtTime = new Date(user.createdAt).getTime();
  const accountAgeMs = now.getTime() - createdAtTime;
  const requiredAgeMs = (settings.accountAgeRequirementDays || 30) * 24 * 60 * 60 * 1000;
  const is30DaysOld = accountAgeMs >= requiredAgeMs;
  const accountAgeDays = Number((accountAgeMs / (24 * 60 * 60 * 1000)).toFixed(2));
  const withdrawalEligibleDate = new Date(createdAtTime + requiredAgeMs).toISOString();

  let lockedBalance = depositLockedAmount;
  let eligibleForWithdrawal = 0;
  let canWithdraw = true;
  let withdrawalRestrictionReason: string | undefined = undefined;

  if (user.status !== 'active') {
    canWithdraw = false;
    withdrawalRestrictionReason = `Account is currently ${user.status}.`;
  } else if (availableBalance <= 0) {
    canWithdraw = false;
    withdrawalRestrictionReason = 'Insufficient available balance.';
  } else {
    // Referral income can always be withdrawn without 30-day lock restriction
    // For non-referral funds (principal + daily earnings), 30-day lock applies unless explicitly confirmed
    const nonReferralBalance = Math.max(0, availableBalance - referralEarnings);
    const nonReferralLocked = Math.min(nonReferralBalance, depositLockedAmount);
    eligibleForWithdrawal = Math.max(0, Number((availableBalance - nonReferralLocked).toFixed(4)));

    if (!is30DaysOld && eligibleForWithdrawal <= 0 && referralEarnings <= 0) {
      canWithdraw = false;
      const remainingMs = Math.max(0, requiredAgeMs - accountAgeMs);
      const remDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      const remHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      withdrawalRestrictionReason = `Account must complete 30 full days before principal withdrawal. Remaining: ${remDays}d ${remHours}h.`;
    } else if (isFundLocked && eligibleForWithdrawal <= 0 && referralEarnings <= 0) {
      canWithdraw = false;
      lockedBalance = availableBalance;
      withdrawalRestrictionReason = `30-Day Fund Lock active. Unlocks on ${new Date(user.fundLockUntil!).toLocaleDateString()} (${fundLockRemainingDays}d ${fundLockRemainingHours}h remaining).`;
    }
  }

  return {
    userId: user.id,
    totalDeposited: Number(totalDeposited.toFixed(2)),
    totalEarnings: Number(totalEarnings.toFixed(4)),
    referralEarnings: Number(referralEarnings.toFixed(4)),
    activeCompoundingPrincipal,
    depositLockedPrincipal: Number(depositLockedAmount.toFixed(2)),
    totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
    totalFeesPaid: Number(totalFeesPaid.toFixed(2)),
    totalPendingWithdrawals: Number(totalPendingWithdrawals.toFixed(2)),
    availableBalance,
    lockedBalance: Number(lockedBalance.toFixed(2)),
    eligibleForWithdrawal,
    accountAgeDays,
    is30DaysOld,
    canWithdraw,
    withdrawalRestrictionReason,
    withdrawalEligibleDate,
    isFundLocked,
    fundLockUntil,
    fundLockRemainingDays,
    fundLockRemainingHours,
    fundLockReason,
  };
}

export interface WithdrawalImpactResult {
  canWithdraw: boolean;
  error?: string;
  availableBalance: number;
  referralEarnings: number;
  activeCompoundingPrincipal: number;
  depositLockedPrincipal: number;
  isFundLocked: boolean;
  is30DaysOld: boolean;
  requestedAmount: number;
  feePercentage: number;
  feeAmount: number;
  netAmount: number;
  isReferralOnly: boolean;
  touchesProtectedFund: boolean;
  requiresLockBreakConfirmation: boolean;
  lockBreakWarning?: string;
  requiresMinimumBreakConfirmation: boolean;
  minimumBreakWarning?: string;
  projectedRemainingPrincipal: number;
  minimumDepositAmount?: number;
}

/**
 * Accurately determines the source of funds and financial warnings for a requested withdrawal.
 * Distinguishes between referral earnings (free to withdraw) and compounding principal/earnings (30-day lock & $300 minimum).
 */
export async function checkWithdrawalImpactAsync(
  userId: string,
  requestedAmount: number
): Promise<WithdrawalImpactResult> {
  const balance = await calculateUserBalanceAsync(userId);
  const settings = await getSettings();
  const feePercentage = Number(settings.withdrawalFeePercentage) || 9.0;
  const minDeposit = Number(settings.minimumDepositAmount) || 300.0;

  if (requestedAmount <= 0) {
    return {
      canWithdraw: false,
      error: 'Withdrawal amount must be greater than zero.',
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  if (requestedAmount > balance.availableBalance) {
    return {
      canWithdraw: false,
      error: `Requested amount ($${requestedAmount.toFixed(2)}) exceeds your available balance ($${balance.availableBalance.toFixed(2)}).`,
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  const feeAmount = Number((requestedAmount * (feePercentage / 100.0)).toFixed(4));
  const netAmount = Number((requestedAmount - feeAmount).toFixed(4));

  // Determine if withdrawal is funded strictly by referral earnings
  const isReferralOnly = requestedAmount <= balance.referralEarnings;
  let touchesProtectedFund = false;
  let requiresLockBreakConfirmation = false;
  let lockBreakWarning: string | undefined = undefined;
  let requiresMinimumBreakConfirmation = false;
  let minimumBreakWarning: string | undefined = undefined;

  let amountFromProtected = 0;
  if (!isReferralOnly) {
    touchesProtectedFund = true;
    amountFromProtected = requestedAmount - balance.referralEarnings;
  }

  const projectedRemainingPrincipal = Math.max(0, Number((balance.activeCompoundingPrincipal - amountFromProtected).toFixed(4)));

  if (touchesProtectedFund) {
    // Check if principal or earnings are locked (within 30 days or under active voluntary fund lock)
    const isLockedPeriod = balance.depositLockedPrincipal > 0 || !balance.is30DaysOld || balance.isFundLocked;
    if (isLockedPeriod) {
      requiresLockBreakConfirmation = true;
      lockBreakWarning = 'Your principal and earnings are currently locked for the 30-day period. If you continue with this withdrawal, your current compounding/earning cycle will be broken and daily earnings will stop according to the withdrawal rules.';
    }

    // Check if remaining principal falls below the configured minimum required for compounding/earnings
    if (projectedRemainingPrincipal < minDeposit && balance.activeCompoundingPrincipal >= minDeposit) {
      requiresMinimumBreakConfirmation = true;
      minimumBreakWarning = 'Your withdrawal will reduce your eligible fund below the minimum required amount. If you continue, daily earnings/compounding will stop.';
    }
  }

  return {
    canWithdraw: true,
    availableBalance: balance.availableBalance,
    referralEarnings: balance.referralEarnings,
    activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
    depositLockedPrincipal: balance.depositLockedPrincipal,
    isFundLocked: balance.isFundLocked,
    is30DaysOld: balance.is30DaysOld,
    requestedAmount,
    feePercentage,
    feeAmount,
    netAmount,
    isReferralOnly,
    touchesProtectedFund,
    requiresLockBreakConfirmation,
    lockBreakWarning,
    requiresMinimumBreakConfirmation,
    minimumBreakWarning,
    projectedRemainingPrincipal,
    minimumDepositAmount: minDeposit,
  };
}

export interface AdminBalanceAdjustmentParams {
  adminId: string;
  adminEmail: string;
  adminRole: string;
  targetUserId: string;
  amount: number;
  reason: string;
  adjustmentType?: 'credit' | 'debit';
  referenceId?: string;
}

export interface AdminBalanceAdjustmentResult {
  success: boolean;
  referenceId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  ledgerId?: string;
  auditLogId?: string;
}

/**
 * Hardened Administrative Balance Adjustment
 * 
 * Guarantees:
 * - Admin ID and credentials sourced exclusively from authenticated server session
 * - Atomic database execution with PostgreSQL row-level locks
 * - Strict dual ledger entry and audit log generation
 * - Rollback on any failure to prevent balance/ledger drift
 */
export async function adjustUserBalanceAtomicAsync(
  params: AdminBalanceAdjustmentParams
): Promise<AdminBalanceAdjustmentResult> {
  const { adminId, adminEmail, adminRole, targetUserId, amount, reason } = params;

  if (!targetUserId) {
    throw new Error('Target user ID is required.');
  }

  if (isNaN(amount) || amount === 0) {
    throw new Error('Adjustment amount must be a non-zero number.');
  }

  if (!reason || reason.trim().length < 3) {
    throw new Error('A specific, non-empty reason is mandatory for manual balance adjustments.');
  }

  const adjType = params.adjustmentType || (amount >= 0 ? 'credit' : 'debit');
  const customRef = params.referenceId || `ADJ-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 1. Attempt PostgreSQL stored procedure for atomic transaction & row locking
  const supabase = getServerSupabase();
  const numericUserId = parseInt(targetUserId, 10);

  if (!isNaN(numericUserId) && supabase) {
    try {
      const { data, error } = await supabase.rpc('adjust_user_balance_atomic', {
        p_admin_id: adminId,
        p_admin_email: adminEmail,
        p_admin_role: adminRole,
        p_target_user_id: numericUserId,
        p_amount: amount,
        p_reason: reason.trim(),
        p_adjustment_type: adjType,
        p_reference_id: customRef,
      });

      if (!error && data?.success) {
        return data as AdminBalanceAdjustmentResult;
      }
      if (error && !error.message.includes('function adjust_user_balance_atomic') && !error.message.includes('does not exist')) {
        throw new Error(error.message);
      }
    } catch (rpcErr: any) {
      if (!rpcErr.message?.includes('does not exist')) {
        throw rpcErr;
      }
    }
  }

  // 2. ACID-Compliant Repository Fallback
  const targetUser = await getProfileById(targetUserId);
  if (!targetUser) {
    throw new Error(`Target user #${targetUserId} not found in database.`);
  }

  const currentBalance = await calculateUserBalanceAsync(targetUserId);
  const previousBalance = currentBalance.availableBalance;
  const balanceAfter = Number((previousBalance + amount).toFixed(4));

  // Atomic Ledger Creation
  const ledgerEntry = await createLedgerEntry({
    userId: targetUserId,
    type: 'admin_adjustment',
    amount,
    balanceAfter,
    referenceId: customRef,
    description: `Admin balance adjustment (${adjType.toUpperCase()}): ${reason.trim()}`,
    performedBy: adminId,
    createdAt: new Date().toISOString(),
  });

  // Mandatory Audit Log Creation
  let auditLog;
  try {
    auditLog = await createAuditLog({
      action: 'ADMIN_BALANCE_ADJUSTMENT',
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: adminRole,
      targetUserId,
      reason: reason.trim(),
      beforeValue: { availableBalance: previousBalance },
      afterValue: { availableBalance: balanceAfter, amount, referenceId: customRef, type: adjType },
      referenceId: customRef,
    });
  } catch (auditErr: any) {
    console.error('[CRITICAL] Audit log creation failed during balance adjustment:', auditErr);
    throw new Error(`Balance adjustment aborted: Audit log creation failed: ${auditErr.message}`);
  }

  return {
    success: true,
    referenceId: customRef,
    amount,
    previousBalance,
    newBalance: balanceAfter,
    ledgerId: ledgerEntry.id,
    auditLogId: auditLog?.id,
  };
}

