import { getServerSupabase } from '../supabase';
import { DailyPerformance } from '../types';

/**
 * CANONICAL RELATIONSHIP DOCUMENTATION:
 * - `rate_percentage`: The percentage points value (e.g. 0.5000 represents +0.50%, -0.5000 represents -0.50%, 0 represents 0.00%).
 * - `applicable_rate`: The decimal multiplier used for balance calculations (e.g. 0.0050 multiplier, -0.0050 multiplier, 0.0000).
 * - Relationship: `rate_percentage = applicable_rate * 100` and `applicable_rate = rate_percentage / 100`.
 */

export function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return (
    dateObj.getUTCFullYear() === y &&
    dateObj.getUTCMonth() + 1 === m &&
    dateObj.getUTCDate() === d
  );
}

export function extractAndValidateRates(perf: Partial<DailyPerformance>): {
  ratePercentage: number;
  applicableRate: number;
} {
  let applicableRate: number | undefined = undefined;
  let ratePercentage: number | undefined = undefined;

  // 1. Check if applicableRate is explicitly provided
  if (perf.applicableRate !== undefined && perf.applicableRate !== null) {
    const rawNum = typeof perf.applicableRate === 'string' ? parseFloat(perf.applicableRate) : Number(perf.applicableRate);
    if (isNaN(rawNum) || !isFinite(rawNum)) {
      throw new Error(`Invalid applicable rate '${perf.applicableRate}'. Must be a finite number.`);
    }
    applicableRate = rawNum;
    ratePercentage = Number((rawNum * 100).toFixed(4));
  } else if (perf.actualFundPerformance !== undefined && perf.actualFundPerformance !== null) {
    // 2. Fallback to actualFundPerformance (provided as percentage points e.g. 0.5 for 0.5%)
    const rawPct = typeof perf.actualFundPerformance === 'string' ? parseFloat(perf.actualFundPerformance) : Number(perf.actualFundPerformance);
    if (isNaN(rawPct) || !isFinite(rawPct)) {
      throw new Error(`Invalid fund performance percentage '${perf.actualFundPerformance}'. Must be a finite number.`);
    }
    ratePercentage = rawPct;
    applicableRate = Number((rawPct / 100).toFixed(6));
  } else {
    throw new Error('Daily performance rate is required (either applicableRate or actualFundPerformance must be provided).');
  }

  // Enforce reasonable business boundaries (-100% to +100%)
  if (ratePercentage < -100 || ratePercentage > 100) {
    throw new Error(`Performance rate ${ratePercentage}% exceeds allowed bounds (-100% to +100%).`);
  }

  return { ratePercentage, applicableRate };
}

export function mapDbPerfToPerf(p: any): DailyPerformance {
  if (!p) {
    throw new Error('Cannot map empty performance record.');
  }

  // Canonical extraction of percentage points
  let ratePercentage = 0;
  if (p.rate_percentage !== null && p.rate_percentage !== undefined && !isNaN(Number(p.rate_percentage))) {
    ratePercentage = Number(p.rate_percentage);
  } else if (p.total_yield_percentage !== null && p.total_yield_percentage !== undefined && !isNaN(Number(p.total_yield_percentage))) {
    ratePercentage = Number(p.total_yield_percentage);
  } else if (p.actual_fund_performance !== null && p.actual_fund_performance !== undefined && !isNaN(Number(p.actual_fund_performance))) {
    ratePercentage = Number(p.actual_fund_performance);
  } else if (p.applicable_rate !== null && p.applicable_rate !== undefined && !isNaN(Number(p.applicable_rate))) {
    ratePercentage = Number((Number(p.applicable_rate) * 100).toFixed(4));
  } else if (p.trading_profit_percentage !== null && p.trading_profit_percentage !== undefined && !isNaN(Number(p.trading_profit_percentage))) {
    ratePercentage = Number(p.trading_profit_percentage) + Number(p.gold_reserves_percentage || 0);
  }

  // Canonical extraction of decimal multiplier
  let applicableRate = 0;
  if (p.applicable_rate !== null && p.applicable_rate !== undefined && !isNaN(Number(p.applicable_rate))) {
    applicableRate = Number(p.applicable_rate);
  } else {
    applicableRate = Number((ratePercentage / 100).toFixed(6));
  }

  const marketCondition: 'profit' | 'loss' | 'neutral' =
    ratePercentage > 0 ? 'profit' : ratePercentage < 0 ? 'loss' : 'neutral';

  return {
    id: String(p.id),
    date: p.date,
    overallFundAmount: Number(p.total_fund_principal || p.overall_fund_amount || 0),
    actualFundPerformance: ratePercentage,
    applicableRate: applicableRate,
    notes: p.notes || `Performance on ${p.date}`,
    createdBy: p.distributed_by || p.created_by || 'super_admin',
    createdAt: p.created_at || p.distributed_at || new Date().toISOString(),
    appliedCount: Number(p.applied_count || 0),
    totalDistributed: Number(p.total_yield_distributed || p.total_distributed || 0),
    marketCondition,
  };
}

export async function getDailyPerformances(): Promise<DailyPerformance[]> {
  try {
    const supabase = getServerSupabase();
    // Query authoritative daily_performances table directly
    let res = await supabase
      .from('daily_performances')
      .select('*')
      .order('date', { ascending: false });

    // Read compatibility fallback if only the view exists
    if (res.error && res.error.message.includes('does not exist')) {
      res = await supabase
        .from('daily_performance')
        .select('*')
        .order('date', { ascending: false });
    }

    if (res.error) {
      console.warn('[Supabase Notice] getDailyPerformances:', res.error.message);
      return [];
    }

    return (res.data || []).map(mapDbPerfToPerf);
  } catch (err: any) {
    console.warn('[Supabase Exception] getDailyPerformances:', err?.message);
    return [];
  }
}

export async function getDailyPerformanceByDate(date: string): Promise<DailyPerformance | null> {
  try {
    const supabase = getServerSupabase();
    // Query authoritative daily_performances table directly
    let res = await supabase
      .from('daily_performances')
      .select('*')
      .eq('date', date)
      .maybeSingle();

    // Read compatibility fallback if only the view exists
    if (res.error && res.error.message.includes('does not exist')) {
      res = await supabase
        .from('daily_performance')
        .select('*')
        .eq('date', date)
        .maybeSingle();
    }

    if (res.error || !res.data) {
      return null;
    }

    return mapDbPerfToPerf(res.data);
  } catch (err: any) {
    return null;
  }
}

export async function createDailyPerformance(perf: Partial<DailyPerformance>): Promise<DailyPerformance> {
  const targetDate = perf.date || new Date().toISOString().split('T')[0];
  if (!isValidDateString(targetDate)) {
    throw new Error(`Invalid performance date '${targetDate}'. Expected format YYYY-MM-DD (e.g. 2026-08-31).`);
  }

  const { ratePercentage, applicableRate } = extractAndValidateRates(perf);

  // Prevent duplicate performance record on the same date
  const existing = await getDailyPerformanceByDate(targetDate);
  if (existing) {
    throw new Error(`Performance record for date ${targetDate} already exists.`);
  }

  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  // Complete, canonical payload for the authoritative daily_performances table
  const payload = {
    date: targetDate,
    rate_percentage: ratePercentage,
    applicable_rate: applicableRate,
    trading_profit_percentage: ratePercentage,
    gold_reserves_percentage: 0,
    total_yield_percentage: ratePercentage,
    is_yield_day: ratePercentage !== 0,
    overall_fund_amount: perf.overallFundAmount || 0,
    total_fund_principal: perf.overallFundAmount || 0,
    actual_fund_performance: ratePercentage,
    total_yield_distributed: perf.totalDistributed || 0,
    applied_count: perf.appliedCount || 0,
    notes: perf.notes || `Performance on ${targetDate}`,
    distributed_by: perf.createdBy || 'super_admin',
    created_by: perf.createdBy || 'super_admin',
    distributed_at: perf.createdAt || now,
    created_at: perf.createdAt || now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('daily_performances')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    console.error('[Supabase Error] createDailyPerformance failed:', error?.message);
    if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
      throw new Error(`Performance record for date ${targetDate} already exists.`);
    }
    throw new Error(`Failed to save daily performance in Supabase: ${error?.message || 'Unknown database error'}`);
  }

  return mapDbPerfToPerf(data);
}

export async function updateDailyPerformance(date: string, perf: Partial<DailyPerformance>): Promise<DailyPerformance> {
  if (!isValidDateString(date)) {
    throw new Error(`Invalid performance date '${date}'. Expected format YYYY-MM-DD (e.g. 2026-08-31).`);
  }

  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    updated_at: now,
  };

  if (perf.applicableRate !== undefined || perf.actualFundPerformance !== undefined) {
    const { ratePercentage, applicableRate } = extractAndValidateRates(perf);
    payload.rate_percentage = ratePercentage;
    payload.applicable_rate = applicableRate;
    payload.trading_profit_percentage = ratePercentage;
    payload.gold_reserves_percentage = 0;
    payload.total_yield_percentage = ratePercentage;
    payload.actual_fund_performance = ratePercentage;
    payload.is_yield_day = ratePercentage !== 0;
  }

  if (perf.overallFundAmount !== undefined) {
    payload.overall_fund_amount = perf.overallFundAmount;
    payload.total_fund_principal = perf.overallFundAmount;
  }

  if (perf.totalDistributed !== undefined) {
    payload.total_yield_distributed = perf.totalDistributed;
  }

  if (perf.appliedCount !== undefined) {
    payload.applied_count = perf.appliedCount;
  }

  if (perf.notes !== undefined) {
    payload.notes = perf.notes;
  }

  if (perf.createdBy !== undefined) {
    payload.distributed_by = perf.createdBy;
    payload.created_by = perf.createdBy;
  }

  const { data, error } = await supabase
    .from('daily_performances')
    .update(payload)
    .eq('date', date)
    .select()
    .single();

  if (error || !data) {
    console.error('[Supabase Error] updateDailyPerformance failed:', error?.message);
    throw new Error(`Failed to update daily performance in Supabase: ${error?.message || 'Unknown database error'}`);
  }

  return mapDbPerfToPerf(data);
}
