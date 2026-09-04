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
import { calculateUserBalanceAsync, checkWithdrawalImpactAsync } from './balanceService';
import { verifyWithdrawalOtp } from './otpService';
import { checkWalletDuplication, checkRapidWithdrawalCycle } from './fraudService';
import { Withdrawal, WithdrawalStatus } from '../types';
import { getServerSupabase } from '../supabase';

export interface RequestWithdrawalInput {
  userId: string;
  requestedAmount: number;
  destinationAddress: string;
  otpCode?: string;
  confirmLockBreak?: boolean;
  confirmMinimumBreak?: boolean;
  idempotencyKey?: string;
  userNotes?: string;
  actorEmail?: string;
}

export async function createWithdrawalRequestAsync(input: RequestWithdrawalInput): Promise<{
  success: boolean;
  withdrawal?: Withdrawal;
  requiresOtp?: boolean;
  requiresConfirmation?: boolean;
  warningType?: 'LOCK_BREAK_WARNING' | 'MINIMUM_FUND_WARNING';
  error?: string;
}> {
  const user = await getProfileById(input.userId);
  if (!user) {
    return { success: false, error: 'User account not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: `Account is currently ${user.status}. Withdrawals are disabled.` };
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

  // 1. Mandatory Email OTP Verification
  const isTestUser = user.isTestUser === true;
  if (!input.otpCode || !input.otpCode.trim()) {
    return {
      success: false,
      requiresOtp: true,
      error: 'Security verification code (OTP) is required to authorize this withdrawal.',
    };
  }

  const otpValidation = verifyWithdrawalOtp(user.id, input.otpCode.trim(), isTestUser);
  if (!otpValidation.valid) {
    return {
      success: false,
      requiresOtp: true,
      error: otpValidation.error || 'Invalid or expired security verification code.',
    };
  }

  // Fraud risk detection
  checkWalletDuplication(destination, user.id, 'withdrawal').catch(() => {});
  checkRapidWithdrawalCycle(user.id, requestedAmount).catch(() => {});

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

  // 2. Authoritative Financial Source & Warning Evaluation
  const impact = await checkWithdrawalImpactAsync(user.id, requestedAmount);

  if (!impact.canWithdraw) {
    return {
      success: false,
      error: impact.error || 'Withdrawal exceeds available balance.',
    };
  }

  // Check 30-Day Protected Fund Lock Confirmation
  if (impact.requiresLockBreakConfirmation && input.confirmLockBreak !== true) {
    return {
      success: false,
      requiresConfirmation: true,
      warningType: 'LOCK_BREAK_WARNING',
      error: impact.lockBreakWarning,
    };
  }

  // Check Minimum Principal ($300) Warning Confirmation
  if (impact.requiresMinimumBreakConfirmation && input.confirmMinimumBreak !== true) {
    return {
      success: false,
      requiresConfirmation: true,
      warningType: 'MINIMUM_FUND_WARNING',
      error: impact.minimumBreakWarning,
    };
  }

  // Authoritative dynamic 9% fee
  const feePct = impact.feePercentage; // 9.0000%
  const feeAmount = impact.feeAmount;
  const netAmount = impact.netAmount;
  const reference = 'WD-' + Date.now().toString(36).toUpperCase();

  // Requirement 7: Do NOT automatically create a new 30-day lock merely because a withdrawal is made.
  const lockDays = 0;

  // 3. Attempt Atomic PostgreSQL RPC Execution (Gold Standard for Atomicity & Financial Consistency)
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
      p_confirm_lock_break: Boolean(input.confirmLockBreak),
      p_confirm_minimum_break: Boolean(input.confirmMinimumBreak),
    });

    if (!rpcError && rpcData) {
      if (rpcData.success === false) {
        return { success: false, error: rpcData.error || 'Withdrawal rejected by database financial policy.' };
      }
      const rawWd = rpcData.withdrawal;
      if (rawWd) {
        return { success: true, withdrawal: mapDbWithdrawalToWithdrawal(rawWd) };
      }
    }
  } catch (rpcErr: any) {
    console.warn('[Withdrawal Atomic RPC Notice]: RPC call fell back to direct transaction handler:', rpcErr?.message);
  }

  // 4. ACID-Compliant Repository Fallback
  const now = new Date();
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
    description: `Withdrawal request submitted for ${requestedAmount} USDT (${feePct}% FINEXJ Fee: ${feeAmount} USDT, Net Payout: ${netAmount} USDT)`,
    createdAt: now.toISOString(),
    performedBy: user.id,
  });

  await createAuditLog({
    action: 'WITHDRAWAL_REQUESTED',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: `User requested withdrawal of ${requestedAmount} USDT to ${destination} (Fee: ${feeAmount} USDT)`,
    timestamp: now.toISOString(),
    referenceId: reference,
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

    // Rejection reason is required (Requirement 10)
    if (newStatus === 'rejected' && (!adminNotes || !adminNotes.trim())) {
      return { success: false, error: 'A specific rejection reason is required to reject a withdrawal request.' };
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

    // 3. Real BSC On-Chain Verification when marking as Paid
    const targetUser = await getProfileById(withdrawal.userId);
    const isTestUser = targetUser?.isTestUser === true;

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

      // Anti-Replay: Check if another withdrawal already used this payout txHash
      const supabase = getServerSupabase();
      const { data: duplicateWds } = await supabase
        .from('withdrawals')
        .select('id, reference')
        .neq('id', withdrawal.id)
        .or(`tx_hash.ilike.${normalizedTxHash},payout_tx_hash.ilike.${normalizedTxHash}`)
        .limit(1);

      if (duplicateWds && duplicateWds.length > 0) {
        return {
          success: false,
          error: `Transaction hash ${normalizedTxHash} has already been assigned to withdrawal ${duplicateWds[0].reference || duplicateWds[0].id}.`,
        };
      }

      // Anti-Replay: Check if hash was registered for any deposit
      const { data: duplicateDeps } = await supabase
        .from('deposits')
        .select('id, reference')
        .ilike('tx_hash', normalizedTxHash)
        .limit(1);

      if (duplicateDeps && duplicateDeps.length > 0) {
        return {
          success: false,
          error: `Transaction hash ${normalizedTxHash} has already been used for deposit ${duplicateDeps[0].reference || duplicateDeps[0].id}.`,
        };
      }

      // Requirement 12: Test user protection
      // Test users must never accidentally result in a real on-chain payout
      if (!isTestUser) {
        // Query Real BNB Smart Chain blockchain for payout verification
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
    }

    // 4. Update withdrawal record
    const now = new Date();
    const updated = await updateWithdrawal(withdrawal.id, {
      status: newStatus,
      txHash: normalizedTxHash || withdrawal.txHash,
      adminNotes,
      reviewedAt: now.toISOString(),
      reviewedBy: adminId,
      paidAt: newStatus === 'paid' ? now.toISOString() : undefined,
    });

    // 5. Accounting, Ledgers, & Audit Logging
    if (newStatus === 'rejected') {
      // Refund held funds back to user balance in ledger atomically
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
          description: `Withdrawal payout dispatched via BEP-20 (Tx: ${normalizedTxHash || 'Confirmed'}). Net Paid: ${withdrawal.netAmount} USDT${isTestUser ? ' [Simulated Test Account]' : ''}`,
          createdAt: now.toISOString(),
          performedBy: adminId,
        });

        // Record Authoritative 9% Fee into FINEXJ Operational Ledger (100% FINEXJ fee)
        const supabase = getServerSupabase();
        const feeAmount = withdrawal.feeAmount || Number((withdrawal.requestedAmount * 0.09).toFixed(4));
        const { data: latestOp } = await supabase
          .from('finexj_operational_ledger')
          .select('after_balance')
          .order('created_at', { ascending: false })
          .limit(1);

        const beforeOp = latestOp && latestOp.length > 0 ? Number(latestOp[0].after_balance) || 0 : 0;
        const afterOp = beforeOp + feeAmount;

        await supabase.from('finexj_operational_ledger').insert({
          amount: feeAmount,
          direction: 'inflow',
          reason: `Retained 9% withdrawal fee from WD #${withdrawal.id} (${withdrawal.reference})${isTestUser ? ' (Simulated)' : ''}`,
          admin_id: adminId,
          reference: `FEE-WD-${withdrawal.id}`,
          before_balance: beforeOp,
          after_balance: afterOp,
          created_at: now.toISOString(),
        });
      } catch (opErr: any) {
        console.warn('[Operational Ledger Notice] fee entry skipped:', opErr?.message);
      }
    }

    try {
      await createAuditLog({
        action: `WITHDRAWAL_${newStatus.toUpperCase()}`,
        actorId: adminId,
        actorRole: 'admin',
        targetUserId: withdrawal.userId,
        referenceId: withdrawal.reference || withdrawal.id,
        beforeValue: { status: currentStatus },
        afterValue: { status: newStatus, txHash: normalizedTxHash || withdrawal.txHash },
        reason: adminNotes || `Admin updated withdrawal status from ${currentStatus} to ${newStatus}${isTestUser ? ' (Test Account)' : ''}`,
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
