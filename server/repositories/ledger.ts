import { getServerSupabase } from '../supabase';
import { LedgerEntry, LedgerType } from '../types';
import { getEarningsByUserId } from './earnings';
import { resolveUserIdForDb } from './profiles';

export function mapDbLedgerToLedger(l: any): LedgerEntry {
  return {
    id: String(l.id),
    userId: String(l.user_id),
    type: (l.type || 'deposit') as LedgerType,
    amount: Number(l.amount || 0),
    balanceAfter: Number(l.balance_after || l.balanceAfter || 0),
    referenceId: l.reference_id || l.referenceId || undefined,
    description: l.description || '',
    createdAt: l.created_at || new Date().toISOString(),
    performedBy: l.performed_by || undefined,
  };
}

export async function getLedgerByUserId(userId: string): Promise<LedgerEntry[]> {
  const supabase = getServerSupabase();
  try {
    let query = supabase.from('ledger').select('*');
    if (!isNaN(Number(userId))) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map(mapDbLedgerToLedger);
    }
  } catch (err: any) {
    console.warn(`[Supabase Notice] ledger table query error:`, err?.message);
  }

  // Graceful fallback: synthesize ledger entries from confirmed deposits, withdrawals & earnings
  try {
    let depQuery = supabase.from('deposits').select('*');
    let withQuery = supabase.from('withdrawals').select('*');

    if (!isNaN(Number(userId))) {
      depQuery = depQuery.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
      withQuery = withQuery.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      depQuery = depQuery.eq('user_id', userId);
      withQuery = withQuery.eq('user_id', userId);
    }

    const [depRes, withRes, earnings] = await Promise.all([
      depQuery,
      withQuery,
      getEarningsByUserId(userId),
    ]);

    const entries: LedgerEntry[] = [];
    if (depRes.data) {
      depRes.data.forEach((d: any) => {
        entries.push({
          id: `dep_tx_${d.id}`,
          userId: String(d.user_id),
          type: 'deposit',
          amount: Number(d.amount || d.net_amount || 0),
          balanceAfter: Number(d.amount || 0),
          referenceId: d.tx_hash || `DEP-${d.id}`,
          description: `USDT BEP-20 Deposit (${d.status})`,
          createdAt: d.created_at || new Date().toISOString(),
        });
      });
    }

    if (withRes.data) {
      withRes.data.forEach((w: any) => {
        entries.push({
          id: `with_tx_${w.id}`,
          userId: String(w.user_id),
          type: (w.status === 'paid' ? 'withdrawal_paid' : 'withdrawal_request') as LedgerType,
          amount: -Number(w.requested_amount || w.amount || 0),
          balanceAfter: 0,
          referenceId: w.payout_tx_hash || w.tx_hash || `WITH-${w.id}`,
          description: `USDT BEP-20 Withdrawal (${w.status})`,
          createdAt: w.created_at || new Date().toISOString(),
        });
      });
    }

    if (earnings && earnings.length > 0) {
      earnings.forEach(e => {
        entries.push({
          id: `earn_led_${e.id}`,
          userId: String(e.userId),
          type: 'daily_earnings',
          amount: e.earningsAmount,
          balanceAfter: 0,
          referenceId: `CALC-${e.calculationId}`,
          description: `Daily Performance Yield (${e.performanceDate})`,
          createdAt: e.createdAt,
        });
      });
    }

    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return entries;
  } catch (fallbackErr: any) {
    console.warn('[Ledger Fallback] could not fetch deposits/withdrawals:', fallbackErr?.message);
    return [];
  }
}


export async function createLedgerEntry(entry: Partial<LedgerEntry>): Promise<LedgerEntry> {
  const supabase = getServerSupabase();
  const resolvedUserId = await resolveUserIdForDb(entry.userId);
  const payload: any = {
    user_id: resolvedUserId,
    type: entry.type || 'deposit',
    amount: entry.amount || 0,
    balance_after: entry.balanceAfter || 0,
    reference_id: entry.referenceId || `TX-${Date.now()}`,
    description: entry.description || 'Ledger transaction',
    created_at: entry.createdAt || new Date().toISOString(),
  };

  if (entry.performedBy) {
    payload.performed_by = String(entry.performedBy);
  }

  let { data, error } = await supabase
    .from('ledger')
    .insert(payload)
    .select()
    .single();

  if (error && error.message.includes('column')) {
    // Retry with core columns if optional columns do not exist
    const minimalPayload: any = {
      user_id: resolvedUserId,
      type: entry.type || 'deposit',
      amount: entry.amount || 0,
      balance_after: entry.balanceAfter || 0,
      reference_id: entry.referenceId || `TX-${Date.now()}`,
      description: entry.description || 'Ledger transaction',
      created_at: entry.createdAt || new Date().toISOString(),
    };
    const retry = await supabase
      .from('ledger')
      .insert(minimalPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    console.error('[Supabase Error] createLedgerEntry:', error?.message);
    throw new Error(`Failed to persist financial ledger entry in Supabase: ${error?.message || 'Database error'}`);
  }

  return mapDbLedgerToLedger(data);
}

export async function getAllLedger(): Promise<LedgerEntry[]> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('ledger')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.warn('[Supabase Notice] getAllLedger:', error.message);
      return [];
    }

    return (data || []).map(mapDbLedgerToLedger);
  } catch (err: any) {
    return [];
  }
}
