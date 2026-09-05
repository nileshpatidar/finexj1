import { getServerSupabase } from '../supabase';
import { FinexjOperationalEntry, FinexjOperationalSummary } from '../types';
import { createAuditLog } from '../repositories/auditLogs';
import { logger } from '../logger';
import { DecimalSafe } from '../utils/decimalSafe';

export async function getOperationalFundSummaryAsync(): Promise<FinexjOperationalSummary> {
  const supabase = getServerSupabase();

  try {
    // 1. Attempt database-side aggregate RPC
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_operational_fund_summary_aggregate');
      if (!rpcError && rpcData) {
        // Fetch only recent entries for the display stream (max 100)
        const { data: recentRows } = await supabase
          .from('finexj_operational_ledger')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        const recentEntries: FinexjOperationalEntry[] = (recentRows || []).map((row: any) => ({
          id: row.id,
          amount: DecimalSafe.from(row.amount).toNumber(4),
          direction: row.direction,
          reason: row.reason,
          adminId: row.admin_id,
          reference: row.reference,
          beforeBalance: DecimalSafe.from(row.before_balance).toNumber(4),
          afterBalance: DecimalSafe.from(row.after_balance).toNumber(4),
          createdAt: row.created_at,
        }));

        return {
          currentBalance: DecimalSafe.from(rpcData.current_balance).toNumber(4),
          totalInflow: DecimalSafe.from(rpcData.total_inflow).toNumber(4),
          totalOutflow: DecimalSafe.from(rpcData.total_outflow).toNumber(4),
          totalFeeIncome: DecimalSafe.from(rpcData.total_fee_income).toNumber(4),
          recentEntries,
        };
      }
    } catch {
      // Fall through to repository aggregation
    }

    // 2. Database-level aggregation query fallback with DecimalSafe exact arithmetic
    const { data: allRows, error } = await supabase
      .from('finexj_operational_ledger')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !allRows || allRows.length === 0) {
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
      amount: DecimalSafe.from(row.amount).toNumber(4),
      direction: row.direction,
      reason: row.reason,
      adminId: row.admin_id,
      reference: row.reference,
      beforeBalance: DecimalSafe.from(row.before_balance).toNumber(4),
      afterBalance: DecimalSafe.from(row.after_balance).toNumber(4),
      createdAt: row.created_at,
    }));

    // Current balance is latest row after_balance
    const latest = allEntries[0];
    const currentBalance = latest ? latest.afterBalance : 0;

    let totalInflow = DecimalSafe.zero();
    let totalOutflow = DecimalSafe.zero();
    let totalFeeIncome = DecimalSafe.zero();

    for (const entry of allEntries) {
      const amt = DecimalSafe.from(entry.amount);
      if (entry.direction === 'inflow') {
        totalInflow = totalInflow.add(amt);
        if (entry.reason.toLowerCase().includes('fee') || (entry.reference && entry.reference.startsWith('FEE-'))) {
          totalFeeIncome = totalFeeIncome.add(amt);
        }
      } else {
        totalOutflow = totalOutflow.add(amt);
      }
    }

    return {
      currentBalance: DecimalSafe.from(currentBalance).toNumber(4),
      totalInflow: totalInflow.toNumber(4),
      totalOutflow: totalOutflow.toNumber(4),
      totalFeeIncome: totalFeeIncome.toNumber(4),
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
