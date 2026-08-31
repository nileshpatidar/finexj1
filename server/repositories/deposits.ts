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
    actualAmount: d.actual_amount !== undefined && d.actual_amount !== null ? Number(d.actual_amount) : Number(d.amount),
    currency: 'USDT',
    network: 'BEP-20',
    txHash: d.tx_hash,
    fromAddress: d.from_address || undefined,
    toAddress: d.to_address || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
    tokenContract: d.token_contract || undefined,
    blockNumber: d.block_number ? Number(d.block_number) : undefined,
    status: (d.status || 'pending') as DepositStatus,
    confirmations: Number(d.confirmations || 0),
    requiredConfirmations: Number(d.required_confirmations || 12),
    createdAt: d.created_at || new Date().toISOString(),
    confirmedAt: d.confirmed_at || undefined,
    verifiedAt: d.verified_at || undefined,
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
    return [];
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

  if (error || !data) {
    if (error) console.error(`[Supabase Error] getDepositById(${id}):`, error.message);
    return null;
  }
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

  if (error || !data) {
    if (error) console.error(`[Supabase Error] getDepositByTxHash(${txHash}):`, error.message);
    return null;
  }
  return mapDbDepositToDeposit(data);
}

export async function createDeposit(dep: Partial<Deposit>): Promise<Deposit> {
  const toAddress = dep.toAddress || '0x71C5A8c0B26D19543e49e29547d6e492211C54a9';
  const txHash = dep.txHash ? dep.txHash.trim() : '';

  if (!txHash) {
    throw new Error('A valid BNB Smart Chain transaction hash (TxID) is required to record a deposit.');
  }

  const supabase = getServerSupabase();
  const userIdNum = await resolveUserIdForDb(dep.userId);

  const payload: any = {
    user_id: userIdNum,
    amount: dep.amount,
    actual_amount: dep.actualAmount !== undefined ? dep.actualAmount : dep.amount,
    currency: 'USDT',
    network: 'BEP-20',
    to_address: toAddress,
    tx_hash: txHash,
    status: dep.status || 'pending',
    confirmations: dep.confirmations !== undefined ? dep.confirmations : 0,
    required_confirmations: dep.requiredConfirmations || 12,
    lock_expires_at: dep.depositLockEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: dep.createdAt || new Date().toISOString(),
  };

  if (dep.fromAddress) {
    payload.from_address = dep.fromAddress;
  }
  if (dep.tokenContract) {
    payload.token_contract = dep.tokenContract;
  }
  if (dep.blockNumber) {
    payload.block_number = dep.blockNumber;
  }
  if (dep.confirmedAt) {
    payload.confirmed_at = dep.confirmedAt;
  }
  if (dep.verifiedAt) {
    payload.verified_at = dep.verifiedAt;
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
  if (updates.verifiedAt !== undefined) payload.verified_at = updates.verifiedAt;
  if (updates.adminNotes !== undefined) payload.notes = updates.adminNotes;
  if (updates.txHash !== undefined) payload.tx_hash = updates.txHash;
  if (updates.amount !== undefined) payload.amount = updates.amount;
  if (updates.actualAmount !== undefined) payload.actual_amount = updates.actualAmount;
  if (updates.fromAddress !== undefined) payload.from_address = updates.fromAddress;
  if (updates.tokenContract !== undefined) payload.token_contract = updates.tokenContract;
  if (updates.blockNumber !== undefined) payload.block_number = updates.blockNumber;

  const { data, error } = await supabase
    .from('deposits')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Failed to update deposit: ${error?.message || 'Deposit not found'}`);
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
    return { deposits: [], total: 0 };
  }

  const deposits = (data || []).map(mapDbDepositToDeposit);
  return { deposits, total: count || deposits.length };
}

export interface ConfirmDepositAtomicInput {
  depositId: string | number;
  adminId: string;
  adminNotes?: string;
  txHash?: string;
  fromAddress?: string;
  blockNumber?: number;
  tokenContract?: string;
  confirmations?: number;
  actualAmount?: number;
}

export async function confirmDepositAtomic(input: ConfirmDepositAtomicInput): Promise<{
  success: boolean;
  deposit?: Deposit;
  isDuplicate?: boolean;
  error?: string;
}> {
  const numericDepId = Number(input.depositId);

  if (isNaN(numericDepId) || numericDepId <= 0) {
    return { success: false, error: `Invalid deposit identifier: ${input.depositId}` };
  }

  // 1. Attempt PostgreSQL stored procedure RPC
  try {
    const supabase = getServerSupabase();
    const { data: rpcData, error: rpcError } = await supabase.rpc('confirm_deposit_atomic', {
      p_deposit_id: numericDepId,
      p_admin_id: String(input.adminId),
      p_admin_notes: input.adminNotes || 'Confirmed BEP-20 USDT deposit on BNB Smart Chain',
      p_tx_hash: input.txHash || null,
      p_from_address: input.fromAddress || null,
      p_block_number: input.blockNumber || null,
      p_token_contract: input.tokenContract || null,
      p_confirmations: input.confirmations || null,
      p_actual_amount: input.actualAmount || null,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success && rpcData.deposit) {
        return {
          success: true,
          deposit: mapDbDepositToDeposit(rpcData.deposit),
        };
      }
      if (rpcData.is_duplicate) {
        return {
          success: false,
          isDuplicate: true,
          error: rpcData.error || 'This deposit has already been confirmed.',
        };
      }
      if (rpcData.error) {
        return {
          success: false,
          error: rpcData.error,
        };
      }
    }
  } catch (rpcErr: any) {
    console.warn('[Deposit Atomic RPC Notice]: RPC call fell back to direct transaction handler:', rpcErr?.message);
  }

  // 2. Direct transactional handler fallback
  const existing = await getDepositById(String(numericDepId));
  if (!existing) {
    return { success: false, error: `Deposit record #${numericDepId} not found in database.` };
  }

  if (existing.status === 'confirmed') {
    return { success: false, isDuplicate: true, error: 'This deposit has already been confirmed.' };
  }

  const now = new Date().toISOString();
  const confirmedDeposit = await updateDeposit(String(numericDepId), {
    status: 'confirmed',
    confirmedAt: now,
    verifiedAt: now,
    adminNotes: input.adminNotes || existing.adminNotes,
    txHash: input.txHash || existing.txHash,
    fromAddress: input.fromAddress || existing.fromAddress,
    blockNumber: input.blockNumber !== undefined ? input.blockNumber : existing.blockNumber,
    tokenContract: input.tokenContract || existing.tokenContract,
    confirmations: input.confirmations !== undefined ? input.confirmations : Math.max(existing.confirmations, 12),
    actualAmount: input.actualAmount !== undefined ? input.actualAmount : (existing.actualAmount || existing.amount),
    amount: input.actualAmount !== undefined ? input.actualAmount : existing.amount,
  });

  return {
    success: true,
    deposit: confirmedDeposit,
  };
}

