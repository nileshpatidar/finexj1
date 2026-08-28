import { getProfileById, updateProfile } from '../repositories/profiles';
import {
  createWithdrawal,
  getWithdrawalById,
  getWithdrawalsByUserId,
  updateWithdrawal,
} from '../repositories/withdrawals';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getSettings } from '../repositories/settings';
import { isValidBEP20Address } from '../blockchain';
import { calculateUserBalanceAsync } from './balanceService';
import { Withdrawal } from '../types';

export interface RequestWithdrawalInput {
  userId: string;
  requestedAmount: number;
  destinationAddress: string;
  idempotencyKey?: string;
  userNotes?: string;
  actorEmail?: string;
}

export async function createWithdrawalRequestAsync(input: RequestWithdrawalInput): Promise<{
  success: boolean;
  withdrawal?: Withdrawal;
  error?: string;
}> {
  const user = await getProfileById(input.userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: `Account is currently ${user.status}.` };
  }

  const requestedAmount = Number(input.requestedAmount);
  if (isNaN(requestedAmount) || requestedAmount <= 0) {
    return { success: false, error: 'Please enter a valid withdrawal amount greater than 0 USDT.' };
  }

  // Destination address verification
  if (!input.destinationAddress || !isValidBEP20Address(input.destinationAddress)) {
    return {
      success: false,
      error: 'Invalid BEP-20 destination address. Please provide a valid 0x BNB Chain address.',
    };
  }

  // Idempotency check: if user already submitted with this idempotencyKey, return existing record
  if (input.idempotencyKey) {
    const existingWds = await getWithdrawalsByUserId(user.id);
    const matched = existingWds.find(w => w.idempotencyKey === input.idempotencyKey);
    if (matched) {
      return { success: true, withdrawal: matched };
    }
  }

  // Calculate user eligibility and balance
  const balance = await calculateUserBalanceAsync(user.id);
  const settings = await getSettings();

  // 1. Check account age rule (dynamically from settings, defaults to 30 days)
  const requiredDays = Number(settings.accountAgeRequirementDays) || 30;
  const createdAtTime = new Date(user.createdAt).getTime();
  const now = new Date();
  const accountAgeMs = now.getTime() - createdAtTime;
  const requiredAgeMs = requiredDays * 24 * 60 * 60 * 1000;

  if (accountAgeMs < requiredAgeMs) {
    const remMs = requiredAgeMs - accountAgeMs;
    const remDays = Math.floor(remMs / (24 * 60 * 60 * 1000));
    const remHours = Math.floor((remMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return {
      success: false,
      error: `Withdrawal not permitted. Your account must be active for at least ${requiredDays} full days before requesting a withdrawal. Time remaining: ${remDays} days ${remHours} hours.`,
    };
  }

  // 2. Check active fund lock
  if (balance.isFundLocked) {
    return {
      success: false,
      error: `30-Day Fund Lock is active. Withdrawals unlock in ${balance.fundLockRemainingDays} days ${balance.fundLockRemainingHours} hours.`,
    };
  }

  // 3. Balance verification
  if (requestedAmount > balance.eligibleForWithdrawal) {
    return {
      success: false,
      error: `Insufficient eligible balance. Requested: ${requestedAmount} USDT, Eligible: ${balance.eligibleForWithdrawal} USDT.`,
    };
  }

  // 4. Dynamic fee calculation from database settings (default 4%)
  const feePct = (settings.withdrawalFeePercentage !== undefined && !isNaN(Number(settings.withdrawalFeePercentage)))
    ? Number(settings.withdrawalFeePercentage)
    : 4;
  const feeRate = feePct / 100;
  const feeAmount = Number((requestedAmount * feeRate).toFixed(4));
  const netAmount = Number((requestedAmount - feeAmount).toFixed(4));

  const withdrawalId = 'wd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const reference = 'WD-' + Date.now().toString(36).toUpperCase();

  const newWithdrawal = await createWithdrawal({
    id: withdrawalId,
    reference,
    userId: user.id,
    requestedAmount,
    feePercentage: feePct,
    feeAmount,
    netAmount,
    destinationAddress: input.destinationAddress.trim(),
    network: 'BEP-20',
    status: 'pending',
    createdAt: now.toISOString(),
    userNotes: input.userNotes,
    idempotencyKey: input.idempotencyKey,
  });

  if (!newWithdrawal || !newWithdrawal.id) {
    return {
      success: false,
      error: 'Failed to record withdrawal in database. Please try again.',
    };
  }

  // Calculate updated balance after holding withdrawal amount
  const updatedBalance = await calculateUserBalanceAsync(user.id);

  // Write immutable ledger entry
  await createLedgerEntry({
    userId: user.id,
    type: 'withdrawal_request',
    amount: -requestedAmount,
    balanceAfter: updatedBalance.availableBalance,
    referenceId: newWithdrawal.id,
    description: `Withdrawal request submitted for ${requestedAmount} USDT (${feePct}% Fee: ${feeAmount} USDT, Net: ${netAmount} USDT)`,
    createdAt: now.toISOString(),
    performedBy: user.id,
  });

  // Activate 30-Day Fund Lock for remaining funds
  const lockDays = Number(settings.depositLockPeriodDays) || 30;
  const fundLockEndDate = new Date(now.getTime() + lockDays * 24 * 60 * 60 * 1000).toISOString();
  await updateProfile(user.id, {
    fundLockUntil: fundLockEndDate,
    fundLockReason: `${lockDays}-Day Post-Withdrawal Fund Lock (${reference})`,
    lastWithdrawalAt: now.toISOString(),
  });

  await createAuditLog({
    action: 'WITHDRAWAL_REQUESTED',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: `User requested withdrawal of ${requestedAmount} USDT to ${input.destinationAddress}`,
    timestamp: now.toISOString(),
  });

  return { success: true, withdrawal: newWithdrawal };
}

export async function updateWithdrawalStatusAsync(
  adminId: string,
  withdrawalId: string,
  status: 'approved' | 'rejected' | 'paid' | 'processing',
  txHash?: string,
  adminNotes?: string
): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
  const withdrawal = await getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    return { success: false, error: 'Withdrawal not found.' };
  }

  const now = new Date();
  const updated = await updateWithdrawal(withdrawalId, {
    status,
    txHash: txHash || withdrawal.txHash,
    adminNotes,
    reviewedAt: now.toISOString(),
    reviewedBy: adminId,
    paidAt: status === 'paid' ? now.toISOString() : undefined,
  });

  if (status === 'rejected') {
    // If rejected, refund the held funds back to the user balance
    const currentBalance = await calculateUserBalanceAsync(withdrawal.userId);
    await createLedgerEntry({
      userId: withdrawal.userId,
      type: 'withdrawal_rejected',
      amount: withdrawal.requestedAmount,
      balanceAfter: currentBalance.availableBalance + withdrawal.requestedAmount,
      referenceId: withdrawal.id,
      description: `Withdrawal request rejected by admin. Refunded ${withdrawal.requestedAmount} USDT. Reason: ${adminNotes || 'Verification failed'}`,
      createdAt: now.toISOString(),
      performedBy: adminId,
    });
  } else if (status === 'paid') {
    await createLedgerEntry({
      userId: withdrawal.userId,
      type: 'withdrawal_paid',
      amount: 0,
      balanceAfter: (await calculateUserBalanceAsync(withdrawal.userId)).availableBalance,
      referenceId: withdrawal.id,
      description: `Withdrawal payout dispatched via BEP-20 (Tx: ${txHash || 'Processing'}). Net Paid: ${withdrawal.netAmount} USDT`,
      createdAt: now.toISOString(),
      performedBy: adminId,
    });
  }

  await createAuditLog({
    action: `WITHDRAWAL_${status.toUpperCase()}`,
    actorId: adminId,
    actorRole: 'admin',
    targetUserId: withdrawal.userId,
    reason: adminNotes || `Admin updated withdrawal status to ${status}`,
    timestamp: now.toISOString(),
  });

  return { success: true, withdrawal: updated };
}
