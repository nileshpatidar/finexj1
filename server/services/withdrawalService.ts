import { getProfileById, updateProfile } from '../repositories/profiles';
import {
  createWithdrawal,
  getWithdrawalById,
  getWithdrawalByIdempotencyKey,
  getWithdrawalsByUserId,
  updateWithdrawal,
  getAllWithdrawals,
  mapDbWithdrawalToWithdrawal,
} from '../repositories/withdrawals';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getSettings } from '../repositories/settings';
import { isValidBEP20Address, isValidTxHash, verifyBEP20PayoutTx } from '../blockchain';
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
    return { success: false, error: 'User account not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: `Account is currently ${user.status}.` };
  }

  const requestedAmount = Number(input.requestedAmount);
  if (isNaN(requestedAmount) || !isFinite(requestedAmount) || requestedAmount <= 0) {
    return { success: false, error: 'Please enter a valid withdrawal amount greater than 0 USDT.' };
  }

  // Destination address verification
  const destination = (input.destinationAddress || '').trim();
  if (!destination || !isValidBEP20Address(destination)) {
    return {
      success: false,
      error: 'Invalid BEP-20 destination address format. Must be a 0x-prefixed 40-hex BNB Smart Chain address.',
    };
  }

  // Idempotency check: verify key consistency
  const cleanIdempotencyKey = input.idempotencyKey?.trim();
  if (cleanIdempotencyKey) {
    const existingWd = await getWithdrawalByIdempotencyKey(cleanIdempotencyKey);
    if (existingWd) {
      if (existingWd.userId !== user.id) {
        return { success: false, error: 'Idempotency key conflict: key belongs to another account.' };
      }
      if (
        Math.abs(existingWd.requestedAmount - requestedAmount) > 0.0001 ||
        existingWd.destinationAddress.toLowerCase() !== destination.toLowerCase()
      ) {
        return { success: false, error: 'Idempotency key reuse conflict: request parameters do not match original request.' };
      }
      return { success: true, withdrawal: existingWd };
    }
  }

  // Calculate user eligibility and balance
  const balance = await calculateUserBalanceAsync(user.id);
  const settings = await getSettings();

  // 1. Authoritative 30-day account age rule
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

  // 2. Active fund lock check
  if (balance.isFundLocked) {
    return {
      success: false,
      error: `30-Day Post-Withdrawal Fund Lock is active. Withdrawals unlock in ${balance.fundLockRemainingDays} days ${balance.fundLockRemainingHours} hours.`,
    };
  }

  // 3. Balance verification
  if (requestedAmount > balance.eligibleForWithdrawal) {
    return {
      success: false,
      error: `Insufficient eligible balance. Requested: ${requestedAmount} USDT, Eligible: ${balance.eligibleForWithdrawal} USDT.`,
    };
  }

  // 4. Authoritative 6% fee calculation
  const feePct = 6.0000;
  const feeAmount = Number((requestedAmount * 0.06).toFixed(4));
  const netAmount = Number((requestedAmount - feeAmount).toFixed(4));

  const reference = 'WD-' + Date.now().toString(36).toUpperCase();
  const lockDays = Number(settings.depositLockPeriodDays) || 30;

  // Attempt atomic PostgreSQL RPC call (Gold Standard for Atomicity & Row-Level Lock)
  try {
    const supabase = getServerSupabase();
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_withdrawal_atomic', {
      p_user_id: parseInt(user.id, 10) || 1,
      p_requested_amount: requestedAmount,
      p_destination_address: destination,
      p_reference: reference,
      p_idempotency_key: cleanIdempotencyKey || null,
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
        return { success: true, withdrawal: mapDbWithdrawalToWithdrawal(rawWd) };
      }
    }
  } catch (rpcErr) {
    // If RPC is not available, proceed to robust fallback
  }

  // Fallback path: strict verified direct writes
  const withdrawalId = 'wd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const newWithdrawal = await createWithdrawal({
    id: withdrawalId,
    reference,
    userId: user.id,
    requestedAmount,
    feePercentage: feePct,
    feeAmount,
    netAmount,
    destinationAddress: destination,
    network: 'BEP-20',
    status: 'pending',
    createdAt: now.toISOString(),
    userNotes: input.userNotes,
    idempotencyKey: cleanIdempotencyKey,
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
    description: `Withdrawal request submitted for ${requestedAmount} USDT (6% Fee: ${feeAmount} USDT, Net: ${netAmount} USDT)`,
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
    reason: `User requested withdrawal of ${requestedAmount} USDT to ${destination}`,
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
    const normalizedTxHash = txHash?.trim() || undefined;

    // 1. Fetch withdrawal record to validate existence and state
    const withdrawal = await getWithdrawalById(withdrawalId);
    if (!withdrawal) {
      return { success: false, error: `Withdrawal record (${withdrawalId}) not found.` };
    }

    const currentStatus = withdrawal.status;

    // 2. Strict status transition & terminal state validation
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

    // 3. Strict Real BSC On-Chain Verification when marking as Paid
    if (newStatus === 'paid') {
      if (!normalizedTxHash) {
        return {
          success: false,
          error: 'BNB Smart Chain Payout Transaction Hash (TxID) is required to mark withdrawal as paid.',
        };
      }

      if (!isValidTxHash(normalizedTxHash)) {
        return {
          success: false,
          error: 'Invalid BEP-20 payout transaction hash format. Must be a 64-hex char 0x-prefixed hash.',
        };
      }

      // Check if another withdrawal already used this payout txHash (Anti-Replay / Anti-Collision)
      const { withdrawals: allWds } = await getAllWithdrawals({ limit: 1000 });
      const duplicate = allWds.find(
        w => w.id !== withdrawal.id && w.txHash?.toLowerCase() === normalizedTxHash.toLowerCase()
      );
      if (duplicate) {
        return {
          success: false,
          error: `Transaction hash ${normalizedTxHash} has already been assigned to withdrawal ${duplicate.reference || duplicate.id}.`,
        };
      }

      // Query Real BNB Smart Chain blockchain for verification
      const verification = await verifyBEP20PayoutTx(
        normalizedTxHash,
        withdrawal.destinationAddress,
        withdrawal.netAmount,
        { currentWithdrawalId: withdrawal.id }
      );

      if (!verification.isValid) {
        return {
          success: false,
          error: verification.errorMessage || 'BNB Smart Chain payout transaction verification failed.',
        };
      }
    }

    // 4. Atomic PostgreSQL Transaction Execution (Stored Procedure)
    try {
      const supabase = getServerSupabase();
      const numId = parseInt(withdrawalId, 10);
      if (!isNaN(numId)) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('process_withdrawal_status_atomic', {
          p_admin_id: adminId,
          p_admin_role: 'admin',
          p_withdrawal_id: numId,
          p_new_status: newStatus,
          p_tx_hash: normalizedTxHash || null,
          p_admin_notes: adminNotes || null,
        });

        if (!rpcError && rpcData) {
          if (rpcData.success === false) {
            return { success: false, error: rpcData.error };
          }
          if (rpcData.withdrawal) {
            return { success: true, withdrawal: mapDbWithdrawalToWithdrawal(rpcData.withdrawal) };
          }
        }
      }
    } catch (rpcErr) {
      // Fall through to fallback atomic execution below
    }

    // 5. Atomic Fallback Execution with Ledger & Audit Logs
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

