import { getServerSupabase } from '../supabase';
import { User, Referral, ReferralReward } from '../types';
import { getProfileById, getProfileByReferralCode, updateProfile } from '../repositories/profiles';
import {
  getReferralByReferredId,
  createReferralRelationship,
  getReferralRewardByDepositId,
  createReferralReward,
  getReferralsByReferrerId,
} from '../repositories/referrals';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { recordFraudSignal } from './fraudService';
import { calculateUserBalanceAsync } from './balanceService';
import { logger } from '../logger';

/**
 * Validates and binds a referral relationship during registration or initial account setup.
 * Strictly prevents self-referral and establishes an immutable one-to-one relationship.
 */
export async function bindReferralAsync(
  referredUser: User,
  rawReferralCode?: string
): Promise<{ success: boolean; referral?: Referral; error?: string }> {
  if (!rawReferralCode || !rawReferralCode.trim()) {
    return { success: true }; // No referral code provided
  }

  const cleanCode = rawReferralCode.trim().toUpperCase();

  // 1. Resolve referrer by referral code
  const referrer = await getProfileByReferralCode(cleanCode);
  if (!referrer) {
    logger.warn('INVALID_REFERRAL_CODE_ATTEMPT', `Code ${cleanCode} not found`, {
      userId: referredUser.id,
    });
    return { success: false, error: 'Referral code not found or invalid.' };
  }

  // 2. Strict Self-Referral Prevention
  if (
    String(referrer.id) === String(referredUser.id) ||
    referrer.email.toLowerCase() === referredUser.email.toLowerCase() ||
    (referredUser.referralCode && referredUser.referralCode.toUpperCase() === cleanCode)
  ) {
    await recordFraudSignal({
      signalType: 'self_referral_attempt',
      severity: 'medium',
      userId: referredUser.id,
      details: {
        attemptedCode: cleanCode,
        referrerId: referrer.id,
      },
    });

    return {
      success: false,
      error: 'Self-referral is strictly prohibited.',
    };
  }

  // 3. Prevent duplicate or manipulated referral relationship
  const existing = await getReferralByReferredId(referredUser.id);
  if (existing) {
    // Immutable once established
    return {
      success: true,
      referral: existing,
    };
  }

  try {
    const referral = await createReferralRelationship(referrer.id, referredUser.id, cleanCode);
    await updateProfile(referredUser.id, {
      referrerId: referrer.id,
    });

    await createAuditLog({
      action: 'REFERRAL_BOUND',
      actorId: referredUser.id,
      actorEmail: referredUser.email,
      actorRole: referredUser.role,
      targetUserId: referrer.id,
      reason: `User registered using referral code ${cleanCode} belonging to referrer ${referrer.email}`,
      beforeValue: null,
      afterValue: { referrerId: referrer.id, referralCode: cleanCode },
    });

    return { success: true, referral };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to bind referral relationship.' };
  }
}

/**
 * Idempotently evaluates and credits a referral reward when a qualifying deposit is verified and confirmed on-chain.
 * Rule: Triggered at most ONCE per confirmed deposit. Never on pending, unconfirmed, or fake deposits.
 */
export async function processReferralRewardForDepositAsync(
  depositId: string,
  depositAmount: number,
  referredUserId: string
): Promise<{ rewarded: boolean; reward?: ReferralReward; reason?: string }> {
  try {
    // 1. Verify deposit has not already triggered a referral reward
    const existingReward = await getReferralRewardByDepositId(depositId);
    if (existingReward) {
      return {
        rewarded: false,
        reward: existingReward,
        reason: 'Referral reward already processed for this deposit (idempotent).',
      };
    }

    // 2. Fetch referred user and check referrer binding
    const user = await getProfileById(referredUserId);
    if (!user || !user.referrerId) {
      return { rewarded: false, reason: 'User has no registered referrer.' };
    }

    const referrer = await getProfileById(user.referrerId);
    if (!referrer || referrer.status !== 'active') {
      return { rewarded: false, reason: 'Referrer not eligible or not active.' };
    }

    // Double check self-referral
    if (String(referrer.id) === String(user.id)) {
      return { rewarded: false, reason: 'Self-referral rejected.' };
    }

    // 3. Calculate referral reward according to canonical policy (e.g. 5% commission on qualifying deposit)
    const rewardPercentage = 5.0000;
    const rewardAmount = Number(((depositAmount * rewardPercentage) / 100).toFixed(4));

    if (rewardAmount <= 0) {
      return { rewarded: false, reason: 'Reward amount is zero.' };
    }

    const reference = `REF-REW-DEP-${depositId}-${Date.now().toString(36).toUpperCase()}`;

    // 4. Create idempotent referral reward record in database
    const reward = await createReferralReward({
      referrerId: referrer.id,
      referredId: user.id,
      depositId,
      amount: rewardAmount,
      percentage: rewardPercentage,
      reference,
      status: 'credited',
      notes: `5% referral commission on confirmed deposit #${depositId} ($${depositAmount} USDT)`,
    });

    // 5. Credit Referrer's Ledger & Balance
    const referrerBalance = await calculateUserBalanceAsync(referrer.id);
    await createLedgerEntry({
      userId: referrer.id,
      type: 'admin_adjustment',
      amount: rewardAmount,
      balanceAfter: referrerBalance.availableBalance + rewardAmount,
      referenceId: reward.id,
      description: `Referral commission from investor ${user.email} (Deposit #${depositId})`,
      performedBy: 'referral_system',
    });

    await createAuditLog({
      action: 'REFERRAL_REWARD_CREDITED',
      actorId: 'system',
      actorRole: 'system',
      targetUserId: referrer.id,
      reason: `Credited ${rewardAmount} USDT referral bonus from deposit #${depositId}`,
      beforeValue: { availableBalance: referrerBalance.availableBalance },
      afterValue: { rewardAmount, reference, newBalance: referrerBalance.availableBalance + rewardAmount },
      referenceId: reference,
    });

    logger.info('REFERRAL_REWARD_CREDITED', `Credited ${rewardAmount} USDT to referrer ${referrer.email}`, {
      userId: referrer.id,
      metadata: {
        depositId,
        depositAmount,
        rewardAmount,
        referredUserId: user.id,
      },
    });

    return { rewarded: true, reward };
  } catch (err: any) {
    logger.error('REFERRAL_REWARD_ERROR', `Failed processing referral reward: ${err?.message}`, {
      metadata: { depositId, depositAmount, referredUserId },
    });
    return { rewarded: false, reason: err?.message };
  }
}
