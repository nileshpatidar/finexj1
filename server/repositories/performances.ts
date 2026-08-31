import { getServerSupabase } from '../supabase';
import { DailyPerformance } from '../types';

export function mapDbPerfToPerf(p: any): DailyPerformance {
  const totalYield = Number(
    p.total_yield_percentage ??
    p.rate_percentage ??
    p.actual_fund_performance ??
    (p.trading_profit_percentage !== undefined ? Number(p.trading_profit_percentage) + Number(p.gold_reserves_percentage || 0) : 0)
  );
  const applicableRate = Number(
    p.applicable_rate !== undefined
      ? p.applicable_rate
      : (p.applicableRate !== undefined ? p.applicableRate : (totalYield / 100))
  );

  return {
    id: String(p.id),
    date: p.date,
    overallFundAmount: Number(p.total_fund_principal || p.overall_fund_amount || 0),
    actualFundPerformance: totalYield,
    applicableRate: applicableRate,
    notes: p.notes || `Performance on ${p.date}`,
    createdBy: p.distributed_by || p.created_by || 'super_admin',
    createdAt: p.created_at || p.distributed_at || new Date().toISOString(),
    appliedCount: Number(p.applied_count || 0),
    totalDistributed: Number(p.total_yield_distributed || p.total_distributed || 0),
    marketCondition: totalYield >= 0 ? 'profit' : 'loss',
  };
}

export async function getDailyPerformances(): Promise<DailyPerformance[]> {
  try {
    const supabase = getServerSupabase();
    // Try daily_performance table first (standard Supabase table)
    let res = await supabase
      .from('daily_performance')
      .select('*')
      .order('date', { ascending: false });

    if (res.error && res.error.message.includes('does not exist')) {
      res = await supabase
        .from('daily_performances')
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
    let res = await supabase
      .from('daily_performance')
      .select('*')
      .eq('date', date)
      .maybeSingle();

    if (res.error && res.error.message.includes('does not exist')) {
      res = await supabase
        .from('daily_performances')
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
  const ratePct = perf.applicableRate !== undefined
    ? Number((perf.applicableRate * 100).toFixed(4))
    : Number((perf.actualFundPerformance || 0).toFixed(4));

  const targetDate = perf.date || new Date().toISOString().split('T')[0];

  const supabase = getServerSupabase();
  const payload = {
    date: targetDate,
    trading_profit_percentage: ratePct,
    gold_reserves_percentage: 0,
    total_yield_percentage: ratePct,
    is_yield_day: true,
  };

  let { data, error } = await supabase
    .from('daily_performance')
    .insert(payload)
    .select()
    .single();

  if (error && error.message.includes('does not exist')) {
    const altPayload = {
      date: targetDate,
      rate_percentage: ratePct,
      total_fund_principal: perf.overallFundAmount || 0,
      total_yield_distributed: perf.totalDistributed || 0,
      distributed_by: perf.createdBy || 'super_admin',
      distributed_at: perf.createdAt || new Date().toISOString(),
    };
    const retry = await supabase
      .from('daily_performances')
      .insert(altPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    console.error('[Supabase Error] createDailyPerformance failed:', error?.message);
    throw new Error(`Failed to save daily performance in Supabase: ${error?.message || 'Unknown database error'}`);
  }

  return mapDbPerfToPerf(data);
}

export async function updateDailyPerformance(date: string, perf: Partial<DailyPerformance>): Promise<DailyPerformance> {
  const ratePct = perf.applicableRate !== undefined
    ? Number((perf.applicableRate * 100).toFixed(4))
    : Number((perf.actualFundPerformance || 0).toFixed(4));

  const supabase = getServerSupabase();
  const payload = {
    trading_profit_percentage: ratePct,
    gold_reserves_percentage: 0,
    total_yield_percentage: ratePct,
    is_yield_day: true,
  };

  let { data, error } = await supabase
    .from('daily_performance')
    .update(payload)
    .eq('date', date)
    .select()
    .single();

  if (error && error.message.includes('does not exist')) {
    const altPayload = {
      rate_percentage: ratePct,
      total_fund_principal: perf.overallFundAmount || 0,
      total_yield_distributed: perf.totalDistributed || 0,
      distributed_by: perf.createdBy || 'super_admin',
      distributed_at: perf.createdAt || new Date().toISOString(),
    };
    const retry = await supabase
      .from('daily_performances')
      .update(altPayload)
      .eq('date', date)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    console.error('[Supabase Error] updateDailyPerformance failed:', error?.message);
    throw new Error(`Failed to update daily performance in Supabase: ${error?.message || 'Unknown database error'}`);
  }

  return mapDbPerfToPerf(data);
}



