import { getServerSupabase } from '../supabase';
import { DailyPerformance } from '../types';

export function mapDbPerfToPerf(p: any): DailyPerformance {
  return {
    id: String(p.id),
    date: p.date,
    overallFundAmount: Number(p.total_fund_principal || p.overall_fund_amount || 0),
    actualFundPerformance: Number(p.rate_percentage || p.actual_fund_performance || 0),
    applicableRate: Number(p.rate_percentage ? p.rate_percentage / 100 : p.applicable_rate || 0),
    notes: p.notes || `Performance on ${p.date}`,
    createdBy: p.distributed_by || p.created_by || 'system',
    createdAt: p.distributed_at || p.created_at || new Date().toISOString(),
    appliedCount: Number(p.applied_count || 0),
    totalDistributed: Number(p.total_yield_distributed || p.total_distributed || 0),
    marketCondition: p.rate_percentage >= 0 ? 'profit' : 'loss',
  };
}

export async function getDailyPerformances(): Promise<DailyPerformance[]> {
  try {
    const supabase = getServerSupabase();
    let res = await supabase
      .from('daily_performances')
      .select('*')
      .order('date', { ascending: false });

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
    return [];
  }
}

export async function getDailyPerformanceByDate(date: string): Promise<DailyPerformance | null> {
  try {
    const supabase = getServerSupabase();
    let res = await supabase
      .from('daily_performances')
      .select('*')
      .eq('date', date)
      .maybeSingle();

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
  const fallback: DailyPerformance = {
    id: String(Date.now()),
    date: perf.date || new Date().toISOString().split('T')[0],
    overallFundAmount: perf.overallFundAmount || 0,
    actualFundPerformance: perf.actualFundPerformance || 0,
    applicableRate: perf.applicableRate || 0,
    notes: perf.notes || '',
    createdBy: perf.createdBy || 'super_admin',
    createdAt: new Date().toISOString(),
    appliedCount: 0,
    totalDistributed: perf.totalDistributed || 0,
    marketCondition: (perf.applicableRate || 0) >= 0 ? 'profit' : 'loss',
  };

  try {
    const supabase = getServerSupabase();
    const payload: any = {
      date: perf.date,
      rate_percentage: (perf.applicableRate !== undefined ? perf.applicableRate * 100 : (perf.actualFundPerformance || 0)),
      total_fund_principal: perf.overallFundAmount || 0,
      total_yield_distributed: perf.totalDistributed || 0,
      distributed_by: perf.createdBy || 'super_admin',
      distributed_at: perf.createdAt || new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from('daily_performances')
      .insert(payload)
      .select()
      .single();

    if (error && error.message.includes('does not exist')) {
      const retry = await supabase
        .from('daily_performance')
        .insert(payload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('[Supabase Notice] createDailyPerformance insert skipped:', error.message);
      return fallback;
    }

    return mapDbPerfToPerf(data);
  } catch (err: any) {
    return fallback;
  }
}
