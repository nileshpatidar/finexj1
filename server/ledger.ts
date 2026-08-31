import { calculateUserBalanceAsync } from './services/balanceService';
import { getLedgerByUserId } from './repositories/ledger';
import { UserBalanceSummary } from './types';

export async function calculateUserBalance(userId: string): Promise<UserBalanceSummary> {
  return calculateUserBalanceAsync(userId);
}

/**
 * Reconciles the calculated balance with the total ledger entries.
 */
export async function reconcileLedger(userId: string): Promise<{ isReconciled: boolean; ledgerSum: number; calculatedBalance: number }> {
  const ledger = await getLedgerByUserId(userId);
  const ledgerSum = ledger.reduce((acc, entry) => acc + entry.amount, 0);
  const summary = await calculateUserBalanceAsync(userId);

  const isReconciled = Math.abs(ledgerSum - summary.availableBalance) < 0.0001;

  return {
    isReconciled,
    ledgerSum: Number(ledgerSum.toFixed(4)),
    calculatedBalance: summary.availableBalance,
  };
}
