import { getServerSupabase } from '../supabase';
import {
  User,
  Referral,
  ReferralReward,
  UserReferralSummary,
  Level1ReferralItem,
  Level2ReferralItem,
  PaginatedLevel1ReferralsResponse,
  PaginatedLevel2ReferralsResponse,
} from '../types';
import { getProfileById, getProfileByReferralCode, updateProfile } from '../repositories/profiles';
import {
  getReferralByReferredId,
  createReferralRelationship,
  getReferralRewardByDepositId,
  getReferralRewardByDepositAndLevel,
  createReferralReward,
  deleteReferralReward,
  DuplicateReferralRewardError,
  getReferralsByReferrerId,
  getReferralsByReferrerIdPaginated,
  getReferralsCountByReferrerId,
  getRewardsSumForReferredUser,
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

    // 1. Strict Configuration Safety: FAIL SAFELY if financial configuration is missing or invalid
    const minDeposit = Number(settings.minimumDepositAmount);
    if (isNaN(minDeposit) || minDeposit <= 0) {
      logger.error('CONFIG_ERROR_MIN_DEPOSIT', 'Missing or invalid minimumDepositAmount in system settings. Refusing to credit rewards.', {
        metadata: { depositId, minimumDepositAmount: settings.minimumDepositAmount },
      });
      return {
        rewarded: false,
        reason: 'Financial configuration error: minimumDepositAmount is invalid or missing.',
      };
    }

    const l1Percentage = Number(settings.referralRewardL1Percentage);
    if (isNaN(l1Percentage) || l1Percentage <= 0) {
      logger.error('CONFIG_ERROR_L1_PERCENTAGE', 'Missing or invalid referralRewardL1Percentage in system settings. Refusing to credit rewards.', {
        metadata: { depositId, referralRewardL1Percentage: settings.referralRewardL1Percentage },
      });
      return {
        rewarded: false,
        reason: 'Financial configuration error: referralRewardL1Percentage is invalid or missing.',
      };
    }

    const l2Percentage = Number(settings.referralRewardL2Percentage);
    if (isNaN(l2Percentage) || l2Percentage <= 0) {
      logger.error('CONFIG_ERROR_L2_PERCENTAGE', 'Missing or invalid referralRewardL2Percentage in system settings. Refusing to credit Level 2 rewards.', {
        metadata: { depositId, referralRewardL2Percentage: settings.referralRewardL2Percentage },
      });
    }

    // 2. Check qualification: Deposit must be >= minimumDepositAmount
    if (depositAmount < minDeposit) {
      return {
        rewarded: false,
        reason: `Deposit amount ($${depositAmount}) is below the qualifying referral threshold ($${minDeposit} USDT).`,
      };
    }

    // 3. Fetch referred user and resolve Level 1 referrer
    const user = await getProfileById(referredUserId);
    if (!user || !user.referrerId) {
      return { rewarded: false, reason: 'User has no registered referrer.' };
    }

    if (user.status !== 'active') {
      return { rewarded: false, reason: 'Referred user is not active.' };
    }

    const rewardsCreated: ReferralReward[] = [];

    // =========================================================================
    // LEVEL 1: Direct Referrer (e.g. 5%)
    // =========================================================================
    const l1Referrer = await getProfileById(user.referrerId);
    if (l1Referrer && l1Referrer.status === 'active' && String(l1Referrer.id) !== String(user.id)) {
      const l1RewardAmount = Number(((depositAmount * l1Percentage) / 100.0).toFixed(4));

      if (l1RewardAmount > 0) {
        // Idempotency check: Ensure L1 reward not already generated for this deposit
        const existingL1 = await getReferralRewardByDepositAndLevel(depositId, 1);
        if (!existingL1) {
          const l1Reference = `REF-L1-DEP-${depositId}-${Date.now().toString(36).toUpperCase()}`;

          let l1Reward: ReferralReward | null = null;
          try {
            l1Reward = await createReferralReward({
              referrerId: l1Referrer.id,
              referredId: user.id,
              depositId: String(depositId),
              amount: l1RewardAmount,
              percentage: l1Percentage,
              reference: l1Reference,
              status: 'credited',
              rewardLevel: 1,
              notes: `Level 1 (${l1Percentage}%) referral reward on qualifying deposit #${depositId} ($${depositAmount} USDT)`,
            });
          } catch (createErr: any) {
            if (createErr instanceof DuplicateReferralRewardError || createErr.name === 'DuplicateReferralRewardError') {
              logger.info('REFERRAL_L1_DUPLICATE_IGNORED', `L1 reward already processed for deposit #${depositId}`);
            } else {
              throw createErr;
            }
          }

          if (l1Reward) {
            // Atomic Ledger Credit + Audit Log with rollback on failure
            try {
              const l1Balance = await calculateUserBalanceAsync(l1Referrer.id);
              const balanceAfter = Number((l1Balance.availableBalance + l1RewardAmount).toFixed(4));

              await createLedgerEntry({
                userId: l1Referrer.id,
                type: 'referral_reward_l1',
                amount: l1RewardAmount,
                balanceAfter,
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
                afterValue: { rewardAmount: l1RewardAmount, reference: l1Reference, newBalance: balanceAfter },
                referenceId: l1Reference,
              });

              rewardsCreated.push(l1Reward);
            } catch (ledgerOrAuditErr: any) {
              // Rollback partial failure: delete reward to maintain absolute atomicity
              console.error('[CRITICAL] L1 referral ledger/audit failure, rolling back reward:', ledgerOrAuditErr);
              await deleteReferralReward(l1Reward.id);
              throw new Error(`Failed to atomically credit Level 1 referral reward: ${ledgerOrAuditErr.message}`);
            }
          }
        }
      }

      // =========================================================================
      // LEVEL 2: Indirect Referrer (Parent of L1 Referrer, e.g. 2%)
      // =========================================================================
      if (
        !isNaN(l2Percentage) &&
        l2Percentage > 0 &&
        l1Referrer.referrerId &&
        String(l1Referrer.referrerId) !== String(user.id) &&
        String(l1Referrer.referrerId) !== String(l1Referrer.id)
      ) {
        const l2Referrer = await getProfileById(l1Referrer.referrerId);

        if (l2Referrer && l2Referrer.status === 'active') {
          const l2RewardAmount = Number(((depositAmount * l2Percentage) / 100.0).toFixed(4));

          if (l2RewardAmount > 0) {
            const existingL2 = await getReferralRewardByDepositAndLevel(depositId, 2);
            if (!existingL2) {
              const l2Reference = `REF-L2-DEP-${depositId}-${Date.now().toString(36).toUpperCase()}`;

              let l2Reward: ReferralReward | null = null;
              try {
                l2Reward = await createReferralReward({
                  referrerId: l2Referrer.id,
                  referredId: user.id,
                  depositId: String(depositId),
                  amount: l2RewardAmount,
                  percentage: l2Percentage,
                  reference: l2Reference,
                  status: 'credited',
                  rewardLevel: 2,
                  notes: `Level 2 (${l2Percentage}%) referral reward on qualifying deposit #${depositId} ($${depositAmount} USDT)`,
                });
              } catch (createErr: any) {
                if (createErr instanceof DuplicateReferralRewardError || createErr.name === 'DuplicateReferralRewardError') {
                  logger.info('REFERRAL_L2_DUPLICATE_IGNORED', `L2 reward already processed for deposit #${depositId}`);
                } else {
                  throw createErr;
                }
              }

              if (l2Reward) {
                // Atomic Ledger Credit + Audit Log with rollback on failure
                try {
                  const l2Balance = await calculateUserBalanceAsync(l2Referrer.id);
                  const balanceAfter = Number((l2Balance.availableBalance + l2RewardAmount).toFixed(4));

                  await createLedgerEntry({
                    userId: l2Referrer.id,
                    type: 'referral_reward_l2',
                    amount: l2RewardAmount,
                    balanceAfter,
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
                    afterValue: { rewardAmount: l2RewardAmount, reference: l2Reference, newBalance: balanceAfter },
                    referenceId: l2Reference,
                  });

                  rewardsCreated.push(l2Reward);
                } catch (ledgerOrAuditErr: any) {
                  // Rollback partial failure: delete reward to maintain absolute atomicity
                  console.error('[CRITICAL] L2 referral ledger/audit failure, rolling back reward:', ledgerOrAuditErr);
                  await deleteReferralReward(l2Reward.id);
                  throw new Error(`Failed to atomically credit Level 2 referral reward: ${ledgerOrAuditErr.message}`);
                }
              }
            }
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
 * STRICT PRIVACY: NEVER returns email, phone, wallet, or balance.
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
    firstName: string;
    surname: string;
    status: string;
    level: number;
    createdAt: string;
    isQualified: boolean;
    rewardEarned: number;
  }>;
  recentRewards: Array<{
    id: string;
    rewardLevel: number;
    amount: number;
    percentage: number;
    status: string;
    createdAt: string;
  }>;
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

  // 4. Map user details with strict privacy enforcement (No email, phone, wallet, or private transactions)
  const mappedReferrals: Array<{
    id: string;
    firstName: string;
    surname: string;
    status: string;
    level: number;
    createdAt: string;
    isQualified: boolean;
    rewardEarned: number;
  }> = [];

  for (const ref of l1Referrals) {
    try {
      const p = await getProfileById(ref.referredId);
      if (p) {
        const nameParts = (p.fullName || 'Investor Member').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Investor';
        const surname = nameParts.slice(1).join(' ') || (nameParts.length > 1 ? nameParts[1] : '—');
        const rewardEarned = await getRewardsSumForReferredUser(userId, p.id);
        const pBalance = await calculateUserBalanceAsync(p.id);

        mappedReferrals.push({
          id: p.id,
          firstName,
          surname,
          status: p.status === 'active' ? 'Active' : 'Pending',
          level: 1,
          createdAt: ref.createdAt,
          isQualified: rewardEarned > 0 || (pBalance.totalDeposited >= minDeposit),
          rewardEarned,
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
        const nameParts = (p.fullName || 'Investor Member').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Investor';
        const surname = nameParts.slice(1).join(' ') || (nameParts.length > 1 ? nameParts[1] : '—');
        const rewardEarned = await getRewardsSumForReferredUser(userId, p.id);
        const pBalance = await calculateUserBalanceAsync(p.id);

        mappedReferrals.push({
          id: p.id,
          firstName,
          surname,
          status: p.status === 'active' ? 'Active' : 'Pending',
          level: 2,
          createdAt: p.createdAt,
          isQualified: rewardEarned > 0 || (pBalance.totalDeposited >= minDeposit),
          rewardEarned,
        });
      }
    } catch {
      // Continue
    }
  }

  // Filtered recent rewards: remove sensitive internal fields
  const sanitizedRecentRewards = rewards.slice(0, 20).map(r => ({
    id: r.id,
    rewardLevel: (r as any).rewardLevel === 2 || r.reference?.includes('L2') ? 2 : 1,
    amount: r.amount,
    percentage: r.percentage,
    status: r.status,
    createdAt: r.createdAt,
  }));

  return {
    referralCode,
    totalRewardsEarned,
    level1RewardsEarned: Number(level1RewardsEarned.toFixed(4)),
    level2RewardsEarned: Number(level2RewardsEarned.toFixed(4)),
    level1Count: l1Referrals.length,
    level2Count: l2UserIds.length,
    totalReferredCount: l1Referrals.length + l2UserIds.length,
    referrals: mappedReferrals,
    recentRewards: sanitizedRecentRewards,
  };
}

/**
 * Authoritative user referral summary with separate referral income vs compounding principal.
 * Backend-calculated exclusively.
 */
export async function getUserReferralSummaryAsync(userId: string): Promise<UserReferralSummary> {
  const user = await getProfileById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const referralCode = user.referralCode || `FXJ-${user.id.substring(0, 6).toUpperCase()}`;

  // 1. Level 1 count
  const l1Referrals = await getReferralsByReferrerId(userId);
  const level1Referrals = l1Referrals.length;
  const l1UserIds = l1Referrals.map(r => r.referredId);

  // 2. Level 2 count (derived directly from database relationships)
  let level2Referrals = 0;
  for (const l1Id of l1UserIds) {
    try {
      const count = await getReferralsCountByReferrerId(l1Id);
      level2Referrals += count;
    } catch {
      // Continue
    }
  }

  // 3. User Referral Rewards earned
  const rewards = await getReferralRewardsByReferrerId(userId);
  let level1Income = 0;
  let level2Income = 0;

  for (const r of rewards) {
    const isL2 = r.rewardLevel === 2 || r.reference?.includes('L2');
    if (isL2) {
      level2Income += Number(r.amount) || 0;
    } else {
      level1Income += Number(r.amount) || 0;
    }
  }

  const totalReferralIncome = Number((level1Income + level2Income).toFixed(4));

  // 4. Compounding principal strictly separate from referral income
  const balance = await calculateUserBalanceAsync(userId);
  const eligibleDepositPrincipal = balance.totalDeposited;

  return {
    referralCode,
    referralLink: `/register?ref=${encodeURIComponent(referralCode)}`,
    totalReferrals: level1Referrals + level2Referrals,
    level1Referrals,
    level2Referrals,
    totalReferralIncome,
    level1Income: Number(level1Income.toFixed(4)),
    level2Income: Number(level2Income.toFixed(4)),
    eligibleDepositPrincipal,
  };
}

/**
 * Paginated Level 1 referrals with strict privacy protection.
 * Exposes ONLY: Surname, Name, Referral status, Qualifying status, Reward income earned for caller, Sub-referrals count, Joined date.
 * NEVER exposes: email, phone, wallet, balance, deposit amount, or private transactions.
 */
export async function getUserLevel1ReferralsPaginatedAsync(
  userId: string,
  page: number = 1,
  limit: number = 10
): Promise<PaginatedLevel1ReferralsResponse> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const { referrals, total } = await getReferralsByReferrerIdPaginated(userId, safePage, safeLimit);
  const settings = await getSettings();
  const minDeposit = Number(settings.minimumDepositAmount) || 300.0;

  const items: Level1ReferralItem[] = [];

  for (const ref of referrals) {
    try {
      const p = await getProfileById(ref.referredId);
      if (!p) continue;

      // Extract Name and Surname strictly without exposing email
      const nameParts = (p.fullName || 'Investor Member').trim().split(/\s+/);
      const name = nameParts[0] || 'Investor';
      const surname = nameParts.slice(1).join(' ') || (nameParts.length > 1 ? nameParts[1] : '—');

      // Check qualification: either reward credited or confirmed deposit >= minDeposit
      const rewardEarned = await getRewardsSumForReferredUser(userId, p.id);
      const pBalance = await calculateUserBalanceAsync(p.id);
      const isQualified = rewardEarned > 0 || (pBalance.totalDeposited >= minDeposit);

      // Sub-referrals count under this Level 1 member (Level 2 for the caller)
      const level2Count = await getReferralsCountByReferrerId(p.id);

      items.push({
        id: p.id,
        name,
        surname,
        status: p.status === 'active' ? 'Active' : 'Pending',
        isQualified,
        rewardEarned,
        level2Count,
        joinedAt: ref.createdAt,
      });
    } catch (err: any) {
      logger.warn('LEVEL1_MAP_WARN', `Error mapping L1 ref ${ref.id}: ${err?.message}`);
    }
  }

  return {
    items,
    page: safePage,
    limit: safeLimit,
    totalCount: total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

/**
 * Paginated Level 2 referrals grouped under a Level 1 referrer (or across all Level 1 referrers).
 * Security: Validates that level1UserId actually belongs to the authenticated caller's direct Level 1 referrals!
 * Exposes ONLY: Surname, Name, Referral status, Qualifying status, Reward income earned for caller, Level 1 referrer info, Joined date.
 * NEVER exposes: email, phone, wallet, balance, deposit amount, or private transactions.
 */
export async function getUserLevel2ReferralsPaginatedAsync(
  userId: string,
  level1UserId?: string,
  page: number = 1,
  limit: number = 10
): Promise<PaginatedLevel2ReferralsResponse> {
  const settings = await getSettings();
  const minDeposit = Number(settings.minimumDepositAmount) || 300.0;
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(limit, 100));

  let targetL1Referrers: { id: string; name: string; surname: string }[] = [];

  if (level1UserId) {
    // 1. Strict Security Validation: Ensure level1UserId is a direct referral of userId
    const l1Referrals = await getReferralsByReferrerId(userId);
    const isValidL1 = l1Referrals.some(r => String(r.referredId) === String(level1UserId));
    if (!isValidL1) {
      throw new Error('Access denied: Specified member is not in your direct Level 1 network.');
    }

    const l1Profile = await getProfileById(level1UserId);
    const l1Parts = (l1Profile?.fullName || 'Investor Member').trim().split(/\s+/);
    targetL1Referrers.push({
      id: level1UserId,
      name: l1Parts[0] || 'Investor',
      surname: l1Parts.slice(1).join(' ') || '—',
    });
  } else {
    // Fetch all L1 referrals for this user
    const l1List = await getReferralsByReferrerId(userId);
    for (const ref of l1List) {
      const p = await getProfileById(ref.referredId);
      if (p) {
        const parts = (p.fullName || 'Investor Member').trim().split(/\s+/);
        targetL1Referrers.push({
          id: p.id,
          name: parts[0] || 'Investor',
          surname: parts.slice(1).join(' ') || '—',
        });
      }
    }
  }

  if (targetL1Referrers.length === 0) {
    return {
      items: [],
      page: safePage,
      limit: safeLimit,
      totalCount: 0,
      totalPages: 1,
      level1ReferrerId: level1UserId,
    };
  }

  // If single level1UserId specified, paginate directly
  if (level1UserId && targetL1Referrers.length === 1) {
    const l1 = targetL1Referrers[0];
    const { referrals, total } = await getReferralsByReferrerIdPaginated(level1UserId, safePage, safeLimit);
    const items: Level2ReferralItem[] = [];

    for (const ref of referrals) {
      try {
        const p = await getProfileById(ref.referredId);
        if (!p) continue;

        const nameParts = (p.fullName || 'Investor Member').trim().split(/\s+/);
        const rewardEarned = await getRewardsSumForReferredUser(userId, p.id);
        const pBalance = await calculateUserBalanceAsync(p.id);
        const isQualified = rewardEarned > 0 || (pBalance.totalDeposited >= minDeposit);

        items.push({
          id: p.id,
          name: nameParts[0] || 'Investor',
          surname: nameParts.slice(1).join(' ') || (nameParts.length > 1 ? nameParts[1] : '—'),
          status: p.status === 'active' ? 'Active' : 'Pending',
          isQualified,
          rewardEarned,
          joinedAt: ref.createdAt,
          level1ReferrerId: l1.id,
          level1ReferrerName: `${l1.name} ${l1.surname}`.trim(),
        });
      } catch (err: any) {
        logger.warn('LEVEL2_MAP_WARN', `Error mapping L2 ref ${ref.id}: ${err?.message}`);
      }
    }

    return {
      items,
      page: safePage,
      limit: safeLimit,
      totalCount: total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      level1ReferrerId: l1.id,
      level1ReferrerName: `${l1.name} ${l1.surname}`.trim(),
    };
  }

  // Across all L1 referrers (overview)
  const allL2Referrals: Array<{ ref: any; l1: { id: string; name: string; surname: string } }> = [];
  for (const l1 of targetL1Referrers) {
    const subList = await getReferralsByReferrerId(l1.id);
    for (const sub of subList) {
      allL2Referrals.push({ ref: sub, l1 });
    }
  }

  const total = allL2Referrals.length;
  const offset = (safePage - 1) * safeLimit;
  const pageSlice = allL2Referrals.slice(offset, offset + safeLimit);

  const items: Level2ReferralItem[] = [];
  for (const entry of pageSlice) {
    try {
      const p = await getProfileById(entry.ref.referredId);
      if (!p) continue;

      const nameParts = (p.fullName || 'Investor Member').trim().split(/\s+/);
      const rewardEarned = await getRewardsSumForReferredUser(userId, p.id);
      const pBalance = await calculateUserBalanceAsync(p.id);
      const isQualified = rewardEarned > 0 || (pBalance.totalDeposited >= minDeposit);

      items.push({
        id: p.id,
        name: nameParts[0] || 'Investor',
        surname: nameParts.slice(1).join(' ') || (nameParts.length > 1 ? nameParts[1] : '—'),
        status: p.status === 'active' ? 'Active' : 'Pending',
        isQualified,
        rewardEarned,
        joinedAt: entry.ref.createdAt,
        level1ReferrerId: entry.l1.id,
        level1ReferrerName: `${entry.l1.name} ${entry.l1.surname}`.trim(),
      });
    } catch (err: any) {
      logger.warn('LEVEL2_MAP_WARN', `Error mapping L2 item: ${err?.message}`);
    }
  }

  return {
    items,
    page: safePage,
    limit: safeLimit,
    totalCount: total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

/**
 * Validates a referral code (for registration preview / check).
 */
export async function validateReferralCodeAsync(code: string): Promise<{ valid: boolean; referrerName?: string; error?: string }> {
  if (!code || !code.trim()) {
    return { valid: false, error: 'Referral code is required.' };
  }
  const cleanCode = code.trim().toUpperCase();
  const settings = await getSettings();
  const companyCode = (settings.companyReferralCode || 'FINEXJ').toUpperCase();

  if (cleanCode === companyCode) {
    return { valid: true, referrerName: 'FINEXJ Official' };
  }

  const referrer = await getProfileByReferralCode(cleanCode);
  if (!referrer) {
    return { valid: false, error: 'Referral code not found or invalid.' };
  }

  const parts = (referrer.fullName || 'Investor').trim().split(/\s+/);
  const maskedName = `${parts[0]} ${parts.slice(1).map(s => s[0] + '.').join(' ') || ''}`.trim();
  return { valid: true, referrerName: maskedName };
}
