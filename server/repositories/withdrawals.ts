import { getServerSupabase } from '../supabase';
import { Withdrawal, WithdrawalStatus } from '../types';
import { db } from '../db';
import { resolveUserIdForDb } from './profiles';

export function mapDbWithdrawalToWithdrawal(w: any): Withdrawal {
  let netAmt = w.net_amount !== undefined && w.net_amount !== null
    ? Number(w.net_amount)
    : (w.netAmount !== undefined && w.netAmount !== null ? Number(w.netAmount) : 0);

  let feeAmt = w.fee_amount !== undefined && w.fee_amount !== null
    ? Number(w.fee_amount)
    : (w.feeAmount !== undefined && w.feeAmount !== null ? Number(w.feeAmount) : 0);

  let reqAmount = Number(w.requested_amount || w.amount || w.requestedAmount || 0);

  // If reqAmount is 0/missing but net & fee are present, accurately calculate requested amount
  if (reqAmount <= 0 && (netAmt > 0 || feeAmt > 0)) {
    reqAmount = Number((netAmt + feeAmt).toFixed(4));
  } else if (reqAmount > 0 && netAmt <= 0 && feeAmt <= 0) {
    // If only reqAmount is provided, calculate default 9% fee and net
    const defaultFeePct = w.fee_percentage !== undefined && w.fee_percentage !== null ? Number(w.fee_percentage) : 9;
    feeAmt = Number((reqAmount * (defaultFeePct / 100)).toFixed(4));
    netAmt = Number((reqAmount - feeAmt).toFixed(4));
  } else if (reqAmount > 0 && netAmt > 0 && feeAmt <= 0) {
    feeAmt = Math.max(0, Number((reqAmount - netAmt).toFixed(4)));
  } else if (reqAmount > 0 && feeAmt > 0 && netAmt <= 0) {
    netAmt = Math.max(0, Number((reqAmount - feeAmt).toFixed(4)));
  }

  // Calculate dynamic fee percentage accurately
  let feePct = 9;
  if (w.fee_percentage !== undefined && w.fee_percentage !== null && Number(w.fee_percentage) > 0) {
    feePct = Number(w.fee_percentage);
  } else if (reqAmount > 0 && feeAmt > 0) {
    feePct = Math.round(((feeAmt / reqAmount) * 100) * 100) / 100;
  }

  // Map database status 'completed' -> 'paid' for applet compatibility
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
        fee_percentage: feePct,
        fee_amount: feeAmount,
        net_amount: netAmount,
        currency: 'USDT',
        network: 'BEP-20',
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

export function toUuidIfPossible(idStr: string): string | null {
  const clean = idStr.replace(/^wd_/i, '').replace(/[^a-f0-9]/gi, '');
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
  }
  return null;
}

export async function updateWithdrawal(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal> {
  // Always update in-memory record first to guarantee immediate consistency
  db.updateWithdrawal(id, updates);
  const inMem = db.getWithdrawals().find(w => w.id === id || w.reference === id || (w as any).idempotencyKey === id);

  try {
    const supabase = getServerSupabase();
    
    // Normalize status: PostgreSQL constraint requires 'completed' for paid payouts
    const rawStatus = (updates.status || inMem?.status || 'paid') as string;
    const dbStatus = (rawStatus === 'paid' || rawStatus === 'completed') ? 'completed' : rawStatus;
    
    const nowIso = new Date().toISOString();
    const finalTxHash = updates.txHash || inMem?.txHash || null;
    const finalAdminNotes = updates.adminNotes || inMem?.adminNotes || null;
    const finalReviewedBy = updates.reviewedBy || inMem?.reviewedBy || null;
    const finalReviewedAt = updates.reviewedAt || inMem?.reviewedAt || nowIso;

    // Primary payload strictly matching Supabase PostgreSQL withdrawals table
    const primaryPayload: any = {
      status: dbStatus,
      payout_tx_hash: finalTxHash,
      admin_notes: finalAdminNotes,
      reviewed_by: finalReviewedBy,
      reviewed_at: finalReviewedAt,
      updated_at: nowIso,
    };

    if (inMem) {
      if (inMem.requestedAmount) {
        primaryPayload.amount = inMem.requestedAmount;
        primaryPayload.requested_amount = inMem.requestedAmount;
      }
      if (inMem.feePercentage) primaryPayload.fee_percentage = inMem.feePercentage;
      if (inMem.feeAmount) primaryPayload.fee_amount = inMem.feeAmount;
      if (inMem.netAmount) primaryPayload.net_amount = inMem.netAmount;
      if (inMem.destinationAddress) primaryPayload.destination_address = inMem.destinationAddress;
    }

    // List of candidate ID representations to try against Supabase
    const candidateIds: (string | number)[] = [id];
    const strippedId = id.replace(/^wd_/i, '').replace(/^wdr[-_]/i, '').replace(/^wd[-_]/i, '');
    if (strippedId !== id) candidateIds.push(strippedId);

    const uuidVariant = toUuidIfPossible(id);
    if (uuidVariant && !candidateIds.includes(uuidVariant)) candidateIds.push(uuidVariant);

    if (inMem) {
      if (inMem.id && !candidateIds.includes(inMem.id)) candidateIds.push(inMem.id);
      const memUuid = toUuidIfPossible(inMem.id);
      if (memUuid && !candidateIds.includes(memUuid)) candidateIds.push(memUuid);
      if (inMem.reference && !candidateIds.includes(inMem.reference)) candidateIds.push(inMem.reference);
    }

    if (!isNaN(Number(strippedId))) {
      candidateIds.push(Number(strippedId));
    }

    let updatedRow: any = null;

    // Helper to execute update with progressive column fallback
    async function executeUpdateOnQuery(queryBuilder: (payload: any) => any): Promise<any> {
      // 1. Try with full payload
      let res = await queryBuilder(primaryPayload).select().maybeSingle();
      if (!res.error && res.data) return res.data;

      // 2. Try with core payload (without reviewed_by if missing)
      const corePayload: any = {
        status: dbStatus,
        payout_tx_hash: finalTxHash,
        admin_notes: finalAdminNotes,
      };
      if (inMem?.requestedAmount) corePayload.amount = inMem.requestedAmount;
      if (inMem?.feePercentage) corePayload.fee_percentage = inMem.feePercentage;
      if (inMem?.feeAmount) corePayload.fee_amount = inMem.feeAmount;
      if (inMem?.netAmount) corePayload.net_amount = inMem.netAmount;

      res = await queryBuilder(corePayload).select().maybeSingle();
      if (!res.error && res.data) return res.data;

      // 3. Try with minimal status-only payload
      res = await queryBuilder({ status: dbStatus }).select().maybeSingle();
      if (!res.error && res.data) return res.data;

      return null;
    }

    // Try matching candidate IDs
    for (const candId of candidateIds) {
      try {
        const row = await executeUpdateOnQuery((p) => supabase.from('withdrawals').update(p).eq('id', candId));
        if (row) {
          updatedRow = row;
          break;
        }
      } catch (_) {}
    }

    // If not matched by candidate IDs, try matching by user_id & destination_address
    if (!updatedRow && inMem) {
      const resolvedUserId = await resolveUserIdForDb(inMem.userId);
      try {
        const { data: matchedRows } = await supabase
          .from('withdrawals')
          .select('id')
          .eq('destination_address', inMem.destinationAddress)
          .eq('user_id', resolvedUserId);

        if (matchedRows && matchedRows.length > 0) {
          const targetDbId = matchedRows[matchedRows.length - 1].id;
          updatedRow = await executeUpdateOnQuery((p) => supabase.from('withdrawals').update(p).eq('id', targetDbId));
        }
      } catch (matchErr: any) {
        console.warn('[Withdrawal Target Resolution]', matchErr?.message);
      }
    }

    // If still not in Supabase, insert it directly with the updated status
    if (!updatedRow && inMem) {
      const resolvedUserId = await resolveUserIdForDb(inMem.userId);
      const newPayload: any = {
        user_id: resolvedUserId,
        amount: inMem.requestedAmount,
        requested_amount: inMem.requestedAmount,
        fee_percentage: inMem.feePercentage || 9,
        fee_amount: inMem.feeAmount,
        net_amount: inMem.netAmount,
        currency: 'USDT',
        network: 'BEP-20',
        destination_address: inMem.destinationAddress,
        status: dbStatus,
        payout_tx_hash: finalTxHash,
        admin_notes: finalAdminNotes,
        reviewed_by: finalReviewedBy,
        reviewed_at: finalReviewedAt,
        created_at: inMem.createdAt || nowIso,
      };

      const { data, error: insertErr } = await supabase.from('withdrawals').insert(newPayload).select().maybeSingle();
      if (!insertErr && data) {
        updatedRow = data;
      }
    }

    if (updatedRow) {
      const mapped = mapDbWithdrawalToWithdrawal(updatedRow);
      db.updateWithdrawal(id, mapped);
      console.log(`[Supabase updateWithdrawal Success] Updated withdrawal in PostgreSQL (${id}) to status: ${dbStatus}`);
      return mapped;
    }
  } catch (err: any) {
    console.warn(`[Supabase updateWithdrawal Error]:`, err?.message);
  }

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
    status: (updates.status || 'paid') as WithdrawalStatus,
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
    const limit = options?.limit || 500;
    const offset = (page - 1) * limit;

    let query = supabase.from('withdrawals').select('*', { count: 'exact' });

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!error && data) {
      const dbWithdrawals = data.map(mapDbWithdrawalToWithdrawal);
      const memWithdrawals = db.getWithdrawals();
      const combined = [...dbWithdrawals];

      for (const m of memWithdrawals) {
        const existingIdx = combined.findIndex(c => c.id === m.id || c.reference === m.reference);
        if (existingIdx === -1) {
          combined.push(m);
        } else {
          // If status in memory is newer (e.g. paid/rejected), reflect that
          if (m.status !== 'pending' && combined[existingIdx].status === 'pending') {
            combined[existingIdx] = { ...combined[existingIdx], ...m };
          }
        }
      }
      return { withdrawals: combined, total: count ? Math.max(count, combined.length) : combined.length };
    }
  } catch (err: any) {
    console.warn('[Supabase Warn] getAllWithdrawals:', err?.message);
  }

  const memWithdrawals = db.getWithdrawals();
  return { withdrawals: memWithdrawals, total: memWithdrawals.length };
}
