import { getAllProfiles } from '../repositories/profiles';
import { getDepositsByUserId } from '../repositories/deposits';
import {
  createDailyPerformance,
  getDailyPerformanceByDate,
  updateDailyPerformance,
} from '../repositories/performances';
import { createEarning, deleteEarningsByDate } from '../repositories/earnings';
import { createLedgerEntry } from '../repositories/ledger';
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

    const { users } = await getAllProfiles({ limit: 1000, status: 'active', role: 'user' });
    let performanceRecord: DailyPerformance;

    if (existing && input.overwriteExisting) {
      // Clear previous earnings for this date to prevent duplicate distribution
      await deleteEarningsByDate(input.date);

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

    let appliedCount = 0;
    let totalDistributed = 0;
    let totalEligiblePrincipal = 0;
    const now = new Date().toISOString();

    for (const user of users) {
      const userDeposits = await getDepositsByUserId(user.id);
      const confirmedDeposits = userDeposits.filter(
        d => d.status === 'confirmed' && d.eligibilityDate && d.eligibilityDate <= input.date
      );

      const eligiblePrincipal = confirmedDeposits.reduce((acc, d) => acc + d.amount, 0);
      if (eligiblePrincipal > 0) {
        totalEligiblePrincipal += eligiblePrincipal;
        const yieldPayout = Number((eligiblePrincipal * input.applicableRate).toFixed(4));

        await createEarning({
          userId: user.id,
          calculationId: performanceRecord.id,
          baseEligibleAmount: eligiblePrincipal,
          applicableRate: input.applicableRate,
          earningsAmount: yieldPayout,
          performanceDate: input.date,
          createdAt: now,
          status: 'credited',
          note: `Daily performance yield distribution (${(input.applicableRate * 100).toFixed(2)}%)`,
        });

        const updatedBalance = await calculateUserBalanceAsync(user.id);
        await createLedgerEntry({
          userId: user.id,
          type: yieldPayout >= 0 ? 'daily_earnings' : 'daily_loss',
          amount: yieldPayout,
          balanceAfter: updatedBalance.availableBalance,
          referenceId: performanceRecord.id,
          description: `Daily performance yield for ${input.date} @ ${(input.applicableRate * 100).toFixed(2)}% on ${eligiblePrincipal} USDT`,
          createdAt: now,
          performedBy: input.adminUserId,
        });

        appliedCount++;
        totalDistributed += yieldPayout;
      }
    }

    // Determine final authoritative fund amount: use actual calculated active principal
    const finalFundAmount = Number(totalEligiblePrincipal.toFixed(2));

    // Update applied counts, totals, and actual pool principal in daily performance record
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

