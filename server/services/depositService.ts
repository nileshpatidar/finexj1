import crypto from 'crypto';
import { getProfileById } from '../repositories/profiles';
import {
  createDeposit,
  getDepositById,
  getDepositByTxHash,
  updateDeposit,
} from '../repositories/deposits';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getSettings } from '../repositories/settings';
import { uploadDepositProof } from '../storage';
import { verifyBEP20Deposit } from '../blockchain';
import { calculateUserBalanceAsync } from './balanceService';
import { Deposit } from '../types';

export interface ProcessDepositInput {
  userId: string;
  txHash?: string;
  amount?: number;
  proofPhotoUrl?: string;
  userNotes?: string;
  actorEmail?: string;
  autoApprove?: boolean;
}

export async function processDepositAsync(input: ProcessDepositInput): Promise<{
  success: boolean;
  deposit?: Deposit;
  error?: string;
}> {
  const user = await getProfileById(input.userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.status !== 'active') {
    return { success: false, error: 'Account is not active.' };
  }

  const settings = await getSettings();
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

  // Duplicate txHash verification (case-insensitive)
  if (input.txHash && input.txHash.trim()) {
    const trimmedTx = input.txHash.trim();
    const existing = await getDepositByTxHash(trimmedTx);
    if (existing) {
      return {
        success: false,
        error: 'This blockchain transaction hash has already been submitted or processed in the system.',
      };
    }
  }

  const depositId = 'dep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const fallbackTxHash = '0x' + crypto.randomBytes(32).toString('hex');
  const userTxHash = input.txHash && input.txHash.trim() ? input.txHash.trim() : fallbackTxHash;

  let storagePath: string | undefined = undefined;
  if (input.proofPhotoUrl) {
    try {
      storagePath = await uploadDepositProof(input.userId, depositId, input.proofPhotoUrl, 'deposit_proof.jpg');
    } catch (err: any) {
      console.warn('[Deposit Proof Upload Warning]:', err?.message);
      storagePath = input.proofPhotoUrl;
    }
  }

  // Blockchain verification check if provided and no proof screenshot
  let isConfirmed = false;
  if (input.txHash && !input.proofPhotoUrl && input.autoApprove) {
    const verification = await verifyBEP20Deposit(input.txHash, depositAmount);
    if (!verification.isValid) {
      return {
        success: false,
        error: verification.errorMessage || 'Invalid blockchain transaction.',
      };
    }
    isConfirmed = true;
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const lockPeriodMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1000;
  const lockEndDate = new Date(now.getTime() + lockPeriodMs).toISOString();

  const newDeposit = await createDeposit({
    id: depositId,
    userId: user.id,
    amount: depositAmount,
    currency: 'USDT',
    network: 'BEP-20',
    txHash: userTxHash,
    toAddress: settings.bep20DepositAddress,
    status: isConfirmed ? 'confirmed' : 'pending',
    confirmations: isConfirmed ? 15 : 1,
    requiredConfirmations: settings.requiredConfirmations || 12,
    createdAt: now.toISOString(),
    confirmedAt: isConfirmed ? now.toISOString() : undefined,
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

  if (isConfirmed) {
    const balance = await calculateUserBalanceAsync(user.id);
    await createLedgerEntry({
      userId: user.id,
      type: 'deposit',
      amount: depositAmount,
      balanceAfter: balance.availableBalance,
      referenceId: newDeposit.id,
      description: `Confirmed BEP-20 USDT deposit of ${depositAmount} USDT`,
      createdAt: now.toISOString(),
      performedBy: 'system',
    });
  }

  await createAuditLog({
    action: isConfirmed ? 'DEPOSIT_CONFIRMED' : 'DEPOSIT_SUBMITTED',
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    targetUserId: user.id,
    reason: `User submitted deposit of ${depositAmount} USDT`,
    timestamp: now.toISOString(),
  });

  return { success: true, deposit: newDeposit };
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

  const now = new Date();
  const updated = await updateDeposit(depositId, {
    status,
    confirmedAt: status === 'confirmed' ? now.toISOString() : undefined,
    adminNotes,
    txHash: txHash || deposit.txHash,
  });

  if (status === 'confirmed') {
    const balance = await calculateUserBalanceAsync(deposit.userId);
    await createLedgerEntry({
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      balanceAfter: balance.availableBalance,
      referenceId: deposit.id,
      description: `Admin approved deposit of ${deposit.amount} USDT`,
      createdAt: now.toISOString(),
      performedBy: adminId,
    });
  }

  await createAuditLog({
    action: status === 'confirmed' ? 'DEPOSIT_APPROVED' : 'DEPOSIT_REJECTED',
    actorId: adminId,
    actorRole: 'admin',
    targetUserId: deposit.userId,
    reason: adminNotes || `Admin updated deposit status to ${status}`,
    timestamp: now.toISOString(),
  });

  return { success: true, deposit: updated };
}
