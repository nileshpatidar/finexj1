import { getServerSupabase, isServerSupabaseReady } from '../supabase';
import { AuditLog } from '../types';
import { sanitizeLogData } from '../logger';

export const MEANINGFUL_FINANCIAL_ACTIONS = [
  'DEPOSIT_APPROVED',
  'DEPOSIT_REJECTED',
  'DEPOSIT_CONFIRMED',
  'DEPOSIT_AUTO_CONFIRMED',
  'WITHDRAWAL_APPROVED',
  'WITHDRAWAL_REJECTED',
  'WITHDRAWAL_PAID',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWAL_PROCESSING',
  'WITHDRAWAL_CANCELLED',
  'DAILY_PERFORMANCE_DISTRIBUTED',
  'PERFORMANCE_APPLIED',
  'EARNINGS_DISTRIBUTED',
  'ADMIN_BALANCE_ADJUSTMENT',
  'DATABASE_CLEANUP_COMPLETED',
];

export async function getAuditLogs(options?: { 
  limit?: number; 
  offset?: number;
  action?: string;
  actorId?: string;
  targetUserId?: string;
  financialOnly?: boolean;
}): Promise<AuditLog[]> {
  if (!isServerSupabaseReady()) return [];

  const supabase = getServerSupabase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.financialOnly) {
    query = query.in('action', MEANINGFUL_FINANCIAL_ACTIONS);
  }

  if (options?.action) {
    query = query.ilike('action', `%${options.action}%`);
  }
  if (options?.actorId) {
    query = query.eq('actor_id', options.actorId);
  }
  if (options?.targetUserId) {
    query = query.eq('target_user_id', options.targetUserId);
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.warn('[Supabase Warn] getAuditLogs:', error.message);
    return [];
  }

  return (data || []).map((l: any) => ({
    id: String(l.id),
    action: l.action,
    actorId: String(l.actor_id || '0'),
    actorEmail: l.actor_email || 'system',
    actorRole: l.actor_role || 'admin',
    targetUserId: l.target_user_id ? String(l.target_user_id) : undefined,
    timestamp: l.created_at || new Date().toISOString(),
    ip: l.ip_address || undefined,
    reason: l.reason || l.details,
    beforeValue: l.before_value,
    afterValue: l.after_value,
    referenceId: l.reference_id || undefined,
  }));
}

export async function getAuditLogsCount(): Promise<number> {
  if (!isServerSupabaseReady()) return 0;

  try {
    const supabase = getServerSupabase();
    const { count, error } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true });

    if (error || count === null) {
      return 0;
    }

    return count;
  } catch (err: any) {
    return 0;
  }
}

export async function createAuditLog(log: Partial<AuditLog>): Promise<void> {
  if (!isServerSupabaseReady()) return;

  try {
    const supabase = getServerSupabase();
    const sanitizedBefore = log.beforeValue ? sanitizeLogData(log.beforeValue) : null;
    const sanitizedAfter = log.afterValue ? sanitizeLogData(log.afterValue) : null;

    const payload: any = {
      action: log.action || 'SECURITY_EVENT',
      actor_id: log.actorId ? String(log.actorId) : '0',
      actor_email: log.actorEmail || 'system',
      actor_role: log.actorRole || 'admin',
      target_user_id: log.targetUserId ? String(log.targetUserId) : null,
      reason: log.reason || null,
      details: log.reason || (sanitizedAfter ? JSON.stringify(sanitizedAfter) : null),
      before_value: sanitizedBefore,
      after_value: sanitizedAfter,
      ip_address: log.ip || null,
      reference_id: log.referenceId || null,
      created_at: log.timestamp || new Date().toISOString(),
    };

    const { error } = await supabase.from('audit_logs').insert(payload);
    if (error && error.message.includes('column')) {
      // Gracefully fallback to minimal schema if columns were not added
      await supabase.from('audit_logs').insert({
        action: payload.action,
        actor_email: payload.actor_email,
        details: payload.details,
        ip_address: payload.ip_address,
        created_at: payload.created_at,
      });
    }
  } catch (err: any) {
    console.warn('[Supabase AuditLog Exception]:', err?.message);
  }
}


