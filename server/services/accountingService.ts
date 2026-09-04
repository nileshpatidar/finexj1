import { getServerSupabase } from '../supabase';
import { getAllDeposits } from '../repositories/deposits';
import { getAllWithdrawals } from '../repositories/withdrawals';
import { getAllEarnings } from '../repositories/earnings';
import { getAllReferralRewards } from '../repositories/referrals';
import { getAllProfiles, getProfileById } from '../repositories/profiles';
import { getOperationalFundSummaryAsync } from './operationalFundService';
import { getSettings } from '../repositories/settings';
import { AdminAccountingSummary, AdminLedgerResponse, AdminLedgerItem, ReferralAccountingSummary } from '../types';

function parseDateRange(period?: string, startDate?: string, endDate?: string): { start?: Date; end?: Date } {
  const now = new Date();
  
  if (period === 'today') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'yesterday') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 1);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === '7d') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 7);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (period === '30d') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 30);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (period === 'custom' && (startDate || endDate)) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    if (end) end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  return {};
}

function isWithinRange(dateStr?: string, start?: Date, end?: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

export async function fetchAllTableRowsAsync(table: string, select = '*'): Promise<any[]> {
  try {
    const supabase = getServerSupabase();
    const all: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase.from(table).select(select).range(from, to);
      if (error || !data || data.length === 0) {
        break;
      }
      all.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
    return all;
  } catch (err: any) {
    console.warn(`[Supabase Exception] fetchAllTableRowsAsync(${table}):`, err?.message);
    return [];
  }
}

export async function getAccountingSummaryAsync(options?: {
  period?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AdminAccountingSummary> {
  const settings = await getSettings().catch(() => ({ withdrawalFeePercentage: 9.0, minimumDepositAmount: 300 } as any));
  const feePct = settings.withdrawalFeePercentage || 9.0;
  const minDeposit = settings.minimumDepositAmount || 300;

  // 1. Fetch Complete Datasets using un-truncated pagination to satisfy Accounting Data Completeness
  const [
    allDepositsRaw,
    allWithdrawalsRaw,
    earnings,
    allRewardsRaw,
    opSummary,
    allUsersRaw,
    allLedgerRows,
  ] = await Promise.all([
    fetchAllTableRowsAsync('deposits').catch(() => []),
    fetchAllTableRowsAsync('withdrawals').catch(() => []),
    getAllEarnings().catch(() => []),
    fetchAllTableRowsAsync('referral_rewards').catch(() => []),
    getOperationalFundSummaryAsync().catch(() => ({ currentBalance: 0, totalInflow: 0, totalOutflow: 0, totalFeeIncome: 0, recentEntries: [] })),
    fetchAllTableRowsAsync('profiles').catch(() => []),
    fetchAllTableRowsAsync('ledger', 'amount, user_id, type').catch(() => []),
  ]);

  // Map deposits
  const deposits = allDepositsRaw.length > 0 ? allDepositsRaw.map((d: any) => ({
    id: String(d.id),
    userId: String(d.user_id),
    amount: Number(d.amount || 0),
    actualAmount: d.actual_amount !== undefined && d.actual_amount !== null ? Number(d.actual_amount) : Number(d.amount || 0),
    status: d.status || 'pending',
    createdAt: d.created_at || new Date().toISOString(),
    confirmedAt: d.confirmed_at,
  })) : (await getAllDeposits().catch(() => ({ deposits: [] }))).deposits;

  // Map withdrawals
  const withdrawals = allWithdrawalsRaw.length > 0 ? allWithdrawalsRaw.map((w: any) => ({
    id: String(w.id),
    userId: String(w.user_id),
    requestedAmount: Number(w.requested_amount || w.amount || 0),
    feeAmount: Number(w.fee_amount || 0),
    netAmount: Number(w.net_amount || 0),
    status: w.status || 'pending',
    createdAt: w.created_at || new Date().toISOString(),
    paidAt: w.paid_at,
  })) : (await getAllWithdrawals().catch(() => ({ withdrawals: [] }))).withdrawals;

  // Map referral rewards
  const rewards = allRewardsRaw.length > 0 ? allRewardsRaw.map((r: any) => ({
    id: String(r.id),
    referrerId: String(r.referrer_id),
    referredId: String(r.referred_id),
    amount: Number(r.amount || 0),
    rewardLevel: Number(r.reward_level || 1),
    reference: r.reference,
    status: r.status || 'credited',
    createdAt: r.created_at || new Date().toISOString(),
  })) : (await getAllReferralRewards().catch(() => ({ rewards: [] }))).rewards;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const selectedPeriod = options?.period || 'all';
  const { start: filterStart, end: filterEnd } = parseDateRange(selectedPeriod, options?.startDate, options?.endDate);
  const isFiltered = Boolean(filterStart || filterEnd);

  // --- Today's Dedicated Breakdown ---
  const todayConfirmedDeposits = deposits.filter(d => d.status === 'confirmed' && isWithinRange(d.confirmedAt || d.createdAt, todayStart, todayEnd));
  const todayDepositsAmount = todayConfirmedDeposits.reduce((acc, d) => acc + (d.actualAmount || d.amount), 0);

  const todayEarningsCredited = earnings.filter(e => e.status === 'credited' && isWithinRange(e.createdAt || e.date, todayStart, todayEnd));
  const todayEarningsAmount = todayEarningsCredited.reduce((acc, e) => acc + (e.earningsAmount || 0), 0);

  let todayReferralRewardsL1 = 0;
  let todayReferralRewardsL2 = 0;
  for (const r of rewards) {
    if (r.status === 'credited' && isWithinRange(r.createdAt, todayStart, todayEnd)) {
      if ((r as any).rewardLevel === 2 || r.reference?.includes('L2')) {
        todayReferralRewardsL2 += r.amount;
      } else {
        todayReferralRewardsL1 += r.amount;
      }
    }
  }

  const todayPaidWithdrawals = withdrawals.filter(w => (w.status === 'paid' || (w.status as string) === 'completed') && isWithinRange(w.paidAt || w.createdAt, todayStart, todayEnd));
  const todayWithdrawalsGross = todayPaidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const todayWithdrawalFees = todayPaidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);
  const todayFinexjRetainedFees = todayWithdrawalFees; // 100% retained by FINEXJ

  const todayOpEntries = opSummary.recentEntries.filter(e => isWithinRange(e.createdAt, todayStart, todayEnd));
  const todayOpInflow = todayOpEntries.filter(e => e.direction === 'inflow').reduce((acc, e) => acc + e.amount, 0);
  const todayOpOutflow = todayOpEntries.filter(e => e.direction === 'outflow').reduce((acc, e) => acc + e.amount, 0);
  const todayOperationalAdjustments = todayOpInflow - todayOpOutflow;

  // --- Filtered / Period Aggregate Calculations ---
  const eligibleDeposits = isFiltered
    ? deposits.filter(d => d.status === 'confirmed' && isWithinRange(d.confirmedAt || d.createdAt, filterStart, filterEnd))
    : deposits.filter(d => d.status === 'confirmed');
  const totalDeposited = eligibleDeposits.reduce((acc, d) => acc + (d.actualAmount || d.amount), 0);

  const eligibleWithdrawals = isFiltered
    ? withdrawals.filter(w => (w.status === 'paid' || (w.status as string) === 'completed') && isWithinRange(w.paidAt || w.createdAt, filterStart, filterEnd))
    : withdrawals.filter(w => w.status === 'paid' || (w.status as string) === 'completed');
  const totalWithdrawn = eligibleWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalFeesCollected = eligibleWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);
  const totalNetPayout = totalWithdrawn - totalFeesCollected;
  const finexjRetainedFees = totalFeesCollected; // 100% of fees retained by FINEXJ

  const eligibleEarnings = isFiltered
    ? earnings.filter(e => e.status === 'credited' && isWithinRange(e.createdAt || e.date, filterStart, filterEnd))
    : earnings.filter(e => e.status === 'credited');
  const totalDailyEarningsDistributed = eligibleEarnings.reduce((acc, e) => acc + (e.earningsAmount || 0), 0);

  let totalReferralRewardsL1 = 0;
  let totalReferralRewardsL2 = 0;
  const eligibleRewards = isFiltered
    ? rewards.filter(r => r.status === 'credited' && isWithinRange(r.createdAt, filterStart, filterEnd))
    : rewards.filter(r => r.status === 'credited');

  for (const r of eligibleRewards) {
    if ((r as any).rewardLevel === 2 || r.reference?.includes('L2')) {
      totalReferralRewardsL2 += r.amount;
    } else {
      totalReferralRewardsL1 += r.amount;
    }
  }
  const totalReferralRewardsPaid = totalReferralRewardsL1 + totalReferralRewardsL2;

  // Qualifying referrals count: Unique users who made confirmed deposit >= minimumDepositAmount
  const qualifiedUserIds = new Set<string>();
  for (const d of deposits) {
    if (d.status === 'confirmed' && (d.actualAmount || d.amount) >= minDeposit) {
      qualifiedUserIds.add(d.userId);
    }
  }
  const qualifyingReferralsCount = qualifiedUserIds.size;

  // Active User Available Balances from Complete Ledger Records
  let totalUserAvailableBalances = 0;
  if (allLedgerRows && allLedgerRows.length > 0) {
    totalUserAvailableBalances = allLedgerRows.reduce((acc: number, entry: any) => acc + (Number(entry.amount) || 0), 0);
  }

  // Authoritative Active Compounding Principal based on FINEXJ Eligibility & Principal Rules:
  // Evaluated per user: only active users with confirmed deposit balance qualifying under FINEXJ rules
  const userDepositsMap: Record<string, number> = {};
  const userWithdrawalsMap: Record<string, number> = {};

  for (const d of deposits) {
    if (d.status === 'confirmed') {
      userDepositsMap[d.userId] = (userDepositsMap[d.userId] || 0) + (d.actualAmount || d.amount);
    }
  }
  for (const w of withdrawals) {
    if (w.status === 'paid' || (w.status as string) === 'completed') {
      userWithdrawalsMap[w.userId] = (userWithdrawalsMap[w.userId] || 0) + w.requestedAmount;
    }
  }

  // Active users set
  const activeUserIds = new Set(
    allUsersRaw.length > 0
      ? allUsersRaw.filter((u: any) => u.status !== 'suspended' && u.status !== 'banned').map((u: any) => String(u.id))
      : Object.keys(userDepositsMap)
  );

  let activeCompoundingPrincipal = 0;
  for (const userId of activeUserIds) {
    const uDep = userDepositsMap[userId] || 0;
    const uWd = userWithdrawalsMap[userId] || 0;
    const userPrincipal = Math.max(0, uDep - uWd);
    // User is eligible for compounding returns when their active principal meets the minimum deposit requirement
    if (userPrincipal >= minDeposit) {
      activeCompoundingPrincipal += userPrincipal;
    }
  }

  // --- Financial Reconciliation ---
  // System Liquid Capital = Confirmed Deposits + Operational Fund Inflow - User Net Payouts - Operational Fund Outflow
  // Total Liabilities = Total User Available Balances
  // Operational Fund Balance = Actual recorded FINEXJ Operational Fund
  const allConfirmedDeposits = deposits.filter(d => d.status === 'confirmed');
  const allTimeDeposited = allConfirmedDeposits.reduce((acc, d) => acc + (d.actualAmount || d.amount), 0);
  const allPaidWithdrawals = withdrawals.filter(w => w.status === 'paid' || (w.status as string) === 'completed');
  const allTimeGrossWithdrawn = allPaidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);

  const netSystemCapital = Number((allTimeDeposited + opSummary.totalInflow - (allTimeGrossWithdrawn - allPaidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0)) - opSummary.totalOutflow).toFixed(4));
  const recordedLiabilitiesAndEquity = Number((totalUserAvailableBalances + opSummary.currentBalance).toFixed(4));
  const rawDiff = Number((netSystemCapital - recordedLiabilitiesAndEquity).toFixed(4));

  // Defined strict tolerance policy: 0.0001 (standard 4-decimal currency precision)
  const isBalanced = Math.abs(rawDiff) <= 0.0001;
  // NEVER silently zero out difference; preserve exact difference
  const reconciliationDifference = rawDiff;
  const reconciliationStatus: 'BALANCED' | 'REQUIRES_REVIEW' = isBalanced ? 'BALANCED' : 'REQUIRES_REVIEW';

  return {
    totalDeposited: Number(totalDeposited.toFixed(4)),
    activeCompoundingPrincipal: Number(activeCompoundingPrincipal.toFixed(4)),
    totalDailyEarningsDistributed: Number(totalDailyEarningsDistributed.toFixed(4)),
    totalReferralRewardsPaid: Number(totalReferralRewardsPaid.toFixed(4)),
    totalReferralRewardsL1: Number(totalReferralRewardsL1.toFixed(4)),
    totalReferralRewardsL2: Number(totalReferralRewardsL2.toFixed(4)),
    qualifyingReferralsCount,
    totalWithdrawn: Number(totalWithdrawn.toFixed(4)),
    totalNetPayout: Number(totalNetPayout.toFixed(4)),
    totalFeesCollected: Number(totalFeesCollected.toFixed(4)),
    finexjRetainedFees: Number(finexjRetainedFees.toFixed(4)),
    withdrawalFeePercentage: feePct,
    operationalFundBalance: opSummary.currentBalance,
    operationalFundInflow: opSummary.totalInflow,
    operationalFundOutflow: opSummary.totalOutflow,
    totalUserAvailableBalances: Number(totalUserAvailableBalances.toFixed(4)),
    expectedAccountingPosition: netSystemCapital,
    reconciliationDifference,
    reconciliationStatus,
    todayBreakdown: {
      deposits: Number(todayDepositsAmount.toFixed(4)),
      dailyEarnings: Number(todayEarningsAmount.toFixed(4)),
      referralRewardsL1: Number(todayReferralRewardsL1.toFixed(4)),
      referralRewardsL2: Number(todayReferralRewardsL2.toFixed(4)),
      totalReferralRewards: Number((todayReferralRewardsL1 + todayReferralRewardsL2).toFixed(4)),
      withdrawals: Number(todayWithdrawalsGross.toFixed(4)),
      withdrawalFees: Number(todayWithdrawalFees.toFixed(4)),
      finexjRetainedFees: Number(todayFinexjRetainedFees.toFixed(4)),
      operationalAdjustments: Number(todayOperationalAdjustments.toFixed(4)),
    },
    period: selectedPeriod,
    startDate: options?.startDate,
    endDate: options?.endDate,
  };
}

export async function getReferralAccountingSummaryAsync(): Promise<ReferralAccountingSummary> {
  // Fetch complete un-truncated referral rewards data
  const rawRewards = await fetchAllTableRowsAsync('referral_rewards').catch(() => []);
  const rewards = rawRewards.length > 0 ? rawRewards.map((r: any) => ({
    id: String(r.id),
    referrerId: String(r.referrer_id),
    referredId: String(r.referred_id),
    amount: Number(r.amount || 0),
    rewardLevel: Number(r.reward_level || 1),
    reference: r.reference,
    status: r.status || 'credited',
    createdAt: r.created_at || new Date().toISOString(),
    depositId: r.deposit_id,
    qualifyingDepositAmount: r.qualifying_deposit_amount,
    percentage: r.percentage,
  })) : (await getAllReferralRewards().catch(() => ({ rewards: [] }))).rewards;

  const total = rewards.length;
  const supabase = getServerSupabase();
  const settings = await getSettings().catch(() => ({ minimumDepositAmount: 300 } as any));
  const minDeposit = settings.minimumDepositAmount || 300;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  let level1Amount = 0;
  let level2Amount = 0;
  let todayAmount = 0;
  const referrerSet = new Set<string>();

  const enrichedRewards = [];

  for (const r of rewards) {
    const isL2 = (r as any).rewardLevel === 2 || r.reference?.includes('L2');
    const level = isL2 ? 2 : 1;

    if (r.status === 'credited') {
      referrerSet.add(r.referrerId);
      if (level === 2) {
        level2Amount += r.amount;
      } else {
        level1Amount += r.amount;
      }

      if (new Date(r.createdAt) >= todayStart) {
        todayAmount += r.amount;
      }
    }

    enrichedRewards.push({
      id: r.id,
      referrerId: r.referrerId,
      referrerEmail: 'User ' + r.referrerId.slice(0, 6) + '...',
      referredId: r.referredId,
      referredEmail: 'User ' + r.referredId.slice(0, 6) + '...',
      rewardLevel: level,
      qualifyingDepositAmount: (r as any).qualifyingDepositAmount || (level === 1 ? r.amount / 0.05 : r.amount / 0.02),
      depositId: (r as any).depositId || r.reference,
      rewardPercentage: level === 1 ? 5.0 : 2.0,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt,
    });
  }

  let totalReferralsCount = 0;
  let qualifyingReferralsCount = 0;
  try {
    const { count } = await supabase.from('referrals').select('*', { count: 'exact', head: true });
    totalReferralsCount = count || 0;

    const { data: depositsData } = await supabase.from('deposits').select('user_id, amount, status').eq('status', 'confirmed');
    if (depositsData) {
      const qualifiedUsers = new Set(depositsData.filter((d: any) => Number(d.amount) >= minDeposit).map((d: any) => String(d.user_id)));
      qualifyingReferralsCount = qualifiedUsers.size;
    }
  } catch {
    // Fallback gracefully
  }

  return {
    totalRewardsCount: total,
    totalRewardsAmount: Number((level1Amount + level2Amount).toFixed(4)),
    level1RewardsAmount: Number(level1Amount.toFixed(4)),
    level2RewardsAmount: Number(level2Amount.toFixed(4)),
    uniqueReferrersCount: referrerSet.size,
    totalReferralsCount,
    qualifyingReferralsCount,
    todayRewardsAmount: Number(todayAmount.toFixed(4)),
    recentRewards: enrichedRewards.slice(0, 50),
  };
}

export async function getAdminLedgerAsync(options: {
  page?: number;
  limit?: number;
  type?: string;
  userId?: string;
  reference?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
}): Promise<AdminLedgerResponse> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(10, options.limit || 25));
  const offset = (page - 1) * limit;

  const supabase = getServerSupabase();

  try {
    let query = supabase.from('ledger').select('*', { count: 'exact' });

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options.reference) {
      query = query.ilike('reference_id', `%${options.reference.trim()}%`);
    }

    if (options.type && options.type !== 'ALL') {
      const t = options.type.toUpperCase();
      if (t === 'DEPOSIT') query = query.eq('type', 'deposit');
      else if (t === 'DAILY_EARNING') query = query.eq('type', 'earning');
      else if (t === 'REFERRAL_REWARD_L1' || t === 'REFERRAL_REWARD_L2') query = query.eq('type', 'referral_reward');
      else if (t === 'WITHDRAWAL') query = query.eq('type', 'withdrawal');
      else if (t === 'WITHDRAWAL_FEE') query = query.eq('type', 'withdrawal_fee');
      else if (t === 'FINEXJ_OPERATIONAL_ADJUSTMENT') query = query.in('type', ['admin_adjustment', 'finexj_operational_adjustment']);
    }

    if (options.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options.endDate) {
      const end = new Date(options.endDate);
      end.setUTCHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    if (typeof options.minAmount === 'number' && !isNaN(options.minAmount)) {
      query = query.gte('amount', options.minAmount);
    }
    if (typeof options.maxAmount === 'number' && !isNaN(options.maxAmount)) {
      query = query.lte('amount', options.maxAmount);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      return { entries: [], total: 0, page, limit, totalPages: 0 };
    }

    // Cache user profiles for email resolution
    const userIds = Array.from(new Set(data.map((r: any) => String(r.user_id)).filter(Boolean)));
    const userEmailMap = new Map<string, string>();
    for (const uId of userIds) {
      try {
        const profile = await getProfileById(uId);
        if (profile) userEmailMap.set(uId, profile.email);
      } catch {}
    }

    const entries: AdminLedgerItem[] = data.map((r: any) => {
      let category: AdminLedgerItem['category'] = 'DEPOSIT';
      const rawType = (r.type || '').toLowerCase();
      const ref = r.reference_id || '';

      if (rawType === 'deposit') category = 'DEPOSIT';
      else if (rawType === 'earning') category = 'DAILY_EARNING';
      else if (rawType === 'referral_reward') {
        category = ref.includes('L2') ? 'REFERRAL_REWARD_L2' : 'REFERRAL_REWARD_L1';
      } else if (rawType === 'withdrawal') category = 'WITHDRAWAL';
      else if (rawType === 'withdrawal_fee') category = 'WITHDRAWAL_FEE';
      else if (rawType === 'admin_adjustment' || rawType.includes('operational')) category = 'FINEXJ_OPERATIONAL_ADJUSTMENT';

      return {
        id: String(r.id),
        timestamp: r.created_at,
        category,
        type: r.type,
        amount: Number(r.amount),
        userId: String(r.user_id),
        userEmail: userEmailMap.get(String(r.user_id)) || `user_${r.user_id}`,
        reference: r.reference_id,
        balanceAfter: r.balance_after !== undefined ? Number(r.balance_after) : undefined,
        description: r.description || '',
      };
    });

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      entries,
      total,
      page,
      limit,
      totalPages,
    };
  } catch (err: any) {
    return {
      entries: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    };
  }
}
