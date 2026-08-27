import { getServerSupabase } from '../supabase';
import { LedgerEntry, LedgerType } from '../types';

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
  const { data, error } = await supabase
    .from('ledger')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`[Supabase Error] getLedgerByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load ledger: ${error.message}`);
  }

  return (data || []).map(mapDbLedgerToLedger);
}

export async function createLedgerEntry(entry: Partial<LedgerEntry>): Promise<LedgerEntry> {
  const supabase = getServerSupabase();
  const payload: any = {
    user_id: entry.userId,
    type: entry.type || 'deposit',
    amount: entry.amount || 0,
    balance_after: entry.balanceAfter || 0,
    reference_id: entry.referenceId || `TX-${Date.now()}`,
    description: entry.description || 'Ledger transaction',
    created_at: entry.createdAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ledger')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createLedgerEntry:', error.message);
    throw new Error(`Failed to write ledger entry: ${error.message}`);
  }

  return mapDbLedgerToLedger(data);
}

export async function getAllLedger(): Promise<LedgerEntry[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[Supabase Error] getAllLedger:', error.message);
    return [];
  }

  return (data || []).map(mapDbLedgerToLedger);
}
