import {
  Deposit,
  Withdrawal,
  DailyPerformance,
  LedgerEntry,
} from './types';
import { processDepositAsync, updateDepositStatusAsync } from './services/depositService';
import { createWithdrawalRequestAsync, updateWithdrawalStatusAsync } from './services/withdrawalService';
import { applyDailyPerformanceAsync } from './services/performanceService';
import { calculateUserBalanceAsync } from './services/balanceService';
import { getProfileById, updateProfile } from './repositories/profiles';
import { getSettings } from './repositories/settings';
import { createAuditLog } from './repositories/auditLogs';
import { createLedgerEntry } from './repositories/ledger';

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
  return processDepositAsync(input);
}

/**
 * 2. Request BEP-20 USDT Withdrawal
 */
export async function requestWithdrawal(input: RequestWithdrawalInput): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
  return createWithdrawalRequestAsync(input);
}

/**
 * 3. Super Admin Daily Yield Distribution
 */
export async function applyDailyPerformance(input: AdminDailyPerformanceInput): Promise<{
  success: boolean;
  performance?: DailyPerformance;
  distributedCount?: number;
  totalDistributedAmount?: number;
  error?: string;
}> {
  return applyDailyPerformanceAsync(input);
}

/**
 * Voluntary fund lock
 */
export async function lockUserFundVoluntary(
  userId: string,
  days: number,
  reason?: string
): Promise<{ success: boolean; fundLockUntil?: string; error?: string }> {
  const user = await getProfileById(userId);
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

  await updateProfile(userId, {
    fundLockUntil,
    fundLockReason: reason || `User voluntary ${days}-day fund lock for yield optimization.`,
  });

  await createAuditLog({
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
 * 4. Admin updates withdrawal status (approve, reject, paid, processing)
 */
export async function updateWithdrawalStatus(
  adminId: string,
  withdrawalId: string,
  newStatus: 'approved' | 'rejected' | 'paid' | 'processing',
  txHash?: string,
  adminNotes?: string
): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
  return updateWithdrawalStatusAsync(adminId, withdrawalId, newStatus, txHash, adminNotes);
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
  return updateDepositStatusAsync(adminId, depositId, newStatus, adminNotes, txHash);
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
  const admin = await getProfileById(adminId);
  if (!admin || admin.role !== 'super_admin') {
    return { success: false, error: 'Super Admin privileges required for balance adjustment.' };
  }

  const targetUser = await getProfileById(targetUserId);
  if (!targetUser) {
    return { success: false, error: 'Target user not found.' };
  }

  if (!amount || amount === 0) {
    return { success: false, error: 'Adjustment amount cannot be zero.' };
  }

  const prevSummary = await calculateUserBalanceAsync(targetUserId);
  if (amount < 0 && Math.abs(amount) > prevSummary.availableBalance) {
    return { success: false, error: 'Negative adjustment cannot exceed user available balance.' };
  }

  const now = new Date();
  await createLedgerEntry({
    userId: targetUserId,
    type: 'admin_adjustment',
    amount,
    balanceAfter: prevSummary.availableBalance + amount,
    description: `Administrative Adjustment: ${reason}`,
    createdAt: now.toISOString(),
    performedBy: admin.id,
  });

  await createAuditLog({
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
