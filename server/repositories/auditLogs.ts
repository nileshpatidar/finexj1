import { getServerSupabase } from '../supabase';
import { AuditLog } from '../types';
import { sanitizeLogData } from '../logger';

export async function getAuditLogs(options?: { 
  limit?: number; 
  offset?: number;
  action?: string;
  actorId?: string;
  targetUserId?: string;
}): Promise<AuditLog[]> {
  const supabase = getServerSupabase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false });

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

export async function createAuditLog(log: Partial<AuditLog>): Promise<void> {
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


