import { getProfileById } from '../repositories/profiles';
import {
  createDeposit,
  getDepositById,
  getDepositByTxHash,
  updateDeposit,
  confirmDepositAtomic,
} from '../repositories/deposits';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getSettings } from '../repositories/settings';
import { uploadDepositProof } from '../storage';
import { verifyBEP20Deposit, isValidTxHash } from '../blockchain';
import { calculateUserBalanceAsync } from './balanceService';
import { Deposit } from '../types';

export interface ProcessDepositInput {
  userId: string;
  txHash: string;
  amount?: number;
  proofPhotoUrl?: string;
  userNotes?: string;
  actorEmail?: string;
}

export async function processDepositAsync(input: ProcessDepositInput): Promise<{
  success: boolean;
  deposit?: Deposit;
  isPendingConfirmations?: boolean;
  message?: string;
  error?: string;
}> {
  const user = await getProfileById(input.userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: 'Account is not active.' };
  }

  const rawTxHash = input.txHash ? input.txHash.trim().toLowerCase() : '';
  if (!rawTxHash) {
    return { success: false, error: 'BNB Smart Chain Transaction Hash (TxID) is required.' };
  }

  if (!isValidTxHash(rawTxHash)) {
    return {
      success: false,
      error: 'Invalid transaction hash format. Must be a 66-character BEP-20 hex string starting with 0x.',
    };
  }

  // 1. Anti-Replay & Uniqueness Protection
  const existing = await getDepositByTxHash(rawTxHash);
  if (existing) {
    return {
      success: false,
      error: 'This blockchain transaction hash has already been submitted or processed in FINEXJ.',
    };
  }

  const settings = await getSettings();
  const minDeposit = Number(settings.minimumDepositAmount || 300);
  const claimedAmount = input.amount && !isNaN(Number(input.amount)) ? Number(input.amount) : undefined;

  // 2. Authoritative Blockchain Verification against Real BSC RPC
  const verification = await verifyBEP20Deposit(rawTxHash, claimedAmount);

  // If the transaction is definitively invalid on-chain (wrong token, wrong recipient, reverted)
  if (verification.status === 'failed') {
    return {
      success: false,
      error: verification.errorMessage || 'Transaction execution failed (reverted on BNB Smart Chain).',
    };
  }

  if (verification.status === 'invalid') {
    return {
      success: false,
      error: verification.errorMessage || 'Transaction does not meet BEP-20 USDT deposit rules.',
    };
  }

  // Authoritative amount: use verified blockchain transfer amount if available, otherwise claimed amount
  const authoritativeAmount = verification.amount && verification.amount > 0
    ? verification.amount
    : (claimedAmount || minDeposit);

  if (authoritativeAmount < minDeposit) {
    return {
      success: false,
      error: `Deposit amount ($${authoritativeAmount.toFixed(2)} USDT) is below the minimum deposit requirement of $${minDeposit.toFixed(2)} USDT.`,
    };
  }

  const isConfirmed = verification.isValid === true && !verification.isPendingConfirmations;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1000;
  const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();

  let storagePath: string | undefined = undefined;
  if (input.proofPhotoUrl) {
    try {
      storagePath = await uploadDepositProof(input.userId, rawTxHash.slice(0, 16), input.proofPhotoUrl, 'deposit_proof.jpg');
    } catch (err: any) {
      console.warn('[Deposit Proof Upload Warning]:', err?.message);
      storagePath = input.proofPhotoUrl;
    }
  }

  // 3. Persist Verified Deposit Record
  const newDeposit = await createDeposit({
    userId: user.id,
    amount: authoritativeAmount,
    actualAmount: authoritativeAmount,
    currency: 'USDT',
    network: 'BEP-20',
    txHash: rawTxHash,
    fromAddress: verification.fromAddress,
    toAddress: verification.toAddress || settings.bep20DepositAddress,
    tokenContract: verification.tokenContract || settings.usdtContractAddress,
    blockNumber: verification.blockNumber,
    status: isConfirmed ? 'confirmed' : 'pending',
    confirmations: verification.confirmations || 0,
    requiredConfirmations: verification.requiredConfirmations || settings.requiredConfirmations || 12,
    createdAt: now.toISOString(),
    confirmedAt: isConfirmed ? now.toISOString() : undefined,
    verifiedAt: verification.blockNumber ? now.toISOString() : undefined,
    eligibilityDate: tomorrow.toISOString(),
    depositLockEndDate: lockEndDate,
    proofPhotoUrl: storagePath,
    userNotes: input.userNotes,
  });

  if (!newDeposit || !newDeposit.id) {
    return {
      success: false,
      error: 'Failed to record deposit in Supabase database. Please try again.',
    };
  }

  // 4. Atomic Financial Credit (Only when verified with >= required confirmations)
  if (isConfirmed) {
    const balance = await calculateUserBalanceAsync(user.id);
    await createLedgerEntry({
      userId: user.id,
      type: 'deposit',
      amount: authoritativeAmount,
      balanceAfter: balance.availableBalance,
      referenceId: newDeposit.id,
      description: `Confirmed BEP-20 USDT deposit of ${authoritativeAmount} USDT (Tx: ${rawTxHash})`,
      createdAt: now.toISOString(),
      performedBy: 'blockchain_verifier',
    });

    await createAuditLog({
      action: 'DEPOSIT_CONFIRMED',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: user.id,
      reason: `Automated on-chain verification confirmed ${authoritativeAmount} USDT with ${verification.confirmations} confirmations.`,
      timestamp: now.toISOString(),
    });

    return {
      success: true,
      deposit: newDeposit,
      message: `Deposit of $${authoritativeAmount.toFixed(2)} USDT successfully verified on BNB Smart Chain and credited!`,
    };
  }

  // If pending confirmations
  await createAuditLog({
    action: 'DEPOSIT_SUBMITTED',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: `User submitted deposit of ${authoritativeAmount} USDT (${verification.confirmations || 0}/${verification.requiredConfirmations || 12} BSC confirmations)`,
    timestamp: now.toISOString(),
  });

  return {
    success: true,
    deposit: newDeposit,
    isPendingConfirmations: true,
    message: `Deposit submitted with ${verification.confirmations || 0} of ${verification.requiredConfirmations || 12} required BSC confirmations. It will confirm automatically once confirmed.`,
  };
}

/**
 * Re-verifies a pending deposit against real BNB Smart Chain state and credits atomically if confirmed.
 */
export async function verifyDepositOnChainAsync(
  depositId: string,
  actorId: string = 'system'
): Promise<{
  success: boolean;
  deposit?: Deposit;
  isPendingConfirmations?: boolean;
  confirmations?: number;
  requiredConfirmations?: number;
  message?: string;
  error?: string;
}> {
  const deposit = await getDepositById(depositId);
  if (!deposit) {
    return { success: false, error: 'Deposit record not found.' };
  }

  if (deposit.status === 'confirmed') {
    return {
      success: true,
      deposit,
      confirmations: deposit.confirmations,
      requiredConfirmations: deposit.requiredConfirmations,
      message: 'Deposit is already confirmed.',
    };
  }

  const verification = await verifyBEP20Deposit(deposit.txHash, deposit.amount);

  if (verification.status === 'failed' || verification.status === 'invalid') {
    await updateDeposit(deposit.id, {
      status: 'rejected',
      adminNotes: verification.errorMessage,
    });
    return {
      success: false,
      error: verification.errorMessage || 'Transaction verification failed on BNB Smart Chain.',
    };
  }

  const verifiedAmount = verification.amount && verification.amount > 0 ? verification.amount : deposit.amount;

  if (verification.isValid && !verification.isPendingConfirmations) {
    // Atomically confirm deposit
    const confirmResult = await confirmDepositAtomic({
      depositId: deposit.id,
      adminId: actorId,
      adminNotes: `Verified on BNB Smart Chain with ${verification.confirmations} confirmations`,
      txHash: deposit.txHash,
      fromAddress: verification.fromAddress,
      blockNumber: verification.blockNumber,
      tokenContract: verification.tokenContract,
      confirmations: verification.confirmations,
      actualAmount: verifiedAmount,
    });

    if (!confirmResult.success || !confirmResult.deposit) {
      return { success: false, error: confirmResult.error || 'Failed to confirm deposit atomically.' };
    }

    const balance = await calculateUserBalanceAsync(deposit.userId);
    await createLedgerEntry({
      userId: deposit.userId,
      type: 'deposit',
      amount: verifiedAmount,
      balanceAfter: balance.availableBalance,
      referenceId: deposit.id,
      description: `Confirmed BEP-20 USDT deposit of ${verifiedAmount} USDT (Tx: ${deposit.txHash})`,
      createdAt: new Date().toISOString(),
      performedBy: actorId,
    });

    await createAuditLog({
      action: 'DEPOSIT_CONFIRMED',
      actorId,
      actorRole: 'system',
      targetUserId: deposit.userId,
      reason: `Re-verification confirmed ${verifiedAmount} USDT on BSC with ${verification.confirmations} confirmations.`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      deposit: confirmResult.deposit,
      confirmations: verification.confirmations,
      requiredConfirmations: verification.requiredConfirmations,
      message: `Deposit successfully verified on BNB Smart Chain (${verification.confirmations} confirmations) and credited!`,
    };
  }

  // Update latest real confirmations count
  const updatedDeposit = await updateDeposit(deposit.id, {
    confirmations: verification.confirmations || 0,
    blockNumber: verification.blockNumber || deposit.blockNumber,
    fromAddress: verification.fromAddress || deposit.fromAddress,
    tokenContract: verification.tokenContract || deposit.tokenContract,
    actualAmount: verifiedAmount,
  });

  return {
    success: true,
    deposit: updatedDeposit,
    isPendingConfirmations: true,
    confirmations: verification.confirmations || 0,
    requiredConfirmations: verification.requiredConfirmations || 12,
    message: `Transaction has ${verification.confirmations || 0} of ${verification.requiredConfirmations || 12} required BSC confirmations.`,
  };
}

export async function updateDepositStatusAsync(
  adminId: string,
  depositId: string,
  status: 'confirmed' | 'rejected',
  adminNotes?: string,
  txHash?: string
): Promise<{ success: boolean; deposit?: Deposit; error?: string }> {
  const deposit = await getDepositById(depositId);
  if (!deposit) {
    return { success: false, error: 'Deposit not found.' };
  }

  if (deposit.status === 'confirmed') {
    return { success: false, error: 'This deposit has already been confirmed.' };
  }

  if (status === 'confirmed') {
    const confirmResult = await confirmDepositAtomic({
      depositId: deposit.id,
      adminId,
      adminNotes: adminNotes || 'Admin approved deposit',
      txHash: txHash || deposit.txHash,
      actualAmount: deposit.actualAmount || deposit.amount,
    });

    if (!confirmResult.success || !confirmResult.deposit) {
      return { success: false, error: confirmResult.error || 'Failed to confirm deposit.' };
    }

    const balance = await calculateUserBalanceAsync(deposit.userId);
    await createLedgerEntry({
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      balanceAfter: balance.availableBalance,
      referenceId: deposit.id,
      description: `Admin approved deposit of ${deposit.amount} USDT`,
      createdAt: new Date().toISOString(),
      performedBy: adminId,
    });

    await createAuditLog({
      action: 'DEPOSIT_APPROVED',
      actorId: adminId,
      actorRole: 'admin',
      targetUserId: deposit.userId,
      reason: adminNotes || `Admin approved deposit #${deposit.id} for ${deposit.amount} USDT`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, deposit: confirmResult.deposit };
  }

  // Reject deposit
  const updated = await updateDeposit(depositId, {
    status: 'rejected',
    adminNotes,
    txHash: txHash || deposit.txHash,
  });

  await createAuditLog({
    action: 'DEPOSIT_REJECTED',
    actorId: adminId,
    actorRole: 'admin',
    targetUserId: deposit.userId,
    reason: adminNotes || `Admin rejected deposit #${deposit.id}`,
    timestamp: new Date().toISOString(),
  });

  return { success: true, deposit: updated };
}
