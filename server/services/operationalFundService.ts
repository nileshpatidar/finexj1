import { getServerSupabase } from '../supabase';
import { FinexjOperationalEntry, FinexjOperationalSummary } from '../types';
import { createAuditLog } from '../repositories/auditLogs';
import { logger } from '../logger';

export async function getOperationalFundSummaryAsync(): Promise<FinexjOperationalSummary> {
  const supabase = getServerSupabase();

  try {
    // 1. Fetch complete operational ledger rows for complete accounting aggregation
    const { data: allRows, error } = await supabase
      .from('finexj_operational_ledger')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !allRows) {
      return {
        currentBalance: 0,
        totalInflow: 0,
        totalOutflow: 0,
        totalFeeIncome: 0,
        recentEntries: [],
      };
    }

    const allEntries: FinexjOperationalEntry[] = allRows.map((row: any) => ({
      id: row.id,
      amount: Number(row.amount),
      direction: row.direction,
      reason: row.reason,
      adminId: row.admin_id,
      reference: row.reference,
      beforeBalance: Number(row.before_balance),
      afterBalance: Number(row.after_balance),
      createdAt: row.created_at,
    }));

    // Current balance is latest row after_balance
    const latest = allEntries[0];
    const currentBalance = latest ? latest.afterBalance : 0;

    let totalInflow = 0;
    let totalOutflow = 0;
    let totalFeeIncome = 0;

    for (const entry of allEntries) {
      if (entry.direction === 'inflow') {
        totalInflow += entry.amount;
        if (entry.reason.toLowerCase().includes('fee') || (entry.reference && entry.reference.startsWith('FEE-'))) {
          totalFeeIncome += entry.amount;
        }
      } else {
        totalOutflow += entry.amount;
      }
    }

    return {
      currentBalance: Number(currentBalance.toFixed(4)),
      totalInflow: Number(totalInflow.toFixed(4)),
      totalOutflow: Number(totalOutflow.toFixed(4)),
      totalFeeIncome: Number(totalFeeIncome.toFixed(4)),
      recentEntries: allEntries.slice(0, 100),
    };
  } catch (err: any) {
    logger.warn('OPERATIONAL_FUND_FETCH_ERROR', `Failed fetching operational fund summary: ${err?.message}`);
    return {
      currentBalance: 0,
      totalInflow: 0,
      totalOutflow: 0,
      totalFeeIncome: 0,
      recentEntries: [],
    };
  }
}

export interface AdjustOperationalFundParams {
  adminId: string;
  adminEmail?: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  reason: string;
  reference?: string;
}

export async function adjustOperationalFundAsync(params: AdjustOperationalFundParams): Promise<{
  success: boolean;
  entry?: FinexjOperationalEntry;
  error?: string;
}> {
  const { adminId, adminEmail, amount, direction, reason, reference } = params;

  if (!adminId) {
    return { success: false, error: 'Admin identifier is required.' };
  }

  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0 USDT.' };
  }

  if (direction !== 'inflow' && direction !== 'outflow') {
    return { success: false, error: 'Direction must be either inflow or outflow.' };
  }

  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'A specific explanation (at least 3 characters) is required.' };
  }

  const cleanRef = reference || `OP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const supabase = getServerSupabase();

  // 1. Try atomic stored procedure
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('adjust_finexj_operational_fund_atomic', {
      p_admin_id: adminId,
      p_amount: amount,
      p_direction: direction,
      p_reason: reason.trim(),
      p_reference: cleanRef,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success && rpcData.entry) {
        const raw = rpcData.entry;
        const entry: FinexjOperationalEntry = {
          id: raw.id,
          amount: Number(raw.amount),
          direction: raw.direction,
          reason: raw.reason,
          adminId: raw.admin_id,
          reference: raw.reference,
          beforeBalance: Number(raw.before_balance),
          afterBalance: Number(raw.after_balance),
          createdAt: raw.created_at,
        };
        return { success: true, entry };
      }
      if (rpcData.error) {
        return { success: false, error: rpcData.error };
      }
    }
  } catch (rpcErr: any) {
    logger.warn('OPERATIONAL_FUND_RPC_FALLBACK', `RPC call failed, using fallback: ${rpcErr?.message}`);
  }

  // 2. Direct transactional fallback
  try {
    const { data: latestRows } = await supabase
      .from('finexj_operational_ledger')
      .select('after_balance')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    const beforeBalance = latestRows && latestRows.length > 0 ? Number(latestRows[0].after_balance) || 0 : 0;
    const delta = direction === 'inflow' ? amount : -amount;
    const afterBalance = Math.max(0, beforeBalance + delta);

    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('finexj_operational_ledger')
      .insert({
        amount,
        direction,
        reason: reason.trim(),
        admin_id: adminId,
        reference: cleanRef,
        before_balance: beforeBalance,
        after_balance: afterBalance,
        created_at: now,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      return { success: false, error: insertError?.message || 'Failed to record operational adjustment.' };
    }

    await createAuditLog({
      action: 'OPERATIONAL_FUND_ADJUSTED',
      actorId: adminId,
      actorEmail: adminEmail || 'admin',
      actorRole: 'admin',
      reason: `Operational fund ${direction}: ${amount} USDT (${reason.trim()})`,
      beforeValue: { balance: beforeBalance },
      afterValue: { balance: afterBalance, delta, reference: cleanRef },
      referenceId: cleanRef,
    });

    const entry: FinexjOperationalEntry = {
      id: inserted.id,
      amount: Number(inserted.amount),
      direction: inserted.direction,
      reason: inserted.reason,
      adminId: inserted.admin_id,
      reference: inserted.reference,
      beforeBalance: Number(inserted.before_balance),
      afterBalance: Number(inserted.after_balance),
      createdAt: inserted.created_at,
    };

    return { success: true, entry };
  } catch (fallbackErr: any) {
    return { success: false, error: fallbackErr?.message || 'Failed to adjust operational fund.' };
  }
}
