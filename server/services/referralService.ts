import { getServerSupabase } from '../supabase';
import { User, Referral, ReferralReward } from '../types';
import { getProfileById, getProfileByReferralCode, updateProfile } from '../repositories/profiles';
import {
  getReferralByReferredId,
  createReferralRelationship,
  getReferralRewardByDepositId,
  createReferralReward,
  getReferralsByReferrerId,
  getReferralRewardsByReferrerId,
} from '../repositories/referrals';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getSettings } from '../repositories/settings';
import { recordFraudSignal } from './fraudService';
import { calculateUserBalanceAsync } from './balanceService';
import { logger } from '../logger';

/**
 * Validates and binds a referral relationship during registration or account setup.
 * Supports company referral codes (e.g. FINEXJ), strictly prevents self-referral,
 * and enforces maximum depth <= 2.
 */
export async function bindReferralAsync(
  referredUser: User,
  rawReferralCode?: string
): Promise<{ success: boolean; referral?: Referral; isCompanyReferral?: boolean; error?: string }> {
  if (!rawReferralCode || !rawReferralCode.trim()) {
    return { success: true }; // No referral code provided
  }

  const cleanCode = rawReferralCode.trim().toUpperCase();
  const settings = await getSettings();
  const companyCode = (settings.companyReferralCode || 'FINEXJ').toUpperCase();

  // 1. Strict Self-Referral Prevention (Immediate Match against user's own code)
  if (referredUser.referralCode && referredUser.referralCode.toUpperCase() === cleanCode) {
    await recordFraudSignal({
      signalType: 'self_referral_attempt',
      severity: 'medium',
      userId: referredUser.id,
      details: {
        attemptedCode: cleanCode,
      },
    }).catch(() => {});

    return {
      success: false,
      error: 'Self-referral is strictly prohibited.',
    };
  }

  // 2. Company Referral Code Handling
  if (cleanCode === companyCode) {
    logger.info('COMPANY_REFERRAL_USED', `User ${referredUser.email} registered using company code ${companyCode}`, {
      userId: referredUser.id,
    });
    return {
      success: true,
      isCompanyReferral: true,
    };
  }

  // 3. Resolve referrer by user's referral code
  const referrer = await getProfileByReferralCode(cleanCode);
  if (!referrer) {
    logger.warn('INVALID_REFERRAL_CODE_ATTEMPT', `Code ${cleanCode} not found`, {
      userId: referredUser.id,
    });
    return { success: false, error: 'Referral code not found or invalid.' };
  }

  // 4. Strict Self-Referral Prevention against resolved referrer
  if (
    String(referrer.id) === String(referredUser.id) ||
    referrer.email.toLowerCase() === referredUser.email.toLowerCase()
  ) {
    await recordFraudSignal({
      signalType: 'self_referral_attempt',
      severity: 'medium',
      userId: referredUser.id,
      details: {
        attemptedCode: cleanCode,
        referrerId: referrer.id,
      },
    }).catch(() => {});

    return {
      success: false,
      error: 'Self-referral is strictly prohibited.',
    };
  }

  // 4. Prevent duplicate or manipulated referral relationship
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
 * Idempotently evaluates and credits multi-tier referral rewards (Level 1: 5%, Level 2: 2%)
 * when a qualifying deposit is verified and confirmed on-chain.
 *
 * Rules:
 * 1. Deposit must be qualifying (>= minimumDepositAmount, default 300 USDT).
 * 2. Referral income is separate withdrawable cash and NEVER merged into compounding principal.
 * 3. NO referral rewards are ever generated on withdrawals or withdrawal fees.
 */
export async function processReferralRewardForDepositAsync(
  depositId: string | number,
  depositAmount: number,
  referredUserId: string
): Promise<{ rewarded: boolean; rewards?: ReferralReward[]; reason?: string }> {
  try {
    const settings = await getSettings();
    const minDeposit = Number(settings.minimumDepositAmount) || 300.0;
    const l1Percentage = Number(settings.referralRewardL1Percentage) || 5.0;
    const l2Percentage = Number(settings.referralRewardL2Percentage) || 2.0;

    // 1. Check qualification: Deposit must be >= minimumDepositAmount
    if (depositAmount < minDeposit) {
      return {
        rewarded: false,
        reason: `Deposit amount ($${depositAmount}) is below the qualifying referral threshold ($${minDeposit} USDT).`,
      };
    }

    // 2. Fetch referred user and resolve Level 1 referrer
    const user = await getProfileById(referredUserId);
    if (!user || !user.referrerId) {
      return { rewarded: false, reason: 'User has no registered referrer.' };
    }

    if (user.status !== 'active') {
      return { rewarded: false, reason: 'Referred user is not active.' };
    }

    const rewardsCreated: ReferralReward[] = [];

    // =========================================================================
    // LEVEL 1: Direct Referrer (5%)
    // =========================================================================
    const l1Referrer = await getProfileById(user.referrerId);
    if (l1Referrer && l1Referrer.status === 'active' && String(l1Referrer.id) !== String(user.id)) {
      const l1RewardAmount = Number(((depositAmount * l1Percentage) / 100.0).toFixed(4));

      if (l1RewardAmount > 0) {
        // Idempotency check: Ensure L1 reward not already generated for this deposit
        const existingL1 = await getReferralRewardByDepositId(depositId);
        if (!existingL1 || (existingL1 as any).rewardLevel !== 1) {
          const l1Reference = `REF-L1-DEP-${depositId}-${Date.now().toString(36).toUpperCase()}`;

          const l1Reward = await createReferralReward({
            referrerId: l1Referrer.id,
            referredId: user.id,
            depositId: String(depositId),
            amount: l1RewardAmount,
            percentage: l1Percentage,
            reference: l1Reference,
            status: 'credited',
            notes: `Level 1 (${l1Percentage}%) referral reward on qualifying deposit #${depositId} ($${depositAmount} USDT)`,
          });

          // Credit L1 Referrer's Ledger
          const l1Balance = await calculateUserBalanceAsync(l1Referrer.id);
          await createLedgerEntry({
            userId: l1Referrer.id,
            type: 'referral_reward_l1',
            amount: l1RewardAmount,
            balanceAfter: l1Balance.availableBalance + l1RewardAmount,
            referenceId: l1Reward.id,
            description: `Level 1 referral reward from investor ${user.email} (Deposit #${depositId} of $${depositAmount} USDT at ${l1Percentage}%)`,
            performedBy: 'referral_engine',
          });

          await createAuditLog({
            action: 'REFERRAL_REWARD_L1_CREDITED',
            actorId: 'system',
            actorRole: 'system',
            targetUserId: l1Referrer.id,
            reason: `Credited ${l1RewardAmount} USDT Level 1 referral reward from deposit #${depositId}`,
            beforeValue: { availableBalance: l1Balance.availableBalance },
            afterValue: { rewardAmount: l1RewardAmount, reference: l1Reference, newBalance: l1Balance.availableBalance + l1RewardAmount },
            referenceId: l1Reference,
          });

          rewardsCreated.push(l1Reward);
        }
      }

      // =========================================================================
      // LEVEL 2: Indirect Referrer (Parent of L1 Referrer, 2%)
      // =========================================================================
      if (l1Referrer.referrerId && String(l1Referrer.referrerId) !== String(user.id) && String(l1Referrer.referrerId) !== String(l1Referrer.id)) {
        const l2Referrer = await getProfileById(l1Referrer.referrerId);

        if (l2Referrer && l2Referrer.status === 'active') {
          const l2RewardAmount = Number(((depositAmount * l2Percentage) / 100.0).toFixed(4));

          if (l2RewardAmount > 0) {
            const l2Reference = `REF-L2-DEP-${depositId}-${Date.now().toString(36).toUpperCase()}`;

            const l2Reward = await createReferralReward({
              referrerId: l2Referrer.id,
              referredId: user.id,
              depositId: String(depositId),
              amount: l2RewardAmount,
              percentage: l2Percentage,
              reference: l2Reference,
              status: 'credited',
              notes: `Level 2 (${l2Percentage}%) referral reward on qualifying deposit #${depositId} ($${depositAmount} USDT)`,
            });

            // Credit L2 Referrer's Ledger
            const l2Balance = await calculateUserBalanceAsync(l2Referrer.id);
            await createLedgerEntry({
              userId: l2Referrer.id,
              type: 'referral_reward_l2',
              amount: l2RewardAmount,
              balanceAfter: l2Balance.availableBalance + l2RewardAmount,
              referenceId: l2Reward.id,
              description: `Level 2 referral reward from 2nd-tier investor ${user.email} (Deposit #${depositId} of $${depositAmount} USDT at ${l2Percentage}%)`,
              performedBy: 'referral_engine',
            });

            await createAuditLog({
              action: 'REFERRAL_REWARD_L2_CREDITED',
              actorId: 'system',
              actorRole: 'system',
              targetUserId: l2Referrer.id,
              reason: `Credited ${l2RewardAmount} USDT Level 2 referral reward from deposit #${depositId}`,
              beforeValue: { availableBalance: l2Balance.availableBalance },
              afterValue: { rewardAmount: l2RewardAmount, reference: l2Reference, newBalance: l2Balance.availableBalance + l2RewardAmount },
              referenceId: l2Reference,
            });

            rewardsCreated.push(l2Reward);
          }
        }
      }
    }

    return {
      rewarded: rewardsCreated.length > 0,
      rewards: rewardsCreated,
    };
  } catch (err: any) {
    logger.error('REFERRAL_REWARD_ERROR', `Failed processing referral reward: ${err?.message}`, {
      metadata: { depositId, depositAmount, referredUserId },
    });
    return { rewarded: false, reason: err?.message };
  }
}

/**
 * Returns structured referral summary and 2-level referral tree stats for a user.
 */
export async function getReferralSummaryAsync(userId: string): Promise<{
  referralCode: string;
  totalRewardsEarned: number;
  level1RewardsEarned: number;
  level2RewardsEarned: number;
  level1Count: number;
  level2Count: number;
  totalReferredCount: number;
  referrals: Array<{
    id: string;
    email: string;
    status: string;
    level: number;
    createdAt: string;
    isQualified: boolean;
  }>;
  recentRewards: ReferralReward[];
}> {
  const user = await getProfileById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const referralCode = user.referralCode || '';
  const settings = await getSettings();
  const minDeposit = Number(settings.minimumDepositAmount) || 300.0;

  // 1. Direct Referrals (Level 1)
  const l1Referrals = await getReferralsByReferrerId(userId);
  const l1UserIds = l1Referrals.map(r => r.referredId);

  // 2. Indirect Referrals (Level 2)
  let l2UserIds: string[] = [];
  for (const l1Id of l1UserIds) {
    try {
      const l2List = await getReferralsByReferrerId(l1Id);
      for (const l2 of l2List) {
        if (!l2UserIds.includes(l2.referredId) && l2.referredId !== userId) {
          l2UserIds.push(l2.referredId);
        }
      }
    } catch {
      // Continue
    }
  }

  // 3. User Referral Rewards
  const rewards = await getReferralRewardsByReferrerId(userId);
  let level1RewardsEarned = 0;
  let level2RewardsEarned = 0;

  for (const r of rewards) {
    if ((r as any).rewardLevel === 2 || r.reference?.includes('L2')) {
      level2RewardsEarned += r.amount;
    } else {
      level1RewardsEarned += r.amount;
    }
  }

  const totalRewardsEarned = Number((level1RewardsEarned + level2RewardsEarned).toFixed(4));

  // 4. Map user details with privacy masking
  const mappedReferrals: Array<{
    id: string;
    email: string;
    status: string;
    level: number;
    createdAt: string;
    isQualified: boolean;
  }> = [];

  for (const ref of l1Referrals) {
    try {
      const p = await getProfileById(ref.referredId);
      if (p) {
        const pBalance = await calculateUserBalanceAsync(p.id);
        mappedReferrals.push({
          id: p.id,
          email: maskEmail(p.email),
          status: p.status,
          level: 1,
          createdAt: ref.createdAt,
          isQualified: pBalance.totalDeposited >= minDeposit,
        });
      }
    } catch {
      // Continue
    }
  }

  for (const l2Id of l2UserIds) {
    try {
      const p = await getProfileById(l2Id);
      if (p) {
        const pBalance = await calculateUserBalanceAsync(p.id);
        mappedReferrals.push({
          id: p.id,
          email: maskEmail(p.email),
          status: p.status,
          level: 2,
          createdAt: p.createdAt,
          isQualified: pBalance.totalDeposited >= minDeposit,
        });
      }
    } catch {
      // Continue
    }
  }

  return {
    referralCode,
    totalRewardsEarned,
    level1RewardsEarned: Number(level1RewardsEarned.toFixed(4)),
    level2RewardsEarned: Number(level2RewardsEarned.toFixed(4)),
    level1Count: l1Referrals.length,
    level2Count: l2UserIds.length,
    totalReferredCount: l1Referrals.length + l2UserIds.length,
    referrals: mappedReferrals,
    recentRewards: rewards.slice(0, 20),
  };
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
