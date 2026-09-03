import { getDepositsByUserId } from '../repositories/deposits';
import { getWithdrawalsByUserId } from '../repositories/withdrawals';
import { getEarningsByUserId } from '../repositories/earnings';
import { getReferralRewardsByReferrerId } from '../repositories/referrals';
import { getLedgerByUserId } from '../repositories/ledger';
import { calculateUserBalanceAsync } from './balanceService';
import { UserBalanceSummary } from '../types';

export type UserTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'daily_earnings'
  | 'daily_loss'
  | 'referral_reward_l1'
  | 'referral_reward_l2'
  | 'admin_adjustment'
  | 'reversal';

export interface UserTransactionItem {
  id: string;
  userId: string;
  type: UserTransactionType;
  amount: number;
  grossAmount?: number;
  feePercentage?: number;
  feeAmount?: number;
  netAmount?: number;
  currency: 'USDT';
  network?: 'BEP-20';
  status:
    | 'confirmed'
    | 'pending'
    | 'confirming'
    | 'paid'
    | 'under_review'
    | 'approved'
    | 'processing'
    | 'rejected'
    | 'failed'
    | 'cancelled'
    | 'credited'
    | 'completed';
  createdAt: string;
  confirmedAt?: string;
  paidAt?: string;
  referenceId?: string;
  reference?: string;
  description: string;
  txHash?: string;
  destinationAddress?: string;
  fromAddress?: string;
  toAddress?: string;
  rewardLevel?: 1 | 2;
  percentage?: number;
  ratePercentage?: number;
  baseEligibleAmount?: number;
  performanceDate?: string;
  eligibilityDate?: string;
  depositLockEndDate?: string;
  balanceAfter?: number;
  confirmations?: number;
  requiredConfirmations?: number;
}

export interface UserTransactionQueryOptions {
  page?: number;
  limit?: number;
  type?: 'all' | 'deposits' | 'withdrawals' | 'earnings' | 'referrals' | string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface UserTransactionsResult {
  transactions: UserTransactionItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
  balance: UserBalanceSummary;
  summary: {
    totalCount: number;
    totalDeposited: number;
    totalWithdrawn: number;
    totalEarnings: number;
    totalReferrals: number;
    totalPendingWithdrawals: number;
  };
}

/**
 * Authoritative user transactions fetcher.
 * Merges deposits, withdrawals, daily earnings, and referral rewards strictly for the authenticated user.
 * Strictly sanitizes sensitive internal fields (admin notes, fraud flags, internal accounting).
 */
export async function getUserTransactionsAsync(
  userId: string,
  options?: UserTransactionQueryOptions
): Promise<UserTransactionsResult> {
  const [deposits, withdrawals, earnings, referralRewards, ledger, balance] = await Promise.all([
    getDepositsByUserId(userId),
    getWithdrawalsByUserId(userId),
    getEarningsByUserId(userId),
    getReferralRewardsByReferrerId(userId),
    getLedgerByUserId(userId),
    calculateUserBalanceAsync(userId).catch((): UserBalanceSummary => ({
      userId,
      totalDeposited: 0,
      totalEarnings: 0,
      referralEarnings: 0,
      activeCompoundingPrincipal: 0,
      depositLockedPrincipal: 0,
      totalWithdrawn: 0,
      totalFeesPaid: 0,
      totalPendingWithdrawals: 0,
      availableBalance: 0,
      lockedBalance: 0,
      eligibleForWithdrawal: 0,
      accountAgeDays: 0,
      is30DaysOld: false,
      canWithdraw: false,
      withdrawalEligibleDate: new Date().toISOString(),
      isFundLocked: false,
      fundLockRemainingDays: 0,
      fundLockRemainingHours: 0,
    })),
  ]);

  const allItems: UserTransactionItem[] = [];
  const seenIds = new Set<string>();

  // 1. Process Deposits
  for (const d of deposits) {
    const rawId = `dep-${d.id}`;
    if (seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    const isConfirmed = d.status === 'confirmed';
    const desc = isConfirmed
      ? `Confirmed BEP-20 USDT deposit of ${d.amount} USDT${d.txHash ? ` (Tx: ${d.txHash.slice(0, 10)}...)` : ''}`
      : `BEP-20 USDT deposit submission (${d.confirmations || 0}/${d.requiredConfirmations || 12} confirmations)`;

    allItems.push({
      id: rawId,
      userId,
      type: 'deposit',
      amount: Number(d.amount),
      grossAmount: Number(d.amount),
      currency: 'USDT',
      network: 'BEP-20',
      status: d.status,
      createdAt: d.createdAt,
      confirmedAt: d.confirmedAt,
      referenceId: String(d.id),
      reference: `DEP-${d.id}`,
      description: desc,
      txHash: d.txHash,
      fromAddress: d.fromAddress,
      toAddress: d.toAddress,
      eligibilityDate: d.eligibilityDate,
      depositLockEndDate: d.depositLockEndDate,
      confirmations: d.confirmations,
      requiredConfirmations: d.requiredConfirmations,
    });
  }

  // 2. Process Withdrawals (authoritative backend fee & net)
  for (const w of withdrawals) {
    const rawId = `wd-${w.id}`;
    if (seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    const feePct = w.feePercentage || 9;
    const feeAmt = w.feeAmount || Number((w.requestedAmount * (feePct / 100)).toFixed(4));
    const netAmt = w.netAmount || Math.max(0, Number((w.requestedAmount - feeAmt).toFixed(4)));

    const shortDest = w.destinationAddress
      ? `${w.destinationAddress.slice(0, 6)}...${w.destinationAddress.slice(-4)}`
      : 'BEP-20 Wallet';

    let desc = `Withdrawal request of ${w.requestedAmount} USDT to ${shortDest}`;
    if (w.status === 'paid') {
      desc = `Withdrawal payout dispatched via BEP-20 to ${shortDest} (Net: ${netAmt} USDT)`;
    } else if (w.status === 'rejected') {
      desc = `Withdrawal request of ${w.requestedAmount} USDT was rejected (Funds refunded)`;
    }

    allItems.push({
      id: rawId,
      userId,
      type: 'withdrawal',
      amount: -w.requestedAmount,
      grossAmount: w.requestedAmount,
      feePercentage: feePct,
      feeAmount: feeAmt,
      netAmount: netAmt,
      currency: 'USDT',
      network: 'BEP-20',
      status: w.status,
      createdAt: w.createdAt,
      paidAt: w.paidAt,
      referenceId: String(w.id),
      reference: w.reference || `WD-${w.id}`,
      description: desc,
      txHash: w.txHash,
      destinationAddress: w.destinationAddress,
    });
  }

  // 3. Process Daily Earnings (Strictly separated from principal & referral income)
  for (const e of earnings) {
    const rawId = `earn-${e.id}`;
    if (seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    const isYieldPositive = e.earningsAmount >= 0;
    const ratePct = Number((e.applicableRate * 100).toFixed(4));
    const desc = `Daily trading yield for ${e.performanceDate} @ ${ratePct >= 0 ? '+' : ''}${ratePct.toFixed(2)}% on ${e.baseEligibleAmount} USDT compounding principal`;

    allItems.push({
      id: rawId,
      userId,
      type: isYieldPositive ? 'daily_earnings' : 'daily_loss',
      amount: e.earningsAmount,
      currency: 'USDT',
      status: e.status === 'credited' ? 'credited' : 'rejected',
      createdAt: e.createdAt,
      referenceId: String(e.calculationId || e.id),
      reference: `YIELD-${e.performanceDate}`,
      description: desc,
      ratePercentage: ratePct,
      baseEligibleAmount: e.baseEligibleAmount,
      performanceDate: e.performanceDate,
    });
  }

  // 4. Process Referral Rewards (Strictly separated into Level 1 & Level 2)
  for (const r of referralRewards) {
    const rawId = `ref-${r.id}`;
    if (seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    const isL2 = r.rewardLevel === 2 || r.reference?.includes('L2') || r.percentage === 2;
    const level: 1 | 2 = isL2 ? 2 : 1;
    const pct = r.percentage || (level === 2 ? 2 : 5);
    const desc = `Level ${level} (${pct}%) referral reward on partner qualifying deposit #${r.depositId}`;

    allItems.push({
      id: rawId,
      userId,
      type: level === 2 ? 'referral_reward_l2' : 'referral_reward_l1',
      amount: r.amount,
      currency: 'USDT',
      status: r.status === 'credited' ? 'credited' : 'rejected',
      createdAt: r.createdAt,
      referenceId: String(r.id),
      reference: r.reference || `REF-L${level}-${r.id}`,
      description: desc,
      rewardLevel: level,
      percentage: pct,
    });
  }

  // 5. Check Ledger for any admin adjustments or reversals not covered above
  for (const l of ledger) {
    if (l.type === 'admin_adjustment' || l.type === 'reversal') {
      const rawId = `adj-${l.id}`;
      if (seenIds.has(rawId)) continue;
      seenIds.add(rawId);

      allItems.push({
        id: rawId,
        userId,
        type: l.type,
        amount: l.amount,
        currency: 'USDT',
        status: 'completed',
        createdAt: l.createdAt,
        referenceId: l.referenceId,
        reference: l.referenceId || `ADJ-${l.id}`,
        description: l.description || 'Administrative balance adjustment',
        balanceAfter: l.balanceAfter,
      });
    }
  }

  // 6. Chronological Sorting (Newest first)
  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 7. Calculate Aggregated Summary
  const summary = {
    totalCount: allItems.length,
    totalDeposited: deposits.filter(d => d.status === 'confirmed').reduce((acc, d) => acc + d.amount, 0),
    totalWithdrawn: withdrawals.filter(w => w.status === 'paid').reduce((acc, w) => acc + w.requestedAmount, 0),
    totalEarnings: earnings.filter(e => e.status === 'credited').reduce((acc, e) => acc + e.earningsAmount, 0),
    totalReferrals: referralRewards.filter(r => r.status === 'credited').reduce((acc, r) => acc + r.amount, 0),
    totalPendingWithdrawals: withdrawals
      .filter(w => ['pending', 'under_review', 'approved', 'processing'].includes(w.status))
      .reduce((acc, w) => acc + w.requestedAmount, 0),
  };

  // 8. Apply Filtering
  let filtered = allItems;

  const filterType = options?.type?.toLowerCase();
  if (filterType && filterType !== 'all') {
    if (filterType === 'deposits' || filterType === 'deposit') {
      filtered = filtered.filter(t => t.type === 'deposit');
    } else if (filterType === 'withdrawals' || filterType === 'withdrawal') {
      filtered = filtered.filter(t => t.type === 'withdrawal');
    } else if (filterType === 'earnings' || filterType === 'daily_earnings') {
      filtered = filtered.filter(t => t.type === 'daily_earnings' || t.type === 'daily_loss');
    } else if (filterType === 'referrals' || filterType === 'referral_rewards') {
      filtered = filtered.filter(t => t.type === 'referral_reward_l1' || t.type === 'referral_reward_l2');
    } else if (filterType === 'referral_l1') {
      filtered = filtered.filter(t => t.type === 'referral_reward_l1');
    } else if (filterType === 'referral_l2') {
      filtered = filtered.filter(t => t.type === 'referral_reward_l2');
    } else if (filterType === 'adjustments') {
      filtered = filtered.filter(t => t.type === 'admin_adjustment' || t.type === 'reversal');
    }
  }

  if (options?.status && options.status !== 'all') {
    const st = options.status.toLowerCase();
    filtered = filtered.filter(t => t.status?.toLowerCase() === st);
  }

  if (options?.startDate) {
    const start = new Date(options.startDate).getTime();
    if (!isNaN(start)) {
      filtered = filtered.filter(t => new Date(t.createdAt).getTime() >= start);
    }
  }

  if (options?.endDate) {
    const end = new Date(options.endDate);
    end.setHours(23, 59, 59, 999);
    const endTime = end.getTime();
    if (!isNaN(endTime)) {
      filtered = filtered.filter(t => new Date(t.createdAt).getTime() <= endTime);
    }
  }

  if (options?.search) {
    const q = options.search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(t => {
        return (
          t.description.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.reference && t.reference.toLowerCase().includes(q)) ||
          (t.referenceId && t.referenceId.toLowerCase().includes(q)) ||
          (t.txHash && t.txHash.toLowerCase().includes(q)) ||
          (t.destinationAddress && t.destinationAddress.toLowerCase().includes(q))
        );
      });
    }
  }

  // 9. Pagination
  const totalCount = filtered.length;
  const limit = options?.limit !== undefined && options.limit > 0 ? Math.min(Math.max(1, Number(options.limit)), 100) : 25;
  const page = options?.page !== undefined && options.page > 0 ? Math.max(1, Number(options.page)) : 1;
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(totalCount / limit) || 1;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    transactions: paginated,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
    },
    balance,
    summary,
  };
}
