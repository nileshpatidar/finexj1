import { getServerSupabase } from '../supabase';
import { Withdrawal, WithdrawalStatus } from '../types';
import { db } from '../db';
import { resolveUserIdForDb } from './profiles';

export function mapDbWithdrawalToWithdrawal(w: any): Withdrawal {
  const reqAmount = Number(w.requested_amount || w.amount || 0);
  const feeAmt = w.fee_amount !== undefined && w.fee_amount !== null
    ? Number(w.fee_amount)
    : Number((reqAmount * 0.09).toFixed(4));
  
  // Calculate dynamic fee percentage accurately
  let feePct = 9;
  if (w.fee_percentage !== undefined && w.fee_percentage !== null) {
    feePct = Number(w.fee_percentage);
  } else if (reqAmount > 0 && feeAmt > 0) {
    feePct = Number(((feeAmt / reqAmount) * 100).toFixed(2));
  }

  const netAmt = w.net_amount !== undefined && w.net_amount !== null
    ? Number(w.net_amount)
    : Number((reqAmount - feeAmt).toFixed(4));

  return {
    id: String(w.id),
    reference: w.reference || `WD-${w.id}`,
    userId: String(w.user_id),
    requestedAmount: reqAmount,
    feePercentage: feePct,
    feeAmount: feeAmt,
    netAmount: netAmt,
    destinationAddress: w.destination_address || '',
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
      return db.getWithdrawals().filter(w => w.userId === String(userId));
    }

    if (data && data.length > 0) {
      return data.map(mapDbWithdrawalToWithdrawal);
    }
  } catch (err: any) {
    console.warn(`[Supabase Exception] getWithdrawalsByUserId(${userId}):`, err?.message);
  }

  return db.getWithdrawals().filter(w => w.userId === String(userId));
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

    if (!error && data) {
      return mapDbWithdrawalToWithdrawal(data);
    }
  } catch (err: any) {
    console.warn(`[Supabase Exception] getWithdrawalById(${id}):`, err?.message);
  }

  // In-memory fallback lookup
  const inMem = db.getWithdrawals().find(w => w.id === id || w.reference === id || (w as any).idempotencyKey === id);
  return inMem || null;
}

export async function createWithdrawal(wd: Partial<Withdrawal>): Promise<Withdrawal> {
  const supabase = getServerSupabase();
  const destination = wd.destinationAddress || '';
  const amount = Number(wd.requestedAmount || 0);
  const feePct = wd.feePercentage !== undefined ? Number(wd.feePercentage) : 9;
  const feeAmount = wd.feeAmount !== undefined ? Number(wd.feeAmount) : Number((amount * (feePct / 100)).toFixed(4));
  const netAmount = wd.netAmount !== undefined ? Number(wd.netAmount) : Number((amount - feeAmount).toFixed(4));

  const resolvedUserId = await resolveUserIdForDb(wd.userId);

  // Core payload strictly aligned with Supabase PostgreSQL schema
  const standardPayload: any = {
    user_id: resolvedUserId,
    requested_amount: amount,
    fee_amount: feeAmount,
    net_amount: netAmount,
    destination_address: destination,
    status: wd.status || 'pending',
    created_at: wd.createdAt || new Date().toISOString(),
  };

  if (wd.txHash) standardPayload.tx_hash = wd.txHash;
  if (wd.adminNotes) standardPayload.rejection_reason = wd.adminNotes;

  // Add to in-memory store for instant responsive fallback
  const memWithdrawal: Withdrawal = {
    id: wd.id || `wd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    reference: wd.reference || `WD-${Date.now().toString(36).toUpperCase()}`,
    userId: String(wd.userId),
    requestedAmount: amount,
    feePercentage: feePct,
    feeAmount,
    netAmount,
    destinationAddress: destination,
    network: 'BEP-20',
    status: (wd.status || 'pending') as WithdrawalStatus,
    createdAt: wd.createdAt || new Date().toISOString(),
    userNotes: wd.userNotes,
    idempotencyKey: wd.idempotencyKey,
  };
  db.addWithdrawal(memWithdrawal);

  try {
    let { data, error } = await supabase
      .from('withdrawals')
      .insert(standardPayload)
      .select()
      .maybeSingle();

    if (error && error.message.includes('column')) {
      console.warn('[Supabase Withdrawals Insert Fallback] Retrying with alternative column alias:', error.message);
      const altPayload: any = {
        user_id: resolvedUserId,
        amount: amount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        destination_address: destination,
        status: wd.status || 'pending',
        created_at: wd.createdAt || new Date().toISOString(),
      };
      const retry = await supabase
        .from('withdrawals')
        .insert(altPayload)
        .select()
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[Supabase Error] createWithdrawal:', error.message, error.details || '');
    } else if (data) {
      const savedWithdrawal = mapDbWithdrawalToWithdrawal(data);
      // Synchronize in-memory record with generated DB id
      db.updateWithdrawal(memWithdrawal.id, { id: savedWithdrawal.id });
      return savedWithdrawal;
    }
  } catch (err: any) {
    console.warn('[Supabase Exception] createWithdrawal:', err?.message);
  }

  return memWithdrawal;
}

export async function updateWithdrawal(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal> {
  // Always update in-memory record first to guarantee immediate consistency
  db.updateWithdrawal(id, updates);

  try {
    const supabase = getServerSupabase();
    const payload: any = {};

    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.txHash !== undefined) payload.tx_hash = updates.txHash;
    if (updates.adminNotes !== undefined) {
      payload.rejection_reason = updates.adminNotes;
    }
    if (updates.reviewedAt !== undefined) payload.reviewed_at = updates.reviewedAt;
    if (updates.reviewedBy !== undefined) payload.reviewed_by = updates.reviewedBy;

    let query = supabase.from('withdrawals').update(payload);
    if (!isNaN(Number(id))) {
      query = query.eq('id', Number(id));
    } else {
      query = query.eq('id', id);
    }

    let { data, error } = await query.select().maybeSingle();

    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      console.warn(`[Supabase Withdrawals Fallback] Retrying update with minimal status field...`);
      const minimalPayload: any = { status: updates.status };
      if (updates.txHash !== undefined) minimalPayload.tx_hash = updates.txHash;
      let retryQuery = supabase.from('withdrawals').update(minimalPayload);
      if (!isNaN(Number(id))) {
        retryQuery = retryQuery.eq('id', Number(id));
      } else {
        retryQuery = retryQuery.eq('id', id);
      }
      const retry = await retryQuery.select().maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (data) {
      return mapDbWithdrawalToWithdrawal(data);
    }
  } catch (err: any) {
    console.warn(`[Supabase updateWithdrawal Error]:`, err?.message);
  }

  const inMem = db.getWithdrawals().find(w => w.id === id || w.reference === id);
  if (inMem) {
    return { ...inMem, ...updates };
  }

  return {
    id,
    reference: `WD-${id}`,
    userId: '1',
    requestedAmount: 0,
    feePercentage: 9,
    feeAmount: 0,
    netAmount: 0,
    destinationAddress: '',
    network: 'BEP-20',
    status: updates.status || 'paid',
    createdAt: new Date().toISOString(),
    ...updates,
  };
}

export async function getAllWithdrawals(options?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ withdrawals: Withdrawal[]; total: number }> {
  try {
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

    if (!error && data) {
      const withdrawals = data.map(mapDbWithdrawalToWithdrawal);
      return { withdrawals, total: count || withdrawals.length };
    }
  } catch (err: any) {
    console.warn('[Supabase Warn] getAllWithdrawals:', err?.message);
  }

  const memWithdrawals = db.getWithdrawals();
  return { withdrawals: memWithdrawals, total: memWithdrawals.length };
}
