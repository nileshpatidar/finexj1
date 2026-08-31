import { getServerSupabase } from '../supabase';
import { LedgerEntry, LedgerType } from '../types';
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
  let query = supabase.from('ledger').select('*');
  if (!isNaN(Number(userId))) {
    query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error(`[Supabase Error] getLedgerByUserId(${userId}):`, error.message);
    return [];
  }

  return (data || []).map(mapDbLedgerToLedger);
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

  const { data, error } = await supabase
    .from('ledger')
    .insert(payload)
    .select()
    .single();

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

