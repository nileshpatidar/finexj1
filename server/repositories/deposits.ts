import { getServerSupabase } from '../supabase';
import { Deposit, DepositStatus } from '../types';

export function mapDbDepositToDeposit(d: any): Deposit {
  return {
    id: String(d.id),
    userId: String(d.user_id),
    amount: Number(d.amount),
    currency: 'USDT',
    network: 'BEP-20',
    txHash: d.tx_hash,
    fromAddress: d.from_address || undefined,
    toAddress: d.to_address || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
    status: (d.status || 'confirmed') as DepositStatus,
    confirmations: Number(d.confirmations || 15),
    requiredConfirmations: Number(d.required_confirmations || 12),
    createdAt: d.created_at || new Date().toISOString(),
    confirmedAt: d.confirmed_at || undefined,
    eligibilityDate: d.eligibility_date || undefined,
    depositLockEndDate: d.lock_expires_at || d.deposit_lock_end_date || undefined,
    proofPhotoUrl: d.proof_url || d.proof_photo_url || undefined,
    userNotes: d.user_notes || undefined,
    adminNotes: d.admin_notes || undefined,
    reviewedAt: d.reviewed_at || undefined,
    reviewedBy: d.reviewed_by || undefined,
    notes: d.notes || undefined,
  };
}

export async function getDepositsByUserId(userId: string): Promise<Deposit[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`[Supabase Error] getDepositsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load deposits: ${error.message}`);
  }

  return (data || []).map(mapDbDepositToDeposit);
}

export async function getDepositById(id: string): Promise<Deposit | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getDepositById(${id}):`, error.message);
    throw new Error(`Failed to get deposit: ${error.message}`);
  }

  if (!data) return null;
  return mapDbDepositToDeposit(data);
}

export async function getDepositByTxHash(txHash: string): Promise<Deposit | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .ilike('tx_hash', txHash.trim())
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getDepositByTxHash(${txHash}):`, error.message);
    return null;
  }

  if (!data) return null;
  return mapDbDepositToDeposit(data);
}

export async function createDeposit(dep: Partial<Deposit>): Promise<Deposit> {
  const supabase = getServerSupabase();
  const userIdNum = !isNaN(Number(dep.userId)) ? Number(dep.userId) : dep.userId;
  const payload: any = {
    user_id: userIdNum,
    amount: dep.amount,
    net_amount: dep.amount,
    tx_hash: dep.txHash || `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`,
    status: dep.status || 'confirmed',
    confirmations: dep.confirmations || 15,
    lock_expires_at: dep.depositLockEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: dep.createdAt || new Date().toISOString(),
  };

  if (dep.proofPhotoUrl) {
    payload.proof_url = dep.proofPhotoUrl;
  }
  if (dep.userNotes) {
    payload.notes = dep.userNotes;
  }

  let { data, error } = await supabase
    .from('deposits')
    .insert(payload)
    .select()
    .single();

  if (error && error.message.includes('column')) {
    console.warn('[Supabase Deposits Fallback] Retrying insert with core deposit fields...');
    const minimalPayload: any = {
      user_id: userIdNum,
      amount: dep.amount,
      tx_hash: dep.txHash || `0x${Date.now().toString(16)}`,
      status: dep.status || 'confirmed',
      confirmations: dep.confirmations || 15,
      created_at: dep.createdAt || new Date().toISOString(),
    };
    const retry = await supabase
      .from('deposits')
      .insert(minimalPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[Supabase Error] createDeposit:', error.message);
    throw new Error(`Failed to create deposit: ${error.message}`);
  }

  return mapDbDepositToDeposit(data);
}

export async function updateDeposit(id: string, updates: Partial<Deposit>): Promise<Deposit> {
  const supabase = getServerSupabase();
  const payload: any = {};

  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.confirmations !== undefined) payload.confirmations = updates.confirmations;
  if (updates.confirmedAt !== undefined) payload.confirmed_at = updates.confirmedAt;
  if (updates.adminNotes !== undefined) payload.notes = updates.adminNotes;
  if (updates.txHash !== undefined) payload.tx_hash = updates.txHash;
  if (updates.amount !== undefined) payload.amount = updates.amount;

  const { data, error } = await supabase
    .from('deposits')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`[Supabase Error] updateDeposit(${id}):`, error.message);
    throw new Error(`Failed to update deposit: ${error.message}`);
  }

  return mapDbDepositToDeposit(data);
}

export async function getAllDeposits(options?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ deposits: Deposit[]; total: number }> {
  const supabase = getServerSupabase();
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase.from('deposits').select('*', { count: 'exact' });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Supabase Error] getAllDeposits:', error.message);
    throw new Error(`Failed to load deposits list: ${error.message}`);
  }

  const deposits = (data || []).map(mapDbDepositToDeposit);
  return { deposits, total: count || deposits.length };
}
