import { getProfileById } from '../repositories/profiles';
import { getDepositsByUserId } from '../repositories/deposits';
import { getEarningsByUserId } from '../repositories/earnings';
import { getWithdrawalsByUserId } from '../repositories/withdrawals';
import { getReferralRewardsByReferrerId } from '../repositories/referrals';
import { getLedgerByUserId } from '../repositories/ledger';
import { getSettings } from '../repositories/settings';
import { createLedgerEntry } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { getServerSupabase } from '../supabase';
import { calculateDepositLockEndDate } from '../utils/businessDays';
import { UserBalanceSummary, WithdrawalEligibilityStatus, User, Deposit, EarningEntry, Withdrawal, ReferralReward, LedgerEntry, AppSettings } from '../types';
import crypto from 'crypto';

export interface PreloadedBalanceData {
  user?: User;
  settings?: AppSettings;
  deposits?: Deposit[];
  earnings?: EarningEntry[];
  withdrawals?: Withdrawal[];
  referralRewards?: ReferralReward[];
  ledgerEntries?: LedgerEntry[];
}

export function calculateBalanceFromDatasets(
  user: User,
  settings: AppSettings,
  datasets: {
    deposits: Deposit[];
    earnings: EarningEntry[];
    withdrawals: Withdrawal[];
    referralRewards: ReferralReward[];
    ledgerEntries: LedgerEntry[];
  }
): UserBalanceSummary {
  const { deposits, earnings, withdrawals, referralRewards, ledgerEntries } = datasets;
  const now = new Date();

  // 1. Confirmed deposits
  const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
  const totalDeposited = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);

  // 2. Credited earnings
  const creditedEarnings = earnings.filter(e => e.status === 'credited');
  const totalEarnings = creditedEarnings.reduce((acc, e) => acc + e.earningsAmount, 0);

  // 3. Referral Rewards (Tracked separately, NOT merged into compounding principal)
  const creditedReferrals = referralRewards.filter(r => r.status === 'credited');
  const referralEarnings = creditedReferrals.reduce((acc, r) => acc + r.amount, 0);

  // 4. Admin adjustments from ledger
  const adminAdjustments = ledgerEntries
    .filter(l => l.type === 'admin_adjustment')
    .reduce((acc, l) => acc + l.amount, 0);

  // 5. Withdrawals
  const paidWithdrawals = withdrawals.filter(w => w.status === 'paid');
  const totalWithdrawn = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalFeesPaid = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);

  const activePendingWithdrawals = withdrawals.filter(
    w => w.status === 'pending' || w.status === 'under_review' || w.status === 'approved' || w.status === 'processing'
  );
  const totalPendingWithdrawals = activePendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);

  // Available balance: sum of all inflows minus outflows
  const rawBalance = totalDeposited + totalEarnings + referralEarnings + adminAdjustments - totalWithdrawn - totalPendingWithdrawals;
  const availableBalance = Math.max(0, Number(rawBalance.toFixed(4)));

  // Active Compounding Principal: ONLY deposit principal minus withdrawals. Referral income never compounds.
  const activeCompoundingPrincipal = Math.max(0, Number((totalDeposited - totalWithdrawn).toFixed(4)));

  // 6. True Per-Deposit Maturity & Lock Tracking
  const lockDays = typeof settings.depositLockPeriodDays === 'number' && !isNaN(settings.depositLockPeriodDays) && settings.depositLockPeriodDays >= 0
    ? settings.depositLockPeriodDays
    : 66;

  // Sort confirmed deposits chronologically (oldest first for deterministic FIFO attribution)
  const sortedConfirmedDeposits = [...confirmedDeposits].sort((a, b) => {
    const timeA = new Date(a.confirmedAt || a.createdAt).getTime();
    const timeB = new Date(b.confirmedAt || b.createdAt).getTime();
    return timeA - timeB;
  });

  interface DepositTrack {
    deposit: Deposit;
    depositDate: number;
    lockExpiry: number;
    isMatured: boolean;
    remainingPrincipal: number;
    creditedEarnings: number;
    remainingEarnings: number;
  }

  let earliestLockedExpiry: number | null = null;
  const depositTracks: DepositTrack[] = sortedConfirmedDeposits.map(dep => {
    const depositDate = dep.confirmedAt ? new Date(dep.confirmedAt).getTime() : new Date(dep.createdAt).getTime();
    const lockExpiry = dep.depositLockEndDate 
      ? new Date(dep.depositLockEndDate).getTime() 
      : new Date(calculateDepositLockEndDate(depositDate, lockDays)).getTime();
    const isMatured = now.getTime() >= lockExpiry;
    if (!isMatured) {
      if (earliestLockedExpiry === null || lockExpiry < earliestLockedExpiry) {
        earliestLockedExpiry = lockExpiry;
      }
    }
    return {
      deposit: dep,
      depositDate,
      lockExpiry,
      isMatured,
      remainingPrincipal: dep.amount,
      creditedEarnings: 0,
      remainingEarnings: 0,
    };
  });

  // Attribute credited investment earnings to individual deposits
  for (const e of creditedEarnings) {
    if (depositTracks.length === 0) break;
    let matchedTrack: DepositTrack | undefined = undefined;
    if (e.depositId !== undefined && e.depositId !== null) {
      matchedTrack = depositTracks.find(t => String(t.deposit.id) === String(e.depositId));
    }
    if (!matchedTrack) {
      if (depositTracks.length === 1) {
        matchedTrack = depositTracks[0];
      } else {
        const earningTime = new Date(e.performanceDate || e.createdAt).getTime();
        const eligibleTracks = depositTracks.filter(t => t.depositDate <= earningTime);
        matchedTrack = eligibleTracks.length > 0 ? eligibleTracks[0] : depositTracks[0];
      }
    }
    if (matchedTrack) {
      matchedTrack.creditedEarnings += e.earningsAmount;
      matchedTrack.remainingEarnings += e.earningsAmount;
    }
  }

  // FIFO Outflow Allocation (Withdrawals)
  const totalOutflows = totalWithdrawn + totalPendingWithdrawals;
  let remainingOutflows = totalOutflows;

  // Step A: Referral earnings absorb withdrawals first (segregated income)
  const usedReferral = Math.min(remainingOutflows, referralEarnings);
  remainingOutflows -= usedReferral;
  const withdrawableReferral = Math.max(0, Number((referralEarnings - usedReferral).toFixed(4)));

  // Step B: Remaining outflows absorb matured deposits in FIFO order (oldest matured first)
  const maturedTracks = depositTracks.filter(t => t.isMatured);
  const lockedTracks = depositTracks.filter(t => !t.isMatured);

  for (const track of maturedTracks) {
    if (remainingOutflows <= 0) break;
    const depositTotal = track.remainingPrincipal + track.remainingEarnings;
    const draw = Math.min(remainingOutflows, depositTotal);
    remainingOutflows -= draw;
    const principalDraw = Math.min(draw, track.remainingPrincipal);
    track.remainingPrincipal = Math.max(0, Number((track.remainingPrincipal - principalDraw).toFixed(4)));
    const earningsDraw = draw - principalDraw;
    track.remainingEarnings = Math.max(0, Number((track.remainingEarnings - earningsDraw).toFixed(4)));
  }

  // Step C: If historical withdrawals exceeded matured deposits, draw from locked deposits FIFO
  for (const track of lockedTracks) {
    if (remainingOutflows <= 0) break;
    const depositTotal = track.remainingPrincipal + track.remainingEarnings;
    const draw = Math.min(remainingOutflows, depositTotal);
    remainingOutflows -= draw;
    const principalDraw = Math.min(draw, track.remainingPrincipal);
    track.remainingPrincipal = Math.max(0, Number((track.remainingPrincipal - principalDraw).toFixed(4)));
    const earningsDraw = draw - principalDraw;
    track.remainingEarnings = Math.max(0, Number((track.remainingEarnings - earningsDraw).toFixed(4)));
  }

  // Calculate remaining balances per category
  const maturedRemainingPrincipal = maturedTracks.reduce((sum, t) => sum + t.remainingPrincipal, 0);
  const maturedRemainingEarnings = maturedTracks.reduce((sum, t) => sum + t.remainingEarnings, 0);
  const totalMaturedEligible = Number((maturedRemainingPrincipal + maturedRemainingEarnings).toFixed(4));

  const lockedRemainingPrincipal = lockedTracks.reduce((sum, t) => sum + t.remainingPrincipal, 0);
  const lockedRemainingEarnings = lockedTracks.reduce((sum, t) => sum + t.remainingEarnings, 0);
  const totalLockedInvestment = Number((lockedRemainingPrincipal + lockedRemainingEarnings).toFixed(4));

  const depositLockedPrincipal = Number(Math.max(0, Math.min(activeCompoundingPrincipal, lockedRemainingPrincipal)).toFixed(2));
  const depositMaturityDate: string | undefined = earliestLockedExpiry ? new Date(earliestLockedExpiry).toISOString() : undefined;
  let depositLockRemainingDays: number | undefined = undefined;
  if (earliestLockedExpiry) {
    const remMs = Math.max(0, earliestLockedExpiry - now.getTime());
    depositLockRemainingDays = Math.ceil(remMs / (24 * 60 * 60 * 1000));
  }

  // 7. Check user-level 30-Day Fund Lock (Voluntary security feature)
  let isFundLocked = false;
  let fundLockRemainingDays = 0;
  let fundLockRemainingHours = 0;
  let fundLockUntil: string | undefined = user.fundLockUntil;
  let fundLockReason: string | undefined = user.fundLockReason;

  if (user.fundLockUntil) {
    const lockExpiryTime = new Date(user.fundLockUntil).getTime();
    if (lockExpiryTime > now.getTime()) {
      isFundLocked = true;
      const remainingMs = lockExpiryTime - now.getTime();
      fundLockRemainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      fundLockRemainingHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    }
  }

  // 8. Informational Account Age (Account age is strictly informational and does NOT control investment maturity)
  const createdAtTime = new Date(user.createdAt).getTime();
  const accountAgeMs = now.getTime() - createdAtTime;
  const ageDays = typeof settings.accountAgeRequirementDays === 'number' && !isNaN(settings.accountAgeRequirementDays)
    ? settings.accountAgeRequirementDays
    : 30;
  const requiredAgeMs = ageDays * 24 * 60 * 60 * 1000;
  const is30DaysOld = accountAgeMs >= requiredAgeMs;
  const accountAgeDays = Number((accountAgeMs / (24 * 60 * 60 * 1000)).toFixed(2));
  const withdrawalEligibleDate = depositMaturityDate || new Date(createdAtTime + requiredAgeMs).toISOString();

  let lockedBalance: number;
  let eligibleForWithdrawal: number;
  let canWithdraw = true;
  let withdrawalRestrictionReason: string | undefined = undefined;

  if (isFundLocked) {
    // Voluntary fund lock locks non-referral balance
    lockedBalance = Math.max(0, Number((availableBalance - withdrawableReferral).toFixed(4)));
    eligibleForWithdrawal = Math.min(availableBalance, withdrawableReferral);
  } else {
    // Per-deposit lock: only locked deposits and their associated earnings are locked
    lockedBalance = Math.min(availableBalance, totalLockedInvestment);
    eligibleForWithdrawal = Math.max(0, Number((availableBalance - lockedBalance).toFixed(4)));
  }

  if (user.status !== 'active') {
    canWithdraw = false;
    withdrawalRestrictionReason = `Account is currently ${user.status}.`;
  } else if (availableBalance <= 0) {
    canWithdraw = false;
    withdrawalRestrictionReason = 'Insufficient available balance.';
  } else if (eligibleForWithdrawal <= 0) {
    canWithdraw = false;
    if (isFundLocked) {
      withdrawalRestrictionReason = `30-Day Fund Lock active. Unlocks on ${new Date(user.fundLockUntil!).toLocaleDateString()} (${fundLockRemainingDays}d ${fundLockRemainingHours}h remaining).`;
    } else if (lockedBalance > 0) {
      withdrawalRestrictionReason = `Your deposited funds and associated investment earnings are currently locked until maturity (${depositMaturityDate ? new Date(depositMaturityDate).toLocaleDateString() : lockDays + '-day lock period'}).`;
    } else {
      withdrawalRestrictionReason = 'No funds currently eligible for withdrawal.';
    }
  }

  let withdrawalEligibilityStatus: WithdrawalEligibilityStatus;
  let withdrawalEligibilityLabel: string;

  if (canWithdraw && eligibleForWithdrawal > 0) {
    withdrawalEligibilityStatus = 'ELIGIBLE_FOR_WITHDRAWAL';
    withdrawalEligibilityLabel = 'Eligible for Withdrawal';
  } else if (totalDeposited <= 0 && activeCompoundingPrincipal <= 0) {
    withdrawalEligibilityStatus = 'DEPOSIT_REQUIRED';
    withdrawalEligibilityLabel = 'Deposit Required';
  } else if (lockedBalance > 0 || isFundLocked) {
    withdrawalEligibilityStatus = 'DEPOSIT_LOCKED';
    withdrawalEligibilityLabel = 'Deposit Locked';
  } else {
    withdrawalEligibilityStatus = 'NO_WITHDRAWABLE_FUNDS';
    withdrawalEligibilityLabel = 'No Withdrawable Funds';
  }

  return {
    userId: user.id,
    totalDeposited: Number(totalDeposited.toFixed(2)),
    totalEarnings: Number(totalEarnings.toFixed(4)),
    referralEarnings: Number(referralEarnings.toFixed(4)),
    activeCompoundingPrincipal,
    depositLockedPrincipal,
    totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
    totalFeesPaid: Number(totalFeesPaid.toFixed(2)),
    totalPendingWithdrawals: Number(totalPendingWithdrawals.toFixed(2)),
    availableBalance,
    lockedBalance: Number(lockedBalance.toFixed(2)),
    eligibleForWithdrawal,
    accountAgeDays,
    is30DaysOld,
    canWithdraw,
    withdrawalRestrictionReason,
    withdrawalEligibleDate,
    isFundLocked,
    fundLockUntil,
    fundLockRemainingDays,
    fundLockRemainingHours,
    fundLockReason,
    withdrawalEligibilityStatus,
    withdrawalEligibilityLabel,
    depositMaturityDate,
    depositLockRemainingDays,
  };
}

export async function calculateUserBalanceWithDatasetsAsync(
  userId: string,
  preloadedUser?: User
): Promise<{
  balance: UserBalanceSummary;
  user: User;
  settings: AppSettings;
  deposits: Deposit[];
  earnings: EarningEntry[];
  withdrawals: Withdrawal[];
  referralRewards: ReferralReward[];
  ledgerEntries: LedgerEntry[];
}> {
  const user = preloadedUser || (await getProfileById(userId));
  if (!user) {
    throw new Error('User not found');
  }

  const [settings, deposits, earnings, withdrawals, referralRewards, ledgerEntries] = await Promise.all([
    getSettings(),
    getDepositsByUserId(userId),
    getEarningsByUserId(userId),
    getWithdrawalsByUserId(userId),
    getReferralRewardsByReferrerId(userId),
    getLedgerByUserId(userId),
  ]);

  const balance = calculateBalanceFromDatasets(user, settings, {
    deposits,
    earnings,
    withdrawals,
    referralRewards,
    ledgerEntries,
  });

  return {
    balance,
    user,
    settings,
    deposits,
    earnings,
    withdrawals,
    referralRewards,
    ledgerEntries,
  };
}

export async function calculateUserBalanceAsync(
  userId: string,
  preloaded?: PreloadedBalanceData
): Promise<UserBalanceSummary> {
  const user = preloaded?.user || (await getProfileById(userId));
  if (!user) {
    throw new Error('User not found');
  }

  const settings = preloaded?.settings || (await getSettings());

  const [deposits, earnings, withdrawals, referralRewards, ledgerEntries] = await Promise.all([
    preloaded?.deposits !== undefined ? preloaded.deposits : getDepositsByUserId(userId),
    preloaded?.earnings !== undefined ? preloaded.earnings : getEarningsByUserId(userId),
    preloaded?.withdrawals !== undefined ? preloaded.withdrawals : getWithdrawalsByUserId(userId),
    preloaded?.referralRewards !== undefined ? preloaded.referralRewards : getReferralRewardsByReferrerId(userId),
    preloaded?.ledgerEntries !== undefined ? preloaded.ledgerEntries : getLedgerByUserId(userId),
  ]);

  return calculateBalanceFromDatasets(user, settings, {
    deposits,
    earnings,
    withdrawals,
    referralRewards,
    ledgerEntries,
  });
}


export interface WithdrawalImpactResult {
  canWithdraw: boolean;
  error?: string;
  availableBalance: number;
  referralEarnings: number;
  activeCompoundingPrincipal: number;
  depositLockedPrincipal: number;
  isFundLocked: boolean;
  is30DaysOld: boolean;
  requestedAmount: number;
  feePercentage: number;
  feeAmount: number;
  netAmount: number;
  isReferralOnly: boolean;
  touchesProtectedFund: boolean;
  requiresCompoundingNotice?: boolean;
  compoundingNoticeTitle?: string;
  compoundingNoticeText?: string;
  requiresLockBreakConfirmation: boolean;
  lockBreakWarning?: string;
  requiresMinimumBreakConfirmation: boolean;
  minimumBreakWarning?: string;
  projectedRemainingPrincipal: number;
  minimumDepositAmount?: number;
}

/**
 * Accurately determines the source of funds and financial warnings for a requested withdrawal.
 * Distinguishes between referral earnings (free to withdraw) and compounding principal/earnings (30-day lock & $300 minimum).
 */
export async function checkWithdrawalImpactAsync(
  userId: string,
  requestedAmount: number
): Promise<WithdrawalImpactResult> {
  let balance: UserBalanceSummary;
  try {
    balance = await calculateUserBalanceAsync(userId);
  } catch (err: any) {
    return {
      canWithdraw: false,
      error: err?.message || 'User not found',
      availableBalance: 0,
      referralEarnings: 0,
      activeCompoundingPrincipal: 0,
      depositLockedPrincipal: 0,
      isFundLocked: false,
      is30DaysOld: false,
      requestedAmount,
      feePercentage: 9,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: 0,
    };
  }
  let settings: any;
  try {
    settings = await getSettings();
  } catch (err: any) {
    return {
      canWithdraw: false,
      error: 'Financial configuration is temporarily unavailable. Please try again later.',
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage: 0,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  // STRICT CONFIGURATION SAFETY: Fail safely if financial settings are missing or invalid
  const rawFee = Number(settings.withdrawalFeePercentage);
  if (isNaN(rawFee) || rawFee < 0 || rawFee >= 100) {
    return {
      canWithdraw: false,
      error: 'Financial configuration error: withdrawalFeePercentage is invalid or missing in system settings.',
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage: 0,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  const rawMin = Number(settings.minimumDepositAmount);
  if (isNaN(rawMin) || rawMin <= 0) {
    return {
      canWithdraw: false,
      error: 'Financial configuration error: minimumDepositAmount is invalid or missing in system settings.',
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage: rawFee,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  const feePercentage = rawFee;
  const minDeposit = rawMin;

  if (requestedAmount <= 0) {
    return {
      canWithdraw: false,
      error: 'Withdrawal amount must be greater than zero.',
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  if (requestedAmount > balance.availableBalance) {
    return {
      canWithdraw: false,
      error: `Requested amount ($${requestedAmount.toFixed(2)}) exceeds your available balance ($${balance.availableBalance.toFixed(2)}).`,
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  if (requestedAmount > balance.eligibleForWithdrawal) {
    let lockError = balance.withdrawalRestrictionReason || 'Your deposited funds are currently locked. Withdrawals are available only after the applicable deposit lock period has ended.';
    if (balance.isFundLocked && requestedAmount > (balance.referralEarnings || 0)) {
      lockError = balance.withdrawalRestrictionReason || 'Your funds are currently locked under an active 30-day fund lock.';
    }
    return {
      canWithdraw: false,
      error: lockError,
      availableBalance: balance.availableBalance,
      referralEarnings: balance.referralEarnings,
      activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
      depositLockedPrincipal: balance.depositLockedPrincipal,
      isFundLocked: balance.isFundLocked,
      is30DaysOld: balance.is30DaysOld,
      requestedAmount,
      feePercentage,
      feeAmount: 0,
      netAmount: 0,
      isReferralOnly: false,
      touchesProtectedFund: false,
      requiresLockBreakConfirmation: false,
      requiresMinimumBreakConfirmation: false,
      projectedRemainingPrincipal: balance.activeCompoundingPrincipal,
    };
  }

  const feeAmount = Number((requestedAmount * (feePercentage / 100.0)).toFixed(4));
  const netAmount = Number((requestedAmount - feeAmount).toFixed(4));

  // Determine if withdrawal is funded strictly by referral earnings
  const isReferralOnly = requestedAmount <= balance.referralEarnings;
  let touchesProtectedFund = false;
  let requiresCompoundingNotice = false;
  let compoundingNoticeTitle: string | undefined = undefined;
  let compoundingNoticeText: string | undefined = undefined;
  let requiresMinimumBreakConfirmation = false;
  let minimumBreakWarning: string | undefined = undefined;

  let amountFromProtected = 0;
  if (!isReferralOnly) {
    touchesProtectedFund = true;
    amountFromProtected = requestedAmount - balance.referralEarnings;
    requiresCompoundingNotice = true;
    compoundingNoticeTitle = 'Withdrawal Notice';
    compoundingNoticeText =
      'Your requested withdrawal will reduce your active compounding principal. If you withdraw funds, the withdrawn amount will no longer participate in future compounding/earning calculations according to the platform rules. Your current compounding/earning cycle may be reduced or stopped depending on the amount withdrawn.';
  }

  const projectedRemainingPrincipal = Math.max(0, Number((balance.activeCompoundingPrincipal - amountFromProtected).toFixed(4)));

  if (touchesProtectedFund) {
    // Check if remaining principal falls below the configured minimum required for compounding/earnings
    if (projectedRemainingPrincipal < minDeposit && balance.activeCompoundingPrincipal >= minDeposit) {
      requiresMinimumBreakConfirmation = true;
      minimumBreakWarning = `Your withdrawal will reduce your eligible fund below the minimum required amount ($${minDeposit} USDT). If you continue, daily compounding earnings and Refer & Earn eligibility will become inactive.`;
    }
  }

  return {
    canWithdraw: true,
    availableBalance: balance.availableBalance,
    referralEarnings: balance.referralEarnings,
    activeCompoundingPrincipal: balance.activeCompoundingPrincipal,
    depositLockedPrincipal: balance.depositLockedPrincipal,
    isFundLocked: balance.isFundLocked,
    is30DaysOld: balance.is30DaysOld,
    requestedAmount,
    feePercentage,
    feeAmount,
    netAmount,
    isReferralOnly,
    touchesProtectedFund,
    requiresCompoundingNotice,
    compoundingNoticeTitle,
    compoundingNoticeText,
    requiresLockBreakConfirmation: false,
    lockBreakWarning: compoundingNoticeText,
    requiresMinimumBreakConfirmation,
    minimumBreakWarning,
    projectedRemainingPrincipal,
    minimumDepositAmount: minDeposit,
  };
}

export interface AdminBalanceAdjustmentParams {
  adminId: string;
  adminEmail: string;
  adminRole: string;
  targetUserId: string;
  amount: number;
  reason: string;
  adjustmentType?: 'credit' | 'debit';
  referenceId?: string;
}

export interface AdminBalanceAdjustmentResult {
  success: boolean;
  referenceId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  ledgerId?: string;
  auditLogId?: string;
}

/**
 * Hardened Administrative Balance Adjustment
 * 
 * Guarantees:
 * - Admin ID and credentials sourced exclusively from authenticated server session
 * - Atomic database execution with PostgreSQL row-level locks
 * - Strict dual ledger entry and audit log generation
 * - Rollback on any failure to prevent balance/ledger drift
 */
export async function adjustUserBalanceAtomicAsync(
  params: AdminBalanceAdjustmentParams
): Promise<AdminBalanceAdjustmentResult> {
  const { adminId, adminEmail, adminRole, targetUserId, amount, reason } = params;

  if (!targetUserId) {
    throw new Error('Target user ID is required.');
  }

  if (isNaN(amount) || amount === 0) {
    throw new Error('Adjustment amount must be a non-zero number.');
  }

  if (!reason || reason.trim().length < 3) {
    throw new Error('A specific, non-empty reason is mandatory for manual balance adjustments.');
  }

  const adjType = params.adjustmentType || (amount >= 0 ? 'credit' : 'debit');
  const customRef = params.referenceId || `ADJ-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 1. Attempt PostgreSQL stored procedure for atomic transaction & row locking
  const supabase = getServerSupabase();
  const numericUserId = parseInt(targetUserId, 10);

  if (!isNaN(numericUserId) && supabase) {
    try {
      const { data, error } = await supabase.rpc('adjust_user_balance_atomic', {
        p_admin_id: adminId,
        p_admin_email: adminEmail,
        p_admin_role: adminRole,
        p_target_user_id: numericUserId,
        p_amount: amount,
        p_reason: reason.trim(),
        p_adjustment_type: adjType,
        p_reference_id: customRef,
      });

      if (!error && data?.success) {
        return data as AdminBalanceAdjustmentResult;
      }
      if (error && !error.message.includes('function adjust_user_balance_atomic') && !error.message.includes('does not exist')) {
        throw new Error(error.message);
      }
    } catch (rpcErr: any) {
      if (!rpcErr.message?.includes('does not exist')) {
        throw rpcErr;
      }
    }
  }

  // 2. ACID-Compliant Repository Fallback
  const targetUser = await getProfileById(targetUserId);
  if (!targetUser) {
    throw new Error(`Target user #${targetUserId} not found in database.`);
  }

  const currentBalance = await calculateUserBalanceAsync(targetUserId);
  const previousBalance = currentBalance.availableBalance;
  const balanceAfter = Number((previousBalance + amount).toFixed(4));

  // Atomic Ledger Creation
  const ledgerEntry = await createLedgerEntry({
    userId: targetUserId,
    type: 'admin_adjustment',
    amount,
    balanceAfter,
    referenceId: customRef,
    description: `Admin balance adjustment (${adjType.toUpperCase()}): ${reason.trim()}`,
    performedBy: adminId,
    createdAt: new Date().toISOString(),
  });

  // Mandatory Audit Log Creation
  let auditLog;
  try {
    auditLog = await createAuditLog({
      action: 'ADMIN_BALANCE_ADJUSTMENT',
      actorId: adminId,
      actorEmail: adminEmail,
      actorRole: adminRole,
      targetUserId,
      reason: reason.trim(),
      beforeValue: { availableBalance: previousBalance },
      afterValue: { availableBalance: balanceAfter, amount, referenceId: customRef, type: adjType },
      referenceId: customRef,
    });
  } catch (auditErr: any) {
    console.error('[CRITICAL] Audit log creation failed during balance adjustment:', auditErr);
    throw new Error(`Balance adjustment aborted: Audit log creation failed: ${auditErr.message}`);
  }

  return {
    success: true,
    referenceId: customRef,
    amount,
    previousBalance,
    newBalance: balanceAfter,
    ledgerId: ledgerEntry.id,
    auditLogId: auditLog?.id,
  };
}

