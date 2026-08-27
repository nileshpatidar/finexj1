import { getServerSupabase } from '../supabase';

export interface SystemLogItem {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event: string;
  errorCode?: string;
  message: string;
  requestId: string;
  userId?: string;
  adminId?: string;
  route?: string;
  method?: string;
  metadata?: any;
  timestamp: string;
}

export async function getSystemLogs(params?: {
  level?: string;
  event?: string;
  errorCode?: string;
  requestId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: SystemLogItem[]; totalCount: number }> {
  const supabase = getServerSupabase();
  const limit = params?.limit || 50;
  const offset = params?.offset || 0;

  let query = supabase.from('system_logs').select('*', { count: 'exact' });

  if (params?.level && params.level !== 'ALL') {
    query = query.eq('level', params.level);
  }
  if (params?.event) {
    query = query.ilike('event', `%${params.event}%`);
  }
  if (params?.errorCode) {
    query = query.eq('error_code', params.errorCode);
  }
  if (params?.requestId) {
    query = query.eq('request_id', params.requestId);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.warn('[Supabase Warn] getSystemLogs:', error.message);
    return { logs: [], totalCount: 0 };
  }

  const logs: SystemLogItem[] = (data || []).map((l: any) => ({
    id: String(l.id),
    level: l.level || 'INFO',
    event: l.event || 'GENERAL',
    errorCode: l.error_code || undefined,
    message: l.message || '',
    requestId: l.request_id || 'UNKNOWN',
    userId: l.user_id ? String(l.user_id) : undefined,
    adminId: l.admin_id ? String(l.admin_id) : undefined,
    route: l.route || undefined,
    method: l.method || undefined,
    metadata: l.metadata || undefined,
    timestamp: l.created_at || new Date().toISOString(),
  }));

  return { logs, totalCount: count || logs.length };
}

export async function createSystemLog(log: Partial<SystemLogItem>): Promise<void> {
  try {
    const supabase = getServerSupabase();
    await supabase.from('system_logs').insert({
      level: log.level || 'INFO',
      event: log.event || 'LOG',
      error_code: log.errorCode || null,
      message: log.message || '',
      request_id: log.requestId || 'SERVER',
      user_id: log.userId || null,
      admin_id: log.adminId || null,
      route: log.route || null,
      method: log.method || null,
      metadata: log.metadata || null,
      created_at: log.timestamp || new Date().toISOString(),
    });
  } catch (err: any) {
    // Non-blocking log insert
  }
}
