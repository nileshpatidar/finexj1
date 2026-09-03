import { getServerSupabase } from '../supabase';
import { getAllDeposits } from '../repositories/deposits';
import { getAllWithdrawals } from '../repositories/withdrawals';
import { getAllEarnings } from '../repositories/earnings';
import { getAllReferralRewards } from '../repositories/referrals';
import { getAllProfiles } from '../repositories/profiles';
import { getOperationalFundSummaryAsync } from './operationalFundService';
import { AdminAccountingSummary } from '../types';

export async function getAccountingSummaryAsync(): Promise<AdminAccountingSummary> {
  const [
    { deposits },
    { withdrawals },
    earnings,
    { rewards },
    opSummary,
    { users },
  ] = await Promise.all([
    getAllDeposits({ limit: 10000 }).catch(() => ({ deposits: [], total: 0 })),
    getAllWithdrawals({ limit: 10000 }).catch(() => ({ withdrawals: [], total: 0 })),
    getAllEarnings().catch(() => []),
    getAllReferralRewards({ limit: 10000 }).catch(() => ({ rewards: [], total: 0 })),
    getOperationalFundSummaryAsync().catch(() => ({ currentBalance: 0, totalInflow: 0, totalOutflow: 0, totalFeeIncome: 0, recentEntries: [] })),
    getAllProfiles({ limit: 10000 }).catch(() => ({ users: [], total: 0 })),
  ]);

  // 1. Deposits
  const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
  const totalDeposited = confirmedDeposits.reduce((acc, d) => acc + (d.actualAmount || d.amount), 0);

  // 2. Withdrawals & Fees
  const paidWithdrawals = withdrawals.filter(w => w.status === 'paid' || (w.status as string) === 'completed');
  const totalWithdrawn = paidWithdrawals.reduce((acc, w) => acc + (w.netAmount || (w.requestedAmount - w.feeAmount)), 0);
  const totalFeesCollected = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);

  // 3. Referral Rewards Breakdown
  let totalReferralRewardsL1 = 0;
  let totalReferralRewardsL2 = 0;

  for (const r of rewards) {
    if (r.status === 'credited') {
      if ((r as any).rewardLevel === 2 || r.reference?.includes('L2')) {
        totalReferralRewardsL2 += r.amount;
      } else {
        totalReferralRewardsL1 += r.amount;
      }
    }
  }

  const totalReferralRewardsPaid = totalReferralRewardsL1 + totalReferralRewardsL2;

  // 4. Daily Earnings Distributed
  const creditedEarnings = earnings.filter(e => e.status === 'credited');
  const totalDailyEarningsDistributed = creditedEarnings.reduce((acc, e) => acc + (e.earningsAmount || 0), 0);

  // 5. Active User Available Balances from Ledger
  let totalUserAvailableBalances = 0;
  try {
    const supabase = getServerSupabase();
    const { data: ledgerRows, error: ledgerErr } = await supabase.from('ledger').select('amount');
    if (!ledgerErr && ledgerRows) {
      totalUserAvailableBalances = ledgerRows.reduce((acc: number, entry: any) => acc + (Number(entry.amount) || 0), 0);
    }
  } catch {
    totalUserAvailableBalances = 0;
  }

  // Compounding principal (deposit principal without referral rewards)
  const activeCompoundingPrincipal = Math.max(0, totalDeposited - paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0));

  return {
    totalDeposited: Number(totalDeposited.toFixed(4)),
    totalWithdrawn: Number(totalWithdrawn.toFixed(4)),
    totalFeesCollected: Number(totalFeesCollected.toFixed(4)),
    totalReferralRewardsPaid: Number(totalReferralRewardsPaid.toFixed(4)),
    totalReferralRewardsL1: Number(totalReferralRewardsL1.toFixed(4)),
    totalReferralRewardsL2: Number(totalReferralRewardsL2.toFixed(4)),
    totalDailyEarningsDistributed: Number(totalDailyEarningsDistributed.toFixed(4)),
    operationalFundBalance: opSummary.currentBalance,
    totalUserAvailableBalances: Number(totalUserAvailableBalances.toFixed(4)),
    activeCompoundingPrincipal: Number(activeCompoundingPrincipal.toFixed(4)),
  };
}

export async function getReferralAccountingSummaryAsync(): Promise<{
  totalRewardsCount: number;
  totalRewardsAmount: number;
  level1RewardsAmount: number;
  level2RewardsAmount: number;
  uniqueReferrersCount: number;
  totalReferralsCount: number;
  recentRewards: any[];
}> {
  const { rewards, total } = await getAllReferralRewards({ limit: 1000 });
  const supabase = getServerSupabase();

  let level1Amount = 0;
  let level2Amount = 0;
  const referrerSet = new Set<string>();

  for (const r of rewards) {
    if (r.status === 'credited') {
      referrerSet.add(r.referrerId);
      if ((r as any).rewardLevel === 2 || r.reference?.includes('L2')) {
        level2Amount += r.amount;
      } else {
        level1Amount += r.amount;
      }
    }
  }

  const { count: referralsCount } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true });

  return {
    totalRewardsCount: total,
    totalRewardsAmount: Number((level1Amount + level2Amount).toFixed(4)),
    level1RewardsAmount: Number(level1Amount.toFixed(4)),
    level2RewardsAmount: Number(level2Amount.toFixed(4)),
    uniqueReferrersCount: referrerSet.size,
    totalReferralsCount: referralsCount || 0,
    recentRewards: rewards.slice(0, 50),
  };
}
