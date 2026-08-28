import { getServerSupabase } from '../supabase';
import { EarningEntry } from '../types';
import { getDailyPerformances } from './performances';
import { getDepositsByUserId } from './deposits';
import { getAllProfiles, resolveUserIdForDb } from './profiles';

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
    let query = supabase.from('earnings').select('*');
    if (!isNaN(Number(userId))) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map(mapDbEarningToEarning);
    }
  } catch (err: any) {
    // Proceed to derive from daily_performance
  }

  // Derive earnings reliably from confirmed daily_performance records and confirmed deposits
  try {
    const performances = await getDailyPerformances();
    const deposits = await getDepositsByUserId(userId);
    const confirmedDeposits = deposits.filter(d => d.status === 'confirmed');

    if (performances.length === 0 || confirmedDeposits.length === 0) {
      return [];
    }

    const earnings: EarningEntry[] = [];
    for (const perf of performances) {
      // Find deposits confirmed on or before this performance date
      const eligible = confirmedDeposits.filter(d => {
        const depDate = d.eligibilityDate || d.confirmedAt || d.createdAt;
        return depDate ? depDate.split('T')[0] <= perf.date : false;
      });

      const eligiblePrincipal = eligible.reduce((sum, d) => sum + d.amount, 0);
      if (eligiblePrincipal > 0) {
        const rate = perf.applicableRate || (perf.actualFundPerformance / 100);
        const payout = Number((eligiblePrincipal * rate).toFixed(4));
        earnings.push({
          id: `earn_${perf.id}_${userId}`,
          userId: String(userId),
          calculationId: String(perf.id),
          baseEligibleAmount: eligiblePrincipal,
          applicableRate: rate,
          earningsAmount: payout,
          performanceDate: perf.date,
          createdAt: perf.createdAt || `${perf.date}T12:00:00.000Z`,
          status: 'credited',
          marketCondition: rate >= 0 ? 'profit' : 'loss',
          note: `Daily performance yield (${(rate * 100).toFixed(2)}%)`,
        });
      }
    }

    earnings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return earnings;
  } catch (deriveErr: any) {
    console.warn('[Earnings fallback] error deriving earnings:', deriveErr?.message);
    return [];
  }
}

export async function createEarning(entry: Partial<EarningEntry>): Promise<EarningEntry> {
  try {
    const supabase = getServerSupabase();
    const resolvedUserId = await resolveUserIdForDb(entry.userId);
    const payload: any = {
      user_id: resolvedUserId,
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
      .maybeSingle();

    if (!error && data) {
      return mapDbEarningToEarning(data);
    }
  } catch (err: any) {
    // fallback
  }

  return {
    id: `earn_${Date.now()}_${entry.userId}`,
    userId: String(entry.userId),
    calculationId: String(entry.calculationId || '1'),
    baseEligibleAmount: entry.baseEligibleAmount || 0,
    applicableRate: entry.applicableRate || 0,
    earningsAmount: entry.earningsAmount || 0,
    performanceDate: entry.performanceDate || new Date().toISOString().split('T')[0],
    createdAt: entry.createdAt || new Date().toISOString(),
    status: 'credited',
    marketCondition: (entry.applicableRate || 0) >= 0 ? 'profit' : 'loss',
    note: entry.note,
  };
}

export async function getAllEarnings(): Promise<EarningEntry[]> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('earnings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && data && data.length > 0) {
      return data.map(mapDbEarningToEarning);
    }
  } catch (err: any) {
    // fallback
  }

  try {
    const { users } = await getAllProfiles({ limit: 1000, status: 'active', role: 'user' });
    const allEarnings: EarningEntry[] = [];
    for (const u of users) {
      const uEarnings = await getEarningsByUserId(u.id);
      allEarnings.push(...uEarnings);
    }
    allEarnings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return allEarnings;
  } catch (err: any) {
    return [];
  }
}

