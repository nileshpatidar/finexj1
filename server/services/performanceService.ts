import { getAllProfiles } from '../repositories/profiles';
import { getDepositsByUserId, getAllDeposits } from '../repositories/deposits';
import {
  createDailyPerformance,
  getDailyPerformanceByDate,
  updateDailyPerformance,
} from '../repositories/performances';
import { createEarning, deleteEarningsByDate } from '../repositories/earnings';
import { createLedgerEntry, deleteLedgerByReferenceAndTypes } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { calculateUserBalanceAsync } from './balanceService';
import { DailyPerformance } from '../types';

export interface AdminDailyPerformanceInput {
  adminUserId: string;
  date: string; // YYYY-MM-DD
  overallFundAmount?: number;
  actualFundPerformance?: number;
  applicableRate: number; // e.g. 0.0050 for 0.50%
  notes?: string;
  overwriteExisting?: boolean;
}

export async function applyDailyPerformanceAsync(input: AdminDailyPerformanceInput): Promise<{
  success: boolean;
  performance?: DailyPerformance;
  appliedCount?: number;
  totalDistributed?: number;
  error?: string;
}> {
  try {
    // 1. Strict Validation of Inputs
    if (!input.date) {
      return { success: false, error: 'Performance date is required (YYYY-MM-DD).' };
    }

    if (input.applicableRate === undefined || input.applicableRate === null) {
      return { success: false, error: 'applicableRate is required and cannot be null.' };
    }

    const rawRate = typeof input.applicableRate === 'string' ? parseFloat(input.applicableRate) : Number(input.applicableRate);
    if (isNaN(rawRate) || !isFinite(rawRate)) {
      return { success: false, error: `Invalid applicableRate '${input.applicableRate}'. Must be a finite number.` };
    }

    // Derive canonical percentage points and decimal multiplier
    // e.g., 0.0050 -> 0.5000% (rate_percentage = 0.5000, applicable_rate = 0.0050)
    const ratePercentage = Number((rawRate * 100).toFixed(4));
    const applicableRate = rawRate;
    const initialFundAmount = input.overallFundAmount !== undefined && input.overallFundAmount !== null && !isNaN(Number(input.overallFundAmount))
      ? Number(input.overallFundAmount)
      : 0;
    const notes = input.notes || `Daily verified fund yield distribution (${ratePercentage >= 0 ? '+' : ''}${ratePercentage.toFixed(2)}%)`;

    // 2. Check for duplicate date
    const existing = await getDailyPerformanceByDate(input.date);
    if (existing && !input.overwriteExisting) {
      return {
        success: false,
        error: `Performance yield for date ${input.date} has already been calculated and distributed (${(existing.applicableRate * 100).toFixed(2)}%). Enable 'Overwrite / Recalculate' to update this date.`,
      };
    }

    const { users } = await getAllProfiles({ limit: 5000 });
    const activeUsers = (users || []).filter(u => u.status !== 'suspended');

    let performanceRecord: DailyPerformance;

    if (existing && input.overwriteExisting) {
      // Clear previous earnings and ledger entries for this calculation to prevent duplicate distribution
      await deleteEarningsByDate(input.date);
      await deleteLedgerByReferenceAndTypes(existing.id, ['daily_earnings', 'daily_loss']);

      performanceRecord = await updateDailyPerformance(input.date, {
        overallFundAmount: initialFundAmount,
        actualFundPerformance: ratePercentage,
        applicableRate,
        notes,
        createdBy: input.adminUserId,
      });
    } else {
      performanceRecord = await createDailyPerformance({
        date: input.date,
        overallFundAmount: initialFundAmount,
        actualFundPerformance: ratePercentage,
        applicableRate,
        notes,
        createdBy: input.adminUserId,
        createdAt: new Date().toISOString(),
        appliedCount: 0,
        totalDistributed: 0,
      });
    }

    // 3. Verify record was actually saved in daily_performances
    const verified = await getDailyPerformanceByDate(input.date);
    if (!verified) {
      return {
        success: false,
        error: 'Database save confirmation failed: daily performance record could not be verified in database.',
      };
    }

    // 4. Fetch all confirmed deposits across platform to establish authoritative pool
    const { deposits: allDeposits } = await getAllDeposits({ limit: 5000 });
    const confirmedDepositsList = (allDeposits || []).filter(d => d.status === 'confirmed');
    const liveTotalConfirmedPrincipal = confirmedDepositsList.reduce((acc, d) => acc + (d.amount || 0), 0);

    let appliedCount = 0;
    let totalDistributed = 0;
    let totalEligiblePrincipal = 0;
    const now = new Date().toISOString();

    for (const user of activeUsers) {
      // Match deposits for this user (support string and number user IDs)
      const userConfirmedDeposits = confirmedDepositsList.filter(
        d => String(d.userId) === String(user.id) || (Number(d.userId) === Number(user.id) && !isNaN(Number(user.id)))
      );

      if (userConfirmedDeposits.length === 0) continue;

      // Filter deposits eligible on or before performance date
      const eligibleDeposits = userConfirmedDeposits.filter(d => {
        if (!d.amount || d.amount <= 0) return false;
        const dateStr = (d.eligibilityDate || d.confirmedAt || d.createdAt || '').slice(0, 10);
        if (!dateStr) return true;
        return dateStr <= input.date;
      });

      // If no deposits matched strict date filter, but user has confirmed deposits on platform, include them
      const effectiveDeposits = eligibleDeposits.length > 0 ? eligibleDeposits : userConfirmedDeposits;
      const userEligiblePrincipal = effectiveDeposits.reduce((acc, d) => acc + (d.amount || 0), 0);

      if (userEligiblePrincipal > 0) {
        totalEligiblePrincipal += userEligiblePrincipal;
        const yieldPayout = Number((userEligiblePrincipal * input.applicableRate).toFixed(4));

        await createEarning({
          userId: user.id,
          calculationId: performanceRecord.id,
          baseEligibleAmount: userEligiblePrincipal,
          applicableRate: input.applicableRate,
          earningsAmount: yieldPayout,
          performanceDate: input.date,
          createdAt: now,
          status: 'credited',
          note: input.notes || `Daily performance yield distribution (${(input.applicableRate * 100).toFixed(2)}%)`,
        });

        const updatedBalance = await calculateUserBalanceAsync(user.id);
        await createLedgerEntry({
          userId: user.id,
          type: yieldPayout >= 0 ? 'daily_earnings' : 'daily_loss',
          amount: yieldPayout,
          balanceAfter: updatedBalance.availableBalance,
          referenceId: performanceRecord.id,
          description: `Daily performance yield for ${input.date} @ ${(input.applicableRate * 100).toFixed(2)}% on ${userEligiblePrincipal} USDT`,
          createdAt: now,
          performedBy: input.adminUserId,
        });

        appliedCount++;
        totalDistributed += yieldPayout;
      }
    }

    // Determine final authoritative fund amount: use actual calculated active principal or live platform total
    const finalFundAmount = totalEligiblePrincipal > 0
      ? Number(totalEligiblePrincipal.toFixed(2))
      : liveTotalConfirmedPrincipal > 0
      ? Number(liveTotalConfirmedPrincipal.toFixed(2))
      : (initialFundAmount > 0 ? initialFundAmount : 0);

    // Update applied counts, totals, and authoritative pool principal in daily performance record
    await updateDailyPerformance(input.date, {
      appliedCount,
      totalDistributed: Number(totalDistributed.toFixed(2)),
      overallFundAmount: finalFundAmount,
    });

    await createAuditLog({
      action: 'DAILY_PERFORMANCE_APPLIED',
      actorId: input.adminUserId,
      actorRole: 'admin',
      reason: `${input.overwriteExisting ? 'Updated/Recalculated' : 'Distributed'} ${(input.applicableRate * 100).toFixed(2)}% performance yield to ${appliedCount} accounts for ${input.date}`,
      timestamp: now,
    });

    return {
      success: true,
      performance: { ...performanceRecord, appliedCount, totalDistributed: Number(totalDistributed.toFixed(2)) },
      appliedCount,
      totalDistributed: Number(totalDistributed.toFixed(2)),
    };
  } catch (err: any) {
    console.error('[PerformanceService Error] applyDailyPerformanceAsync:', err);
    return {
      success: false,
      error: err.message || 'Failed to apply and save daily performance.',
    };
  }
}

