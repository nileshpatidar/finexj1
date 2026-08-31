import { getServerSupabase } from '../supabase';
import { Deposit, DepositStatus } from '../types';
import { resolveUserIdForDb } from './profiles';
import { getPublicDepositProofUrl } from '../storage';

export function mapDbDepositToDeposit(d: any): Deposit {
  const rawProof = d.proof_url || d.proof_photo_url;
  const proofPhotoUrl = rawProof ? getPublicDepositProofUrl(rawProof) : undefined;

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
    proofPhotoUrl,
    userNotes: d.notes || d.user_notes || undefined,
    adminNotes: d.admin_notes || undefined,
    reviewedAt: d.reviewed_at || undefined,
    reviewedBy: d.reviewed_by || undefined,
    notes: d.notes || undefined,
  };
}

export async function getDepositsByUserId(userId: string): Promise<Deposit[]> {
  const supabase = getServerSupabase();
  let query = supabase.from('deposits').select('*');
  if (!isNaN(Number(userId))) {
    query = query.or(`user_id.eq.${userId},user_id.eq.${Number(userId)}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error(`[Supabase Error] getDepositsByUserId(${userId}):`, error.message);
    throw new Error(`Failed to load deposits: ${error.message}`);
  }

  return (data || []).map(mapDbDepositToDeposit);
}

export async function getDepositById(id: string): Promise<Deposit | null> {
  const supabase = getServerSupabase();
  let query = supabase.from('deposits').select('*');
  if (!isNaN(Number(id))) {
    query = query.or(`id.eq.${id},id.eq.${Number(id)}`);
  } else {
    query = query.eq('id', id);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getDepositById(${id}):`, error.message);
    throw new Error(`Failed to load deposit: ${error.message}`);
  }

  if (!data) return null;
  return mapDbDepositToDeposit(data);
}

export async function getDepositByTxHash(txHash: string): Promise<Deposit | null> {
  if (!txHash || !txHash.trim()) return null;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .ilike('tx_hash', txHash.trim())
    .maybeSingle();

  if (error) {
    console.error(`[Supabase Error] getDepositByTxHash(${txHash}):`, error.message);
    throw new Error(`Failed to query deposit by txHash: ${error.message}`);
  }

  if (!data) return null;
  return mapDbDepositToDeposit(data);
}

export async function createDeposit(dep: Partial<Deposit>): Promise<Deposit> {
  const supabase = getServerSupabase();
  const userIdNum = await resolveUserIdForDb(dep.userId);
  const toAddress = dep.toAddress || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9';
  const txHash = dep.txHash ? dep.txHash.trim() : `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;

  const payload: any = {
    user_id: userIdNum,
    amount: dep.amount,
    currency: 'USDT',
    network: 'BEP-20',
    to_address: toAddress,
    tx_hash: txHash,
    status: dep.status || 'pending',
    confirmations: dep.confirmations || 1,
    required_confirmations: dep.requiredConfirmations || 12,
    lock_expires_at: dep.depositLockEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: dep.createdAt || new Date().toISOString(),
  };

  if (dep.confirmedAt) {
    payload.confirmed_at = dep.confirmedAt;
  }
  if (dep.eligibilityDate) {
    payload.eligibility_date = dep.eligibilityDate;
  }
  if (dep.proofPhotoUrl) {
    payload.proof_url = dep.proofPhotoUrl;
  }
  if (dep.userNotes) {
    payload.notes = dep.userNotes;
  }

  const { data, error } = await supabase
    .from('deposits')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Supabase Error] createDeposit:', error.message);
    if (error.message.includes('unique') || error.message.includes('duplicate') || error.code === '23505') {
      throw new Error('This blockchain transaction hash has already been registered in the system.');
    }
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
