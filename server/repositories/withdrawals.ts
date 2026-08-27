import { getServerSupabase } from '../supabase';
import { Withdrawal, WithdrawalStatus } from '../types';

export function mapDbWithdrawalToWithdrawal(w: any): Withdrawal {
  return {
    id: String(w.id),
    reference: w.reference || `WD-${w.id}`,
    userId: String(w.user_id),
    requestedAmount: Number(w.requested_amount || w.amount || 0),
    feePercentage: 4,
    feeAmount: Number(w.fee_amount || (Number(w.requested_amount || 0) * 0.04)),
    netAmount: Number(w.net_amount || (Number(w.requested_amount || 0) * 0.96)),
    destinationAddress: w.destination_address,
    network: 'BEP-20',
    status: (w.status || 'pending') as WithdrawalStatus,
    createdAt: w.created_at || new Date().toISOString(),
    reviewedAt: w.reviewed_at || undefined,
    reviewedBy: w.reviewed_by || undefined,
    paidAt: w.paid_at || undefined,
    txHash: w.tx_hash || undefined,
    adminNotes: w.admin_notes || w.rejection_reason || undefined,
    userNotes: w.user_notes || undefined,
    idempotencyKey: w.idempotency_key || undefined,
  };
}

export async function getWithdrawalsByUserId(userId: string): Promise<Withdrawal[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`[Supabase Error] getWithdrawalsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load withdrawals: ${error.message}`);
  }

  return (data || []).map(mapDbWithdrawalToWithdrawal);
}

export async function getWithdrawalById(id: string): Promise<Withdrawal | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getWithdrawalById(${id}):`, error.message);
    throw new Error(`Failed to get withdrawal: ${error.message}`);
  }

  if (!data) return null;
  return mapDbWithdrawalToWithdrawal(data);
}

export async function createWithdrawal(wd: Partial<Withdrawal>): Promise<Withdrawal> {
  const supabase = getServerSupabase();
  const payload: any = {
    user_id: wd.userId,
    requested_amount: wd.requestedAmount,
    fee_amount: wd.feeAmount,
    net_amount: wd.netAmount,
    destination_address: wd.destinationAddress,
    status: wd.status || 'pending',
    created_at: wd.createdAt || new Date().toISOString(),
  };

  if (wd.id) {
    payload.id = wd.id;
  }

  const { data, error } = await supabase
    .from('withdrawals')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createWithdrawal:', error.message);
    throw new Error(`Failed to create withdrawal record: ${error.message}`);
  }

  return mapDbWithdrawalToWithdrawal(data);
}

export async function updateWithdrawal(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal> {
  const supabase = getServerSupabase();
  const payload: any = {};

  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.txHash !== undefined) payload.tx_hash = updates.txHash;
  if (updates.adminNotes !== undefined) {
    payload.rejection_reason = updates.adminNotes;
    payload.admin_notes = updates.adminNotes;
  }
  if (updates.reviewedAt !== undefined) payload.reviewed_at = updates.reviewedAt;
  if (updates.reviewedBy !== undefined) payload.reviewed_by = updates.reviewedBy;
  if (updates.paidAt !== undefined) payload.paid_at = updates.paidAt;

  const { data, error } = await supabase
    .from('withdrawals')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`[Supabase Error] updateWithdrawal(${id}):`, error.message);
    throw new Error(`Failed to update withdrawal: ${error.message}`);
  }

  return mapDbWithdrawalToWithdrawal(data);
}

export async function getAllWithdrawals(options?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ withdrawals: Withdrawal[]; total: number }> {
  const supabase = getServerSupabase();
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase.from('withdrawals').select('*', { count: 'exact' });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Supabase Error] getAllWithdrawals:', error.message);
    throw new Error(`Failed to load withdrawals list: ${error.message}`);
  }

  const withdrawals = (data || []).map(mapDbWithdrawalToWithdrawal);
  return { withdrawals, total: count || withdrawals.length };
}
