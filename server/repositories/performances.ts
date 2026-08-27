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
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('daily_performances')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('[Supabase Error] getDailyPerformances:', error.message);
    return [];
  }

  return (data || []).map(mapDbPerfToPerf);
}

export async function getDailyPerformanceByDate(date: string): Promise<DailyPerformance | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('daily_performances')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getDailyPerformanceByDate(${date}):`, error.message);
    return null;
  }

  if (!data) return null;
  return mapDbPerfToPerf(data);
}

export async function createDailyPerformance(perf: Partial<DailyPerformance>): Promise<DailyPerformance> {
  const supabase = getServerSupabase();
  const payload: any = {
    date: perf.date,
    rate_percentage: (perf.applicableRate !== undefined ? perf.applicableRate * 100 : (perf.actualFundPerformance || 0)),
    total_fund_principal: perf.overallFundAmount || 0,
    total_yield_distributed: perf.totalDistributed || 0,
    distributed_by: perf.createdBy || 'super_admin',
    distributed_at: perf.createdAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('daily_performances')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createDailyPerformance:', error.message);
    throw new Error(`Failed to create daily performance: ${error.message}`);
  }

  return mapDbPerfToPerf(data);
}
