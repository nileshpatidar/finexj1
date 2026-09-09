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

export interface GetEarningsOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedEarningsResult {
  earnings: EarningEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCount: number;
}

export async function getEarningsByUserId(
  userId: string,
  options?: GetEarningsOptions
): Promise<EarningEntry[]> {
  const supabase = getServerSupabase();
  let query = supabase.from('earnings').select('*');
  if (!isNaN(Number(userId))) {
    query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
  } else {
    query = query.eq('user_id', userId);
  }

  // Authoritative Database-Level Ordering: latest performance_date first
  query = query.order('performance_date', { ascending: false });

  if (options && options.pageSize !== undefined) {
    const page = Math.max(0, options.page ?? 0);
    const pageSize = Math.max(1, options.pageSize);
    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  let { data, error } = await query;

  if (error && error.message?.includes('column')) {
    // Isolated fallback: only if performance_date is missing from legacy schema
    let fallbackQuery = supabase.from('earnings').select('*');
    if (!isNaN(Number(userId))) {
      fallbackQuery = fallbackQuery.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      fallbackQuery = fallbackQuery.eq('user_id', userId);
    }
    fallbackQuery = fallbackQuery.order('date', { ascending: false });
    if (options && options.pageSize !== undefined) {
      const page = Math.max(0, options.page ?? 0);
      const pageSize = Math.max(1, options.pageSize);
      const from = page * pageSize;
      const to = from + pageSize - 1;
      fallbackQuery = fallbackQuery.range(from, to);
    }
    const fallbackRes = await fallbackQuery;
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    console.error(`[Supabase Error] getEarningsByUserId(${userId}):`, error.message);
    return [];
  }

  // Return mapped database records directly with ZERO redundant client-side sorting
  const mapped = (data || []).map(mapDbEarningToEarning);
  return mapped;
}

export async function getPaginatedEarningsByUserId(
  userId: string,
  options?: GetEarningsOptions
): Promise<PaginatedEarningsResult> {
  const page = Math.max(0, options?.page ?? 0);
  const pageSize = Math.max(1, options?.pageSize ?? 30);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const supabase = getServerSupabase();
  let query = supabase
    .from('earnings')
    .select('*', { count: 'exact' });

  if (!isNaN(Number(userId))) {
    query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
  } else {
    query = query.eq('user_id', userId);
  }

  let { data, error, count } = await query
    .order('performance_date', { ascending: false })
    .range(from, to);

  if (error && error.message?.includes('column')) {
    // Isolated fallback: only if performance_date is missing from legacy schema
    let fallbackQuery = supabase
      .from('earnings')
      .select('*', { count: 'exact' });

    if (!isNaN(Number(userId))) {
      fallbackQuery = fallbackQuery.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      fallbackQuery = fallbackQuery.eq('user_id', userId);
    }

    const fallbackRes = await fallbackQuery
      .order('date', { ascending: false })
      .range(from, to);

    data = fallbackRes.data;
    error = fallbackRes.error;
    count = fallbackRes.count;
  }

  if (error && error.message?.includes('Requested range not satisfiable')) {
    return { earnings: [], page, pageSize, hasMore: false, totalCount: count ?? 0 };
  }

  if (error) {
    console.error(`[Supabase Error] getPaginatedEarningsByUserId(${userId}):`, error.message);
    return { earnings: [], page, pageSize, hasMore: false, totalCount: 0 };
  }

  // Map database response directly without client-side array re-sorting
  const mapped = (data || []).map(mapDbEarningToEarning);
  const totalCount = count ?? 0;
  const hasMore = (from + mapped.length) < totalCount;

  return {
    earnings: mapped,
    page,
    pageSize,
    hasMore,
    totalCount,
  };
}

export async function createEarning(entry: Partial<EarningEntry>): Promise<EarningEntry> {
  const targetDate = entry.performanceDate || new Date().toISOString().split('T')[0];
  const supabase = getServerSupabase();
  const resolvedUserId = await resolveUserIdForDb(entry.userId);
  const perfIdNum = entry.calculationId && !isNaN(Number(entry.calculationId))
    ? parseInt(entry.calculationId, 10)
    : null;

  // Build the most complete payload first
  const payload: Record<string, any> = {
    user_id: resolvedUserId,
    date: targetDate,
    performance_date: targetDate,
    active_principal: entry.baseEligibleAmount || 0,
    base_eligible_amount: entry.baseEligibleAmount || 0,
    rate_percentage: entry.applicableRate || 0,
    applicable_rate: entry.applicableRate || 0,
    payout_amount: entry.earningsAmount || 0,
    earnings_amount: entry.earningsAmount || 0,
    status: entry.status || 'credited',
    market_condition: entry.marketCondition || ((entry.applicableRate || 0) >= 0 ? 'profit' : 'loss'),
    created_at: entry.createdAt || new Date().toISOString(),
  };

  if (perfIdNum !== null) {
    payload.daily_performance_id = perfIdNum;
  }
  if (entry.calculationId) {
    payload.calculation_id = String(entry.calculationId);
  }
  if (entry.note) {
    payload.note = entry.note;
  }

  let data: any = null;
  let lastError: any = null;

  // Attempt insert with smart column pruning for schema differences
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await supabase
      .from('earnings')
      .insert(payload)
      .select()
      .single();

    if (!res.error && res.data) {
      data = res.data;
      lastError = null;
      break;
    }

    lastError = res.error;
    const msg = res.error?.message || '';

    // If duplicate error
    if (msg.includes('unique') || msg.includes('duplicate') || res.error?.code === '23505') {
      throw new Error(`Yield for date ${targetDate} has already been credited to user ${entry.userId}.`);
    }

    // Check if error is because a column is not found in schema cache
    const colMatch = msg.match(/Could not find the '([^']+)' column/) ||
                     msg.match(/column "([^"]+)" of relation "earnings" does not exist/) ||
                     msg.match(/column '([^']+)' does not exist/);

    if (colMatch && colMatch[1] && payload[colMatch[1]] !== undefined) {
      console.warn(`[Supabase Column Prune] Removing column '${colMatch[1]}' from earnings payload and retrying.`);
      delete payload[colMatch[1]];
      continue;
    }

    // Break on unexpected errors
    break;
  }

  if (lastError || !data) {
    console.error('[Supabase Error] createEarning:', lastError?.message);
    throw new Error(`Failed to persist earnings in database: ${lastError?.message || 'Unknown database error'}`);
  }

  return mapDbEarningToEarning(data);
}

export async function deleteEarningsByDate(date: string): Promise<void> {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('earnings')
    .delete()
    .eq('date', date);

  if (error && error.message.includes('column')) {
    const res2 = await supabase
      .from('earnings')
      .delete()
      .eq('performance_date', date);

    if (res2.error) {
      console.warn(`[Supabase Notice] deleteEarningsByDate(${date}):`, res2.error.message);
    }
  } else if (error) {
    console.warn(`[Supabase Notice] deleteEarningsByDate(${date}):`, error.message);
  }
}

export async function createEarningsBatch(entries: Partial<EarningEntry>[]): Promise<EarningEntry[]> {
  const results: EarningEntry[] = [];
  for (const entry of entries) {
    const created = await createEarning(entry);
    results.push(created);
  }
  return results;
}

export async function getAllEarnings(options?: GetEarningsOptions): Promise<EarningEntry[]> {
  try {
    const supabase = getServerSupabase();
    let query = supabase
      .from('earnings')
      .select('*')
      .order('performance_date', { ascending: false });

    if (options && options.pageSize !== undefined) {
      const page = Math.max(0, options.page ?? 0);
      const pageSize = Math.max(1, options.pageSize);
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    let { data, error } = await query;

    if (error && error.message?.includes('column')) {
      let fallbackQuery = supabase
        .from('earnings')
        .select('*')
        .order('date', { ascending: false });

      if (options && options.pageSize !== undefined) {
        const page = Math.max(0, options.page ?? 0);
        const pageSize = Math.max(1, options.pageSize);
        const from = page * pageSize;
        const to = from + pageSize - 1;
        fallbackQuery = fallbackQuery.range(from, to);
      }

      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && data && data.length > 0) {
      return data.map(mapDbEarningToEarning);
    }
  } catch (err: any) {
    // fallback to user aggregation
  }

  try {
    const { users } = await getAllProfiles({ status: 'active', role: 'user' });
    const allEarnings: EarningEntry[] = [];
    for (const u of users) {
      const uEarnings = await getEarningsByUserId(u.id, options);
      allEarnings.push(...uEarnings);
    }
    return allEarnings;
  } catch (err: any) {
    return [];
  }
}

