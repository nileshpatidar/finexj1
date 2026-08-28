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
  try {
    const supabase = getServerSupabase();
    let query = supabase.from('withdrawals').select('*');
    if (!isNaN(Number(userId))) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.warn(`[Supabase Warn] getWithdrawalsByUserId(${userId}):`, error.message);
      return [];
    }

    return (data || []).map(mapDbWithdrawalToWithdrawal);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getWithdrawalsByUserId(${userId}):`, err?.message);
    return [];
  }
}

export async function getWithdrawalById(id: string): Promise<Withdrawal | null> {
  try {
    const supabase = getServerSupabase();
    let query = supabase.from('withdrawals').select('*');
    if (!isNaN(Number(id))) {
      query = query.or(`id.eq.${id},id.eq.${Number(id)}`);
    } else {
      query = query.eq('id', id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.warn(`[Supabase Warn] getWithdrawalById(${id}):`, error.message);
      return null;
    }

    if (!data) return null;
    return mapDbWithdrawalToWithdrawal(data);
  } catch (err: any) {
    console.warn(`[Supabase Exception] getWithdrawalById(${id}):`, err?.message);
    return null;
  }
}

export async function createWithdrawal(wd: Partial<Withdrawal>): Promise<Withdrawal> {
  const supabase = getServerSupabase();
  const userIdNum = !isNaN(Number(wd.userId)) ? Number(wd.userId) : wd.userId;
  const destination = wd.destinationAddress || '';
  const ref = wd.reference || `WD-${Date.now()}`;

  const payload: any = {
    user_id: userIdNum,
    requested_amount: wd.requestedAmount,
    amount: wd.requestedAmount,
    fee_percentage: wd.feePercentage || 4,
    fee_amount: wd.feeAmount || Number((Number(wd.requestedAmount || 0) * 0.04).toFixed(4)),
    net_amount: wd.netAmount || Number((Number(wd.requestedAmount || 0) * 0.96).toFixed(4)),
    destination_address: destination,
    to_address: destination,
    currency: 'USDT',
    network: 'BEP-20',
    reference: ref,
    status: wd.status || 'pending',
    created_at: wd.createdAt || new Date().toISOString(),
  };

  if (wd.userNotes) {
    payload.user_notes = wd.userNotes;
    payload.notes = wd.userNotes;
  }
  if (wd.idempotencyKey) {
    payload.idempotency_key = wd.idempotencyKey;
  }

  if (wd.id && !isNaN(Number(wd.id))) {
    payload.id = Number(wd.id);
  }

  let { data, error } = await supabase
    .from('withdrawals')
    .insert(payload)
    .select()
    .single();

  if (error && error.message.includes('column')) {
    console.warn('[Supabase Withdrawals Fallback] Retrying with core fields...');
    const minimalPayload: any = {
      user_id: userIdNum,
      amount: wd.requestedAmount,
      destination_address: destination,
      status: wd.status || 'pending',
      created_at: wd.createdAt || new Date().toISOString(),
    };
    const retry = await supabase
      .from('withdrawals')
      .insert(minimalPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

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
