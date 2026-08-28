import { getServerSupabase } from '../supabase';
import { EarningEntry } from '../types';

export function mapDbEarningToEarning(e: any): EarningEntry {
  return {
    id: String(e.id),
    userId: String(e.user_id),
    calculationId: String(e.daily_performance_id || e.calculation_id || '0'),
    baseEligibleAmount: Number(e.active_principal || e.base_eligible_amount || 0),
    applicableRate: Number(e.rate_percentage || e.applicable_rate || 0),
    earningsAmount: Number(e.payout_amount || e.earnings_amount || 0),
    performanceDate: e.date || e.performance_date || new Date().toISOString().split('T')[0],
    createdAt: e.created_at || new Date().toISOString(),
    status: (e.status || 'credited') as 'credited' | 'reversed',
    marketCondition: e.market_condition || (Number(e.payout_amount || e.earnings_amount || 0) >= 0 ? 'profit' : 'loss'),
    note: e.note || undefined,
  };
}

export async function getEarningsByUserId(userId: string): Promise<EarningEntry[]> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('earnings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`[Supabase Notice] getEarningsByUserId(${userId}):`, error.message);
      return [];
    }

    return (data || []).map(mapDbEarningToEarning);
  } catch (err: any) {
    console.warn(`[Supabase Notice] getEarningsByUserId catch:`, err?.message);
    return [];
  }
}

export async function createEarning(entry: Partial<EarningEntry>): Promise<EarningEntry> {
  try {
    const supabase = getServerSupabase();
    const payload: any = {
      user_id: entry.userId,
      daily_performance_id: entry.calculationId ? parseInt(entry.calculationId, 10) || 1 : 1,
      date: entry.performanceDate || new Date().toISOString().split('T')[0],
      active_principal: entry.baseEligibleAmount || 0,
      rate_percentage: entry.applicableRate || 0,
      payout_amount: entry.earningsAmount || 0,
      created_at: entry.createdAt || new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('earnings')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn('[Supabase Warning] createEarning failed:', error.message);
      return {
        id: `earn_${Date.now()}`,
        userId: String(entry.userId),
        calculationId: String(entry.calculationId || '1'),
        baseEligibleAmount: entry.baseEligibleAmount || 0,
        applicableRate: entry.applicableRate || 0,
        earningsAmount: entry.earningsAmount || 0,
        performanceDate: entry.performanceDate || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        status: 'credited',
        marketCondition: 'profit',
      };
    }

    return mapDbEarningToEarning(data);
  } catch (err: any) {
    console.warn('[Supabase Warning] createEarning exception:', err?.message);
    return {
      id: `earn_${Date.now()}`,
      userId: String(entry.userId),
      calculationId: String(entry.calculationId || '1'),
      baseEligibleAmount: entry.baseEligibleAmount || 0,
      applicableRate: entry.applicableRate || 0,
      earningsAmount: entry.earningsAmount || 0,
      performanceDate: entry.performanceDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      status: 'credited',
      marketCondition: 'profit',
    };
  }
}

export async function getAllEarnings(): Promise<EarningEntry[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('earnings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[Supabase Error] getAllEarnings:', error.message);
    return [];
  }

  return (data || []).map(mapDbEarningToEarning);
}
