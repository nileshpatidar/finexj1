import { getProfileById, updateProfile } from '../repositories/profiles';
import {
  createWithdrawal,
  getWithdrawalById,
  getWithdrawalsByUserId,
  updateWithdrawal,
  getAllWithdrawals,
} from '../repositories/withdrawals';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getSettings } from '../repositories/settings';
import { isValidBEP20Address, isValidTxHash } from '../blockchain';
import { calculateUserBalanceAsync } from './balanceService';
import { Withdrawal, WithdrawalStatus } from '../types';
import { getServerSupabase } from '../supabase';

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

  // 4. Dynamic fee calculation from database settings (canonical default 4%)
  const feePct = (settings.withdrawalFeePercentage !== undefined && !isNaN(Number(settings.withdrawalFeePercentage)))
    ? Number(settings.withdrawalFeePercentage)
    : 4;
  const feeRate = feePct / 100;
  const feeAmount = Number((requestedAmount * feeRate).toFixed(4));
  const netAmount = Number((requestedAmount - feeAmount).toFixed(4));

  const reference = 'WD-' + Date.now().toString(36).toUpperCase();
  const lockDays = Number(settings.depositLockPeriodDays) || 30;

  // Attempt atomic PostgreSQL RPC call
  try {
    const supabase = getServerSupabase();
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_withdrawal_atomic', {
      p_user_id: parseInt(user.id, 10) || 1,
      p_requested_amount: requestedAmount,
      p_destination_address: input.destinationAddress.trim(),
      p_reference: reference,
      p_idempotency_key: input.idempotencyKey || null,
      p_user_notes: input.userNotes || null,
      p_fee_percentage: feePct,
      p_fee_amount: feeAmount,
      p_net_amount: netAmount,
      p_fund_lock_days: lockDays,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success === false) {
        return { success: false, error: rpcData.error || 'Withdrawal rejected by database policy' };
      }
      const rawWd = rpcData.withdrawal;
      if (rawWd) {
        const createdWd: Withdrawal = {
          id: String(rawWd.id),
          reference: rawWd.reference || reference,
          userId: String(rawWd.user_id),
          requestedAmount: Number(rawWd.requested_amount || rawWd.amount || requestedAmount),
          feePercentage: Number(rawWd.fee_percentage || feePct),
          feeAmount: Number(rawWd.fee_amount || feeAmount),
          netAmount: Number(rawWd.net_amount || netAmount),
          destinationAddress: rawWd.destination_address || input.destinationAddress.trim(),
          network: 'BEP-20',
          status: 'pending',
          createdAt: rawWd.created_at || now.toISOString(),
          userNotes: rawWd.user_notes || input.userNotes,
          idempotencyKey: rawWd.idempotency_key || input.idempotencyKey,
        };

        await createAuditLog({
          action: 'WITHDRAWAL_REQUESTED',
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          targetUserId: user.id,
          reason: `User requested withdrawal of ${requestedAmount} USDT to ${input.destinationAddress}`,
          timestamp: now.toISOString(),
        });

        return { success: true, withdrawal: createdWd };
      }
    }
  } catch (rpcErr) {
    // If RPC is not supported on this schema instance, proceed with multi-step verified Supabase writes
  }

  // Fallback to verified direct Supabase writes
  const withdrawalId = 'wd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

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
  newStatus: WithdrawalStatus,
  txHash?: string,
  adminNotes?: string
): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
  try {
    const withdrawal = await getWithdrawalById(withdrawalId);
    if (!withdrawal) {
      return { success: false, error: `Withdrawal record (${withdrawalId}) not found.` };
    }

    const currentStatus = withdrawal.status;

    // Strict status transition validation
    if (currentStatus === 'paid' || (currentStatus as string) === 'completed') {
      return { success: false, error: 'Cannot modify a withdrawal that is already paid and completed.' };
    }

    if (currentStatus === 'rejected') {
      return { success: false, error: 'Cannot modify a withdrawal that has already been rejected.' };
    }

    if (currentStatus === 'cancelled') {
      return { success: false, error: 'Cannot modify a cancelled withdrawal.' };
    }

    const validNextStates: Record<string, string[]> = {
      pending: ['approved', 'processing', 'paid', 'rejected', 'under_review', 'cancelled'],
      under_review: ['approved', 'processing', 'paid', 'rejected'],
      approved: ['processing', 'paid', 'rejected'],
      processing: ['paid', 'rejected'],
    };

    const allowed = validNextStates[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid status transition from '${currentStatus}' to '${newStatus}'.`,
      };
    }

    // If new status is 'paid', validate txHash if provided and ensure uniqueness
    let normalizedTxHash = txHash?.trim();
    if (newStatus === 'paid' && normalizedTxHash) {
      if (!isValidTxHash(normalizedTxHash)) {
        return {
          success: false,
          error: 'Invalid BEP-20 payout transaction hash format. Must be a 64-hex char 0x-prefixed hash.',
        };
      }

      // Check if another withdrawal already used this payout txHash
      const { withdrawals: allWds } = await getAllWithdrawals({ limit: 1000 });
      const duplicate = allWds.find(w => w.id !== withdrawal.id && w.txHash?.toLowerCase() === normalizedTxHash?.toLowerCase());
      if (duplicate) {
        return {
          success: false,
          error: `Transaction hash ${normalizedTxHash} has already been assigned to withdrawal ${duplicate.reference || duplicate.id}.`,
        };
      }
    }

    const now = new Date();
    const updated = await updateWithdrawal(withdrawal.id, {
      status: newStatus,
      txHash: normalizedTxHash || withdrawal.txHash,
      adminNotes,
      reviewedAt: now.toISOString(),
      reviewedBy: adminId,
      paidAt: newStatus === 'paid' ? now.toISOString() : undefined,
    });

    if (newStatus === 'rejected') {
      // If rejected, refund the held funds back to the user balance in the ledger
      try {
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
      } catch (ledgerErr: any) {
        console.warn('[Ledger Notice] refund entry skipped:', ledgerErr?.message);
      }
    } else if (newStatus === 'paid') {
      try {
        const currentBalance = await calculateUserBalanceAsync(withdrawal.userId);
        await createLedgerEntry({
          userId: withdrawal.userId,
          type: 'withdrawal_paid',
          amount: 0,
          balanceAfter: currentBalance.availableBalance,
          referenceId: withdrawal.id,
          description: `Withdrawal payout dispatched via BEP-20 (Tx: ${normalizedTxHash || 'Confirmed'}). Net Paid: ${withdrawal.netAmount} USDT`,
          createdAt: now.toISOString(),
          performedBy: adminId,
        });
      } catch (ledgerErr: any) {
        console.warn('[Ledger Notice] paid entry skipped:', ledgerErr?.message);
      }
    }

    try {
      await createAuditLog({
        action: `WITHDRAWAL_${newStatus.toUpperCase()}`,
        actorId: adminId,
        actorRole: 'admin',
        targetUserId: withdrawal.userId,
        reason: adminNotes || `Admin updated withdrawal status to ${newStatus}`,
        timestamp: now.toISOString(),
      });
    } catch (auditErr: any) {
      console.warn('[Audit Notice] audit log skipped:', auditErr?.message);
    }

    return { success: true, withdrawal: updated };
  } catch (err: any) {
    console.error('[Withdrawal Action Error]', err);
    return { success: false, error: err?.message || 'Failed to update withdrawal' };
  }
}
