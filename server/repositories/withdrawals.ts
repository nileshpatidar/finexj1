import { getServerSupabase } from '../supabase';
import { Withdrawal, WithdrawalStatus } from '../types';
import { resolveUserIdForDb } from './profiles';

export function mapDbWithdrawalToWithdrawal(w: any): Withdrawal {
  let netAmt = w.net_amount !== undefined && w.net_amount !== null
    ? Number(w.net_amount)
    : (w.netAmount !== undefined && w.netAmount !== null ? Number(w.netAmount) : 0);

  let feeAmt = w.fee_amount !== undefined && w.fee_amount !== null
    ? Number(w.fee_amount)
    : (w.feeAmount !== undefined && w.feeAmount !== null ? Number(w.feeAmount) : 0);

  let reqAmount = Number(w.requested_amount || w.amount || w.requestedAmount || 0);

  if (reqAmount <= 0 && (netAmt > 0 || feeAmt > 0)) {
    reqAmount = Number((netAmt + feeAmt).toFixed(4));
  } else if (reqAmount > 0 && netAmt <= 0 && feeAmt <= 0) {
    const defaultFeePct = w.fee_percentage !== undefined && w.fee_percentage !== null ? Number(w.fee_percentage) : 9;
    feeAmt = Number((reqAmount * (defaultFeePct / 100)).toFixed(4));
    netAmt = Number((reqAmount - feeAmt).toFixed(4));
  } else if (reqAmount > 0 && netAmt > 0 && feeAmt <= 0) {
    feeAmt = Math.max(0, Number((reqAmount - netAmt).toFixed(4)));
  } else if (reqAmount > 0 && feeAmt > 0 && netAmt <= 0) {
    netAmt = Math.max(0, Number((reqAmount - feeAmt).toFixed(4)));
  }

  let feePct = 9;
  if (w.fee_percentage !== undefined && w.fee_percentage !== null && Number(w.fee_percentage) > 0) {
    feePct = Number(w.fee_percentage);
  } else if (reqAmount > 0 && feeAmt > 0) {
    feePct = Math.round(((feeAmt / reqAmount) * 100) * 100) / 100;
  }

  const appStatus = (w.status === 'completed' ? 'paid' : (w.status || 'pending')) as WithdrawalStatus;

  return {
    id: String(w.id),
    reference: w.reference || `WD-${w.id}`,
    userId: String(w.user_id || w.userId || ''),
    requestedAmount: reqAmount,
    feePercentage: feePct,
    feeAmount: feeAmt,
    netAmount: netAmt,
    destinationAddress: w.destination_address || w.destinationAddress || '',
    network: 'BEP-20',
    status: appStatus,
    createdAt: w.created_at || w.createdAt || new Date().toISOString(),
    reviewedAt: w.reviewed_at || w.reviewedAt || undefined,
    reviewedBy: w.reviewed_by || w.reviewedBy || undefined,
    paidAt: w.paid_at || w.paidAt || (appStatus === 'paid' ? (w.reviewed_at || w.created_at) : undefined),
    txHash: w.payout_tx_hash || w.tx_hash || w.txHash || undefined,
    adminNotes: w.admin_notes || w.rejection_reason || w.adminNotes || undefined,
    userNotes: w.user_notes || w.userNotes || undefined,
    idempotencyKey: w.idempotency_key || w.idempotencyKey || undefined,
  };
}

export async function getWithdrawalsByUserId(userId: string): Promise<Withdrawal[]> {
  const supabase = getServerSupabase();
  let query = supabase.from('withdrawals').select('*');
  if (!isNaN(Number(userId))) {
    query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error(`[Supabase Error] getWithdrawalsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load withdrawals: ${error.message}`);
  }

  return (data || []).map(mapDbWithdrawalToWithdrawal);
}

export async function getWithdrawalById(id: string): Promise<Withdrawal | null> {
  const supabase = getServerSupabase();
  let query = supabase.from('withdrawals').select('*');
  if (!isNaN(Number(id))) {
    query = query.or(`id.eq.${id},id.eq.${Number(id)}`);
  } else {
    query = query.or(`id.eq.${id},reference.eq.${id},idempotency_key.eq.${id}`);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn(`[Supabase Warn] getWithdrawalById(${id}):`, error.message);
    return null;
  }

  if (!data) return null;
  return mapDbWithdrawalToWithdrawal(data);
}

export async function createWithdrawal(wd: Partial<Withdrawal>): Promise<Withdrawal> {
  const supabase = getServerSupabase();
  const destination = (wd.destinationAddress || '').trim();
  const amount = Number(wd.requestedAmount || 0);
  const feePct = wd.feePercentage !== undefined ? Number(wd.feePercentage) : 6;
  const feeAmount = wd.feeAmount !== undefined ? Number(wd.feeAmount) : Number((amount * (feePct / 100)).toFixed(4));
  const netAmount = wd.netAmount !== undefined ? Number(wd.netAmount) : Number((amount - feeAmount).toFixed(4));

  const resolvedUserId = await resolveUserIdForDb(wd.userId);

  const payload: any = {
    user_id: resolvedUserId,
    requested_amount: amount,
    amount: amount,
    fee_percentage: feePct,
    fee_amount: feeAmount,
    net_amount: netAmount,
    currency: 'USDT',
    network: 'BEP-20',
    destination_address: destination,
    status: wd.status || 'pending',
    created_at: wd.createdAt || new Date().toISOString(),
  };

  if (wd.reference) payload.reference = wd.reference;
  if (wd.idempotencyKey) payload.idempotency_key = wd.idempotencyKey;
  if (wd.userNotes) payload.user_notes = wd.userNotes;
  if (wd.txHash) payload.tx_hash = wd.txHash;
  if (wd.adminNotes) payload.rejection_reason = wd.adminNotes;

  let { data, error } = await supabase
    .from('withdrawals')
    .insert(payload)
    .select()
    .single();

  if (error && error.message.includes('column')) {
    console.warn('[Supabase Withdrawals Insert Fallback] Retrying with core schema columns:', error.message);
    const altPayload: any = {
      user_id: resolvedUserId,
      amount: amount,
      fee_percentage: feePct,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: 'USDT',
      network: 'BEP-20',
      destination_address: destination,
      status: wd.status || 'pending',
      created_at: wd.createdAt || new Date().toISOString(),
    };
    if (wd.userNotes) altPayload.notes = wd.userNotes;
    const retry = await supabase
      .from('withdrawals')
      .insert(altPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[Supabase Error] createWithdrawal:', error.message);
    throw new Error(`Failed to create withdrawal in Supabase: ${error.message}`);
  }

  return mapDbWithdrawalToWithdrawal(data);
}

export async function updateWithdrawal(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal> {
  const supabase = getServerSupabase();
  const rawStatus = (updates.status || 'paid') as string;
  const dbStatus = (rawStatus === 'paid' || rawStatus === 'completed') ? 'completed' : rawStatus;
  const nowIso = new Date().toISOString();

  const payload: any = {
    status: dbStatus,
    updated_at: nowIso,
  };

  if (updates.txHash !== undefined) {
    payload.payout_tx_hash = updates.txHash;
    payload.tx_hash = updates.txHash;
  }
  if (updates.adminNotes !== undefined) {
    payload.admin_notes = updates.adminNotes;
    payload.rejection_reason = updates.adminNotes;
  }
  if (updates.reviewedBy !== undefined) payload.reviewed_by = updates.reviewedBy;
  if (updates.reviewedAt !== undefined) payload.reviewed_at = updates.reviewedAt;
  if (updates.paidAt !== undefined) payload.paid_at = updates.paidAt;

  let query = supabase.from('withdrawals').update(payload);
  if (!isNaN(Number(id))) {
    query = query.or(`id.eq.${id},id.eq.${Number(id)}`);
  } else {
    query = query.eq('id', id);
  }

  let { data, error } = await query.select().maybeSingle();

  if (error && error.message.includes('column')) {
    // Retry with minimal columns
    const minimalPayload: any = { status: dbStatus };
    if (updates.txHash) minimalPayload.tx_hash = updates.txHash;
    if (updates.adminNotes) minimalPayload.rejection_reason = updates.adminNotes;

    let retryQuery = supabase.from('withdrawals').update(minimalPayload);
    if (!isNaN(Number(id))) {
      retryQuery = retryQuery.or(`id.eq.${id},id.eq.${Number(id)}`);
    } else {
      retryQuery = retryQuery.eq('id', id);
    }

    const retry = await retryQuery.select().maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error(`[Supabase Error] updateWithdrawal(${id}):`, error.message);
    throw new Error(`Failed to update withdrawal: ${error.message}`);
  }

  if (!data) {
    const existing = await getWithdrawalById(id);
    if (existing) return existing;
    throw new Error(`Withdrawal (${id}) not found in database.`);
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
  const limit = options?.limit || 500;
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
