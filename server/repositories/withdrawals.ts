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
    const defaultFeePct = w.fee_percentage !== undefined && w.fee_percentage !== null ? Number(w.fee_percentage) : 6;
    feeAmt = Number((reqAmount * (defaultFeePct / 100)).toFixed(4));
    netAmt = Number((reqAmount - feeAmt).toFixed(4));
  } else if (reqAmount > 0 && netAmt > 0 && feeAmt <= 0) {
    feeAmt = Math.max(0, Number((reqAmount - netAmt).toFixed(4)));
  } else if (reqAmount > 0 && feeAmt > 0 && netAmt <= 0) {
    netAmt = Math.max(0, Number((reqAmount - feeAmt).toFixed(4)));
  }

  let feePct = 6;
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
    return [];
  }

  return (data || []).map(mapDbWithdrawalToWithdrawal);
}

export async function getWithdrawalById(id: string): Promise<Withdrawal | null> {
  const supabase = getServerSupabase();
  let query = supabase.from('withdrawals').select('*');
  if (!isNaN(Number(id))) {
    query = query.or(`id.eq.${id},id.eq.${Number(id)}`);
  } else {
    query = query.or(`id.eq.${id},reference.eq.${id}`);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    if (error) console.error(`[Supabase Error] getWithdrawalById(${id}):`, error.message);
    return null;
  }
  return mapDbWithdrawalToWithdrawal(data);
}

export async function getWithdrawalByIdempotencyKey(key: string): Promise<Withdrawal | null> {
  if (!key || !key.trim()) return null;

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('idempotency_key', key.trim())
    .maybeSingle();

  if (error || !data) {
    if (error) console.error(`[Supabase Error] getWithdrawalByIdempotencyKey(${key}):`, error.message);
    return null;
  }
  return mapDbWithdrawalToWithdrawal(data);
}

export async function createWithdrawal(wd: Partial<Withdrawal>): Promise<Withdrawal> {
  const destination = (wd.destinationAddress || '').trim();
  const amount = Number(wd.requestedAmount || 0);
  const feePct = wd.feePercentage !== undefined ? Number(wd.feePercentage) : 6;
  const feeAmount = wd.feeAmount !== undefined ? Number(wd.feeAmount) : Number((amount * (feePct / 100)).toFixed(4));
  const netAmount = wd.netAmount !== undefined ? Number(wd.netAmount) : Number((amount - feeAmount).toFixed(4));

  const supabase = getServerSupabase();
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

  const { data, error } = await supabase
    .from('withdrawals')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createWithdrawal:', error.message);
    if (error.message.includes('unique') || error.message.includes('duplicate') || error.code === '23505') {
      if (wd.idempotencyKey) {
        const existing = await getWithdrawalByIdempotencyKey(wd.idempotencyKey);
        if (existing) return existing;
      }
      throw new Error('A withdrawal with this reference or idempotency key already exists.');
    }
    throw new Error(`Failed to create withdrawal in Supabase: ${error.message}`);
  }

  return mapDbWithdrawalToWithdrawal(data);
}

export async function updateWithdrawal(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal> {
  const rawStatus = (updates.status || 'paid') as string;
  const dbStatus = (rawStatus === 'paid' || rawStatus === 'completed') ? 'completed' : rawStatus;
  const nowIso = new Date().toISOString();

  const supabase = getServerSupabase();
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

  const { data, error } = await query.select().maybeSingle();

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

export interface GetAllWithdrawalsOptions {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  userId?: string;
  userIds?: string[];
  walletAddress?: string;
  txHash?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
}

export async function getAllWithdrawals(options?: GetAllWithdrawalsOptions): Promise<{ withdrawals: Withdrawal[]; total: number }> {
  const supabase = getServerSupabase();
  const page = Math.max(1, Number(options?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options?.limit) || 20));
  const offset = (page - 1) * limit;

  let query = supabase.from('withdrawals').select('*', { count: 'exact' });

  if (options?.status && options.status !== 'all') {
    if (options.status === 'paid') {
      query = query.or('status.eq.paid,status.eq.completed');
    } else {
      query = query.eq('status', options.status);
    }
  }

  if (options?.userId) {
    if (!isNaN(Number(options.userId))) {
      query = query.or(`user_id.eq.${options.userId},user_id.eq.${Number(options.userId)}`);
    } else {
      query = query.eq('user_id', options.userId);
    }
  }

  if (options?.userIds && options.userIds.length > 0) {
    query = query.in('user_id', options.userIds);
  }

  if (options?.walletAddress && options.walletAddress.trim()) {
    query = query.ilike('destination_address', `%${options.walletAddress.trim()}%`);
  }

  if (options?.txHash && options.txHash.trim()) {
    const cleanHash = options.txHash.trim();
    query = query.or(`tx_hash.ilike.%${cleanHash}%,payout_tx_hash.ilike.%${cleanHash}%`);
  }

  if (options?.minAmount !== undefined && !isNaN(Number(options.minAmount))) {
    query = query.gte('requested_amount', Number(options.minAmount));
  }

  if (options?.maxAmount !== undefined && !isNaN(Number(options.maxAmount))) {
    query = query.lte('requested_amount', Number(options.maxAmount));
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate);
  }

  if (options?.search && options.search.trim()) {
    const term = options.search.trim().replace(/[%_]/g, '');
    if (term) {
      if (!isNaN(Number(term))) {
        query = query.or(`reference.ilike.%${term}%,destination_address.ilike.%${term}%,tx_hash.ilike.%${term}%,id.eq.${Number(term)},user_id.eq.${Number(term)}`);
      } else {
        query = query.or(`reference.ilike.%${term}%,destination_address.ilike.%${term}%,tx_hash.ilike.%${term}%,payout_tx_hash.ilike.%${term}%`);
      }
    }
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Supabase Error] getAllWithdrawals:', error.message);
    return { withdrawals: [], total: 0 };
  }

  const withdrawals = (data || []).map(mapDbWithdrawalToWithdrawal);
  return { withdrawals, total: count !== null && count !== undefined ? count : withdrawals.length };
}

export interface CreateWithdrawalAtomicInput {
  userId: number | string;
  requestedAmount: number;
  destinationAddress: string;
  reference: string;
  idempotencyKey?: string;
  userNotes?: string;
  feePercentage?: number;
  feeAmount?: number;
  netAmount?: number;
  fundLockDays?: number;
  confirmLockBreak?: boolean;
  confirmMinimumBreak?: boolean;
}

export async function createWithdrawalAtomic(input: CreateWithdrawalAtomicInput): Promise<{
  success: boolean;
  withdrawal?: Withdrawal;
  isDuplicate?: boolean;
  requiresConfirmation?: boolean;
  warningType?: 'LOCK_BREAK_WARNING' | 'MINIMUM_FUND_WARNING';
  error?: string;
}> {
  try {
    const supabase = getServerSupabase();
    const numericUserId = Number(input.userId);

    const { data, error } = await supabase.rpc('create_withdrawal_atomic', {
      p_user_id: !isNaN(numericUserId) ? numericUserId : input.userId,
      p_requested_amount: input.requestedAmount,
      p_destination_address: input.destinationAddress.trim(),
      p_reference: input.reference,
      p_idempotency_key: input.idempotencyKey || null,
      p_user_notes: input.userNotes || null,
      p_fee_percentage: input.feePercentage ?? null,
      p_fee_amount: input.feeAmount ?? null,
      p_net_amount: input.netAmount ?? null,
      p_fund_lock_days: input.fundLockDays ?? 0,
      p_confirm_lock_break: input.confirmLockBreak ?? false,
      p_confirm_minimum_break: input.confirmMinimumBreak ?? false,
    });

    if (error) {
      console.error('[Supabase RPC Error] create_withdrawal_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      return {
        success: false,
        isDuplicate: data?.is_duplicate === true,
        requiresConfirmation: data?.requires_confirmation === true,
        warningType: data?.warning_type,
        error: data?.error || 'Atomic withdrawal creation failed.',
        withdrawal: data?.withdrawal ? mapDbWithdrawalToWithdrawal(data.withdrawal) : undefined,
      };
    }

    return {
      success: true,
      isDuplicate: data?.is_duplicate === true,
      withdrawal: mapDbWithdrawalToWithdrawal(data.withdrawal),
    };
  } catch (err: any) {
    console.error('[createWithdrawalAtomic Exception]:', err?.message);
    return { success: false, error: err?.message || 'Unexpected failure in createWithdrawalAtomic' };
  }
}

export interface ProcessWithdrawalStatusAtomicInput {
  adminId: string;
  adminRole?: string;
  withdrawalId: number | string;
  newStatus: string;
  txHash?: string;
  adminNotes?: string;
}

export async function processWithdrawalStatusAtomic(input: ProcessWithdrawalStatusAtomicInput): Promise<{
  success: boolean;
  withdrawal?: Withdrawal;
  error?: string;
}> {
  try {
    const supabase = getServerSupabase();
    const numericId = Number(input.withdrawalId);

    const { data, error } = await supabase.rpc('process_withdrawal_status_atomic', {
      p_admin_id: input.adminId,
      p_admin_role: input.adminRole || 'admin',
      p_withdrawal_id: !isNaN(numericId) ? numericId : input.withdrawalId,
      p_new_status: input.newStatus,
      p_tx_hash: input.txHash ? input.txHash.trim().toLowerCase() : null,
      p_admin_notes: input.adminNotes || null,
    });

    if (error) {
      console.error('[Supabase RPC Error] process_withdrawal_status_atomic:', error.message);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || 'Atomic withdrawal status update failed.',
      };
    }

    return {
      success: true,
      withdrawal: mapDbWithdrawalToWithdrawal(data.withdrawal),
    };
  } catch (err: any) {
    console.error('[processWithdrawalStatusAtomic Exception]:', err?.message);
    return { success: false, error: err?.message || 'Unexpected failure in processWithdrawalStatusAtomic' };
  }
}


