import { getAllProfiles } from '../repositories/profiles';
import { getDepositsByUserId, getAllDeposits } from '../repositories/deposits';
import { getAllWithdrawals } from '../repositories/withdrawals';
import { getSettings } from '../repositories/settings';
import {
  createDailyPerformance,
  getDailyPerformanceByDate,
  updateDailyPerformance,
  isValidDateString,
} from '../repositories/performances';
import { createEarning, deleteEarningsByDate, getAllEarnings } from '../repositories/earnings';
import { createLedgerEntry, deleteLedgerByReferenceAndTypes } from '../repositories/ledger';
import { createAuditLog } from '../repositories/auditLogs';
import { calculateUserBalanceAsync } from './balanceService';
import { fetchAllTableRowsAsync } from './accountingService';
import { getServerSupabase } from '../supabase';
import { DecimalSafe } from '../utils/decimalSafe';
import { DailyPerformance } from '../types';

// In-flight concurrency lock to prevent simultaneous race conditions for the same date
const inFlightPerformanceDates = new Set<string>();

export interface AdminDailyPerformanceInput {
  adminUserId: string;
  date: string; // YYYY-MM-DD
  overallFundAmount?: number;
  actualFundPerformance?: number;
  applicableRate: number; // e.g. 0.0050 for 0.50%
  notes?: string;
  overwriteExisting?: boolean;
}

/**
 * Pure authoritative daily earning calculation.
 * Formula: earningsAmount = Number((baseEligibleAmount * applicableRate).toFixed(4))
 * e.g., 1000 USDT * 0.0050 = 5.0000 USDT
 */
export function calculateUserDailyEarning(
  userPrincipal: number,
  applicableRate: number
): {
  baseEligibleAmount: number;
  applicableRate: number;
  earningsAmount: number;
  marketCondition: 'profit' | 'loss' | 'neutral';
} {
  const principal = typeof userPrincipal === 'string' ? parseFloat(userPrincipal) : Number(userPrincipal);
  const rate = typeof applicableRate === 'string' ? parseFloat(applicableRate) : Number(applicableRate);

  if (isNaN(principal) || !isFinite(principal) || principal <= 0) {
    return {
      baseEligibleAmount: 0,
      applicableRate: isNaN(rate) || !isFinite(rate) ? 0 : rate,
      earningsAmount: 0,
      marketCondition: 'neutral',
    };
  }

  if (isNaN(rate) || !isFinite(rate)) {
    throw new Error(`Invalid applicableRate '${applicableRate}'. Must be a finite number.`);
  }

  const earningsAmount = Number((principal * rate).toFixed(4));
  const marketCondition = earningsAmount > 0 ? 'profit' : earningsAmount < 0 ? 'loss' : 'neutral';

  return {
    baseEligibleAmount: Number(principal.toFixed(4)),
    applicableRate: rate,
    earningsAmount,
    marketCondition,
  };
}

export async function applyDailyPerformanceAsync(input: AdminDailyPerformanceInput): Promise<{
  success: boolean;
  performance?: DailyPerformance;
  appliedCount?: number;
  totalDistributed?: number;
  error?: string;
}> {
  // 1. In-flight concurrency lock: prevent simultaneous executions for the same date
  if (inFlightPerformanceDates.has(input.date)) {
    return {
      success: false,
      error: `Daily performance calculation for date ${input.date} is currently in progress. Please wait for completion.`,
    };
  }

  inFlightPerformanceDates.add(input.date);

  try {
    // 2. Strict Validation of Inputs
    if (!input.date || !isValidDateString(input.date)) {
      return { success: false, error: 'Valid performance date is required in YYYY-MM-DD format (e.g. 2026-08-31).' };
    }

    if (input.applicableRate === undefined || input.applicableRate === null) {
      return { success: false, error: 'applicableRate is required and cannot be null.' };
    }

    const rawRate = typeof input.applicableRate === 'string' ? parseFloat(input.applicableRate) : Number(input.applicableRate);
    if (isNaN(rawRate) || !isFinite(rawRate)) {
      return { success: false, error: `Invalid applicableRate '${input.applicableRate}'. Must be a finite number.` };
    }

    // STRICT CONFIGURATION SAFETY: Read and validate minimumDepositAmount
    let settings: any;
    try {
      settings = await getSettings();
    } catch (err: any) {
      await createAuditLog({
        action: 'CONFIGURATION_ERROR',
        actorId: input.adminUserId,
        actorRole: 'admin',
        reason: `System settings unavailable for performance yield calculation: ${err?.message || err}`,
      });
      return {
        success: false,
        error: 'Financial configuration error: system settings unavailable. Yield calculation aborted.',
      };
    }

    const minDeposit = Number(settings.minimumDepositAmount);
    if (isNaN(minDeposit) || minDeposit <= 0) {
      await createAuditLog({
        action: 'CONFIGURATION_ERROR',
        actorId: input.adminUserId,
        actorRole: 'admin',
        reason: `Missing or invalid minimumDepositAmount in system settings: ${settings.minimumDepositAmount}`,
      });
      return {
        success: false,
        error: 'Financial configuration error: minimumDepositAmount is invalid or missing in system settings. Yield calculation aborted.',
      };
    }

    // Derive canonical percentage points and decimal multiplier
    const ratePercentage = Number((rawRate * 100).toFixed(4));
    const applicableRate = rawRate;
    const initialFundAmount = input.overallFundAmount !== undefined && input.overallFundAmount !== null && !isNaN(Number(input.overallFundAmount))
      ? Number(input.overallFundAmount)
      : 0;
    const notes = input.notes || `Daily verified fund yield distribution (${ratePercentage >= 0 ? '+' : ''}${ratePercentage.toFixed(2)}%)`;

    // 3. PRIMARY PATH: Atomic PostgreSQL RPC Execution (ACID isolation, advisory lock, zero partial state)
    try {
      const supabase = getServerSupabase();
      const { data: rpcData, error: rpcError } = await supabase.rpc('distribute_daily_performance_atomic', {
        p_date: input.date,
        p_applicable_rate: applicableRate,
        p_overall_fund_amount: initialFundAmount,
        p_notes: notes,
        p_admin_user_id: input.adminUserId,
        p_overwrite_existing: Boolean(input.overwriteExisting),
      });

      if (!rpcError && rpcData) {
        if (rpcData.success) {
          const perf = rpcData.performance;
          return {
            success: true,
            performance: {
              id: String(perf.id),
              date: perf.date,
              actualFundPerformance: Number(perf.actualFundPerformance || ratePercentage),
              applicableRate: Number(perf.applicableRate || applicableRate),
              overallFundAmount: Number(perf.overallFundAmount || 0),
              totalDistributed: Number(rpcData.totalDistributed || 0),
              appliedCount: Number(rpcData.appliedCount || 0),
              notes: perf.notes || notes,
              createdBy: input.adminUserId,
              createdAt: new Date().toISOString(),
              marketCondition: ratePercentage >= 0 ? 'profit' : 'loss',
            },
            appliedCount: Number(rpcData.appliedCount || 0),
            totalDistributed: Number(rpcData.totalDistributed || 0),
          };
        } else {
          return {
            success: false,
            error: rpcData.error || 'Failed to distribute daily performance yield.',
          };
        }
      }
    } catch (rpcEx: any) {
      console.warn('[PerformanceService] distribute_daily_performance_atomic RPC unavailable, executing DecimalSafe fallback:', rpcEx?.message);
    }

    // 4. FALLBACK PATH: Uncapped DecimalSafe Application-Side Processing
    // Check for duplicate date in fallback
    const existing = await getDailyPerformanceByDate(input.date);
    if (existing && !input.overwriteExisting) {
      return {
        success: false,
        error: `Performance yield for date ${input.date} has already been calculated and distributed (${(existing.applicableRate * 100).toFixed(2)}%). Enable 'Overwrite / Recalculate' to update this date.`,
      };
    }

    // Use uncapped table reader to guarantee zero users are excluded by pagination
    const allProfilesRaw = await fetchAllTableRowsAsync('profiles').catch(() => []);
    const activeUsers = allProfilesRaw.length > 0 
      ? allProfilesRaw.filter((u: any) => u.status !== 'suspended').map((u: any) => ({ id: String(u.id), email: u.email, status: u.status }))
      : (await getAllProfiles({ limit: 10000 })).users.filter(u => u.status !== 'suspended');

    let performanceRecord: DailyPerformance;

    if (existing && input.overwriteExisting) {
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

    const verified = await getDailyPerformanceByDate(input.date);
    if (!verified) {
      return {
        success: false,
        error: 'Database save confirmation failed: daily performance record could not be verified in database.',
      };
    }

    const [{ deposits: allDeposits }, { withdrawals: allWithdrawals }, allEarnings] = await Promise.all([
      getAllDeposits(),
      getAllWithdrawals(),
      getAllEarnings(),
    ]);
    const confirmedDepositsList = (allDeposits || []).filter(d => d.status === 'confirmed');
    const paidWithdrawalsList = (allWithdrawals || []).filter(w => w.status === 'paid');
    const creditedEarningsList = (allEarnings || []).filter(e => e.status === 'credited');
    const totalDepositedSum = confirmedDepositsList.reduce((acc, d) => acc + (d.amount || 0), 0);
    const totalWithdrawnSum = paidWithdrawalsList.reduce((acc, w) => acc + (w.requestedAmount || 0), 0);
    const liveTotalConfirmedPrincipal = Math.max(0, totalDepositedSum - totalWithdrawnSum);

    let appliedCount = 0;
    let totalDistributed = DecimalSafe.zero();
    let totalEligiblePrincipal = DecimalSafe.zero();
    const now = new Date().toISOString();

    for (const user of activeUsers) {
      const userConfirmedDeposits = confirmedDepositsList.filter(
        d => String(d.userId) === String(user.id) || (Number(d.userId) === Number(user.id) && !isNaN(Number(user.id)))
      );
      const userPaidWithdrawals = paidWithdrawalsList.filter(
        w => String(w.userId) === String(user.id) || (Number(w.userId) === Number(user.id) && !isNaN(Number(user.id)))
      );
      const userCreditedEarnings = creditedEarningsList.filter(
        e => String(e.userId) === String(user.id) || (Number(e.userId) === Number(user.id) && !isNaN(Number(user.id)))
      );

      if (userConfirmedDeposits.length === 0) continue;

      // 1. Confirmed deposits eligible on or before input.date within independent 55-day maturity
      const eligibleDeposits = userConfirmedDeposits.filter(d => {
        if (!d.amount || d.amount <= 0) return false;
        const dateStr = (d.eligibilityDate || d.confirmedAt || d.createdAt || '').slice(0, 10);
        if (!dateStr || dateStr > input.date) return false;

        // Independent 55-day maturity check per deposit
        const dDate = new Date(dateStr + 'T00:00:00Z').getTime();
        const pDate = new Date(input.date + 'T00:00:00Z').getTime();
        const diffDays = Math.floor((pDate - dDate) / (24 * 60 * 60 * 1000));
        return diffDays >= 0 && diffDays < 55;
      });

      const userGrossPrincipal = eligibleDeposits.reduce((acc, d) => acc + (d.amount || 0), 0);

      // 2. Previous credited compounding earnings strictly before input.date (prevents double-counting)
      const userPrevEarnings = userCreditedEarnings
        .filter(e => {
          const eDate = (e.performanceDate || e.createdAt || '').slice(0, 10);
          return eDate < input.date;
        })
        .reduce((acc, e) => acc + (e.earningsAmount || 0), 0);

      // 3. Paid withdrawals on or before input.date (withdrawals permanently reduce compounding capital)
      const userTotalWithdrawn = userPaidWithdrawals
        .filter(w => {
          const wDate = (w.paidAt || w.createdAt || '').slice(0, 10);
          return wDate <= input.date;
        })
        .reduce((acc, w) => acc + (w.requestedAmount || 0), 0);

      // 4. True Daily Compounding Base: active deposit principal + previous credited earnings - amounts withdrawn
      // Referral rewards are strictly segregated and NEVER included in compounding
      const userEligiblePrincipal = Math.max(0, Number((userGrossPrincipal + userPrevEarnings - userTotalWithdrawn).toFixed(4)));

      if (userEligiblePrincipal >= minDeposit) {
        totalEligiblePrincipal = totalEligiblePrincipal.add(userEligiblePrincipal);
        const calculated = calculateUserDailyEarning(userEligiblePrincipal, input.applicableRate);
        const yieldPayout = calculated.earningsAmount;

        try {
          await createEarning({
            userId: user.id,
            calculationId: performanceRecord.id,
            baseEligibleAmount: userEligiblePrincipal,
            applicableRate: input.applicableRate,
            earningsAmount: yieldPayout,
            performanceDate: input.date,
            createdAt: now,
            status: 'credited',
            marketCondition: calculated.marketCondition,
            note: input.notes || `Daily performance yield distribution (${(input.applicableRate * 100).toFixed(2)}%)`,
          });
        } catch (earningErr: any) {
          if (earningErr.message && earningErr.message.includes('already been credited')) {
            // Safe idempotency
          } else {
            throw earningErr;
          }
        }

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
        totalDistributed = totalDistributed.add(yieldPayout);
      }
    }

    const finalFundAmount = totalEligiblePrincipal.toNumber(2) > 0
      ? totalEligiblePrincipal.toNumber(2)
      : liveTotalConfirmedPrincipal > 0
      ? Number(liveTotalConfirmedPrincipal.toFixed(2))
      : (initialFundAmount > 0 ? initialFundAmount : 0);

    await updateDailyPerformance(input.date, {
      appliedCount,
      totalDistributed: totalDistributed.toNumber(2),
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
      performance: { ...performanceRecord, appliedCount, totalDistributed: totalDistributed.toNumber(2) },
      appliedCount,
      totalDistributed: totalDistributed.toNumber(2),
    };
  } catch (err: any) {
    console.error('[PerformanceService Error] applyDailyPerformanceAsync:', err);
    return {
      success: false,
      error: err.message || 'Failed to apply and save daily performance.',
    };
  } finally {
    inFlightPerformanceDates.delete(input.date);
  }
}

