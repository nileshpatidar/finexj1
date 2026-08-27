import { getProfileById } from '../repositories/profiles';
import { getDepositsByUserId } from '../repositories/deposits';
import { getEarningsByUserId } from '../repositories/earnings';
import { getWithdrawalsByUserId } from '../repositories/withdrawals';
import { getSettings } from '../repositories/settings';
import { UserBalanceSummary } from '../types';

export async function calculateUserBalanceAsync(userId: string): Promise<UserBalanceSummary> {
  const user = await getProfileById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const settings = await getSettings();
  const [deposits, earnings, withdrawals] = await Promise.all([
    getDepositsByUserId(userId),
    getEarningsByUserId(userId),
    getWithdrawalsByUserId(userId),
  ]);

  const now = new Date();

  // 1. Confirmed deposits
  const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');
  const totalDeposited = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);

  // 2. Credited earnings
  const creditedEarnings = earnings.filter(e => e.status === 'credited');
  const totalEarnings = creditedEarnings.reduce((acc, e) => acc + e.earningsAmount, 0);

  // 3. Withdrawals
  const paidWithdrawals = withdrawals.filter(w => w.status === 'paid');
  const totalWithdrawn = paidWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);
  const totalFeesPaid = paidWithdrawals.reduce((acc, w) => acc + w.feeAmount, 0);

  const activePendingWithdrawals = withdrawals.filter(
    w => w.status === 'pending' || w.status === 'under_review' || w.status === 'approved' || w.status === 'processing'
  );
  const totalPendingWithdrawals = activePendingWithdrawals.reduce((acc, w) => acc + w.requestedAmount, 0);

  // Available balance
  const rawBalance = totalDeposited + totalEarnings - totalWithdrawn - totalPendingWithdrawals;
  const availableBalance = Math.max(0, Number(rawBalance.toFixed(4)));

  // 4. Deposit Principal Lock
  const depositLockMs = (settings.depositLockPeriodDays || 30) * 24 * 60 * 60 * 1000;
  let depositLockedAmount = 0;

  for (const dep of confirmedDeposits) {
    if (dep.confirmedAt) {
      const confirmedDate = new Date(dep.confirmedAt).getTime();
      const lockExpiry = confirmedDate + depositLockMs;
      if (now.getTime() < lockExpiry) {
        depositLockedAmount += dep.amount;
      }
    }
  }

  // 5. Check user-level 30-Day Fund Lock
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

  // 6. Check 30-day account age rule
  const createdAtTime = new Date(user.createdAt).getTime();
  const accountAgeMs = now.getTime() - createdAtTime;
  const requiredAgeMs = (settings.accountAgeRequirementDays || 30) * 24 * 60 * 60 * 1000;
  const is30DaysOld = accountAgeMs >= requiredAgeMs;
  const accountAgeDays = Number((accountAgeMs / (24 * 60 * 60 * 1000)).toFixed(2));
  const withdrawalEligibleDate = new Date(createdAtTime + requiredAgeMs).toISOString();

  let lockedBalance = depositLockedAmount;
  let eligibleForWithdrawal = 0;
  let canWithdraw = true;
  let withdrawalRestrictionReason: string | undefined = undefined;

  if (user.status !== 'active') {
    canWithdraw = false;
    withdrawalRestrictionReason = `Account is currently ${user.status}.`;
  } else if (!is30DaysOld) {
    canWithdraw = false;
    const remainingMs = Math.max(0, requiredAgeMs - accountAgeMs);
    const remDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const remHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    withdrawalRestrictionReason = `Account must complete 30 full days before withdrawal. Remaining: ${remDays}d ${remHours}h.`;
  } else if (isFundLocked) {
    canWithdraw = false;
    lockedBalance = availableBalance;
    eligibleForWithdrawal = 0;
    withdrawalRestrictionReason = `30-Day Fund Lock active after withdrawal. Unlocks on ${new Date(user.fundLockUntil!).toLocaleDateString()} (${fundLockRemainingDays}d ${fundLockRemainingHours}h remaining).`;
  } else if (availableBalance <= 0) {
    canWithdraw = false;
    withdrawalRestrictionReason = 'Insufficient available balance.';
  } else {
    // Eligible amount is available balance minus locked principal
    eligibleForWithdrawal = Math.max(0, Number((availableBalance - depositLockedAmount).toFixed(4)));
    if (eligibleForWithdrawal <= 0 && depositLockedAmount > 0) {
      canWithdraw = false;
      withdrawalRestrictionReason = 'Principal deposit is in mandatory 30-day lock period.';
    }
  }

  return {
    userId: user.id,
    totalDeposited: Number(totalDeposited.toFixed(2)),
    totalEarnings: Number(totalEarnings.toFixed(4)),
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
  };
}
