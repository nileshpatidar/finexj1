import { getServerSupabase } from '../supabase';
import { AuditLog } from '../types';

export async function getAuditLogs(options?: { limit?: number; offset?: number }): Promise<AuditLog[]> {
  const supabase = getServerSupabase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

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
    reason: l.details || l.reason,
    beforeValue: l.before_value,
    afterValue: l.after_value,
  }));
}

export async function createAuditLog(log: Partial<AuditLog>): Promise<void> {
  try {
    const supabase = getServerSupabase();
    await supabase.from('audit_logs').insert({
      action: log.action || 'SECURITY_EVENT',
      actor_email: log.actorEmail || 'system',
      details: log.reason || JSON.stringify(log.afterValue || {}),
      ip_address: log.ip || null,
      created_at: log.timestamp || new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[Supabase AuditLog Exception]:', err?.message);
  }
}

