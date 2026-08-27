import crypto from 'crypto';
import { getServerSupabase, isServerSupabaseReady } from './supabase';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface SystemLogEntry {
  id: string;
  level: LogLevel;
  event: string;
  errorCode?: string;
  message: string;
  requestId?: string;
  userId?: string;
  adminId?: string;
  route?: string;
  method?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

// In-memory ring buffer of recent logs for rapid querying by Admin UI
const MAX_MEMORY_LOGS = 2000;
const memoryLogs: SystemLogEntry[] = [];

// Sensitive field keys to automatically redact
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'passwordsalt',
  'salt',
  'secret',
  'token',
  'jwt',
  'authorization',
  'cookie',
  'apikey',
  'service_role',
  'supabase_key',
  'privatekey',
  'creditcard',
  'cvv',
]);

/**
 * Generate a standard correlation / request ID
 * Format: FINEXJ-YYYYMMDD-XXXXXX
 */
export function generateRequestId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `FINEXJ-${dateStr}-${randomStr}`;
}

/**
 * Recursively sanitize metadata object to prevent any passwords, secrets, or keys from leaking into logs
 */
export function sanitizeLogData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeLogData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeLogData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Structured Logger Engine
 */
class Logger {
  private isPersisting = false;
  private pendingQueue: SystemLogEntry[] = [];

  private log(
    level: LogLevel,
    event: string,
    message: string,
    options?: {
      errorCode?: string;
      requestId?: string;
      userId?: string;
      adminId?: string;
      route?: string;
      method?: string;
      durationMs?: number;
      metadata?: Record<string, any>;
    }
  ) {
    const entry: SystemLogEntry = {
      id: 'log_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      level,
      event,
      errorCode: options?.errorCode,
      message,
      requestId: options?.requestId,
      userId: options?.userId,
      adminId: options?.adminId,
      route: options?.route,
      method: options?.method,
      durationMs: options?.durationMs,
      metadata: options?.metadata ? sanitizeLogData(options.metadata) : undefined,
      createdAt: new Date().toISOString(),
    };

    // 1. Maintain in-memory ring buffer
    memoryLogs.unshift(entry);
    if (memoryLogs.length > MAX_MEMORY_LOGS) {
      memoryLogs.pop();
    }

    // 2. Structured console output in JSON format
    const consoleOutput = JSON.stringify({
      timestamp: entry.createdAt,
      level: entry.level,
      event: entry.event,
      requestId: entry.requestId,
      errorCode: entry.errorCode,
      message: entry.message,
      userId: entry.userId,
      adminId: entry.adminId,
      route: entry.route,
      method: entry.method,
      durationMs: entry.durationMs,
      metadata: entry.metadata,
    });

    if (level === 'ERROR') {
      console.error(consoleOutput);
    } else if (level === 'WARN') {
      console.warn(consoleOutput);
    } else {
      console.log(consoleOutput);
    }

    // 3. Persist WARN, ERROR, and critical system events to Supabase system_logs
    // (Notice: Normal GET /api/user requests are NOT persisted to DB to preserve efficiency)
    if (level === 'WARN' || level === 'ERROR' || event.startsWith('SECURITY_') || event.startsWith('SYSTEM_')) {
      this.enqueueForSupabase(entry);
    }
  }

  public debug(event: string, message: string, options?: Parameters<Logger['log']>[3]) {
    // Only in non-production or explicitly enabled
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_LOGS === 'true') {
      this.log('DEBUG', event, message, options);
    }
  }

  public info(event: string, message: string, options?: Parameters<Logger['log']>[3]) {
    this.log('INFO', event, message, options);
  }

  public warn(event: string, message: string, options?: Parameters<Logger['log']>[3]) {
    this.log('WARN', event, message, options);
  }

  public error(event: string, message: string, options?: Parameters<Logger['log']>[3]) {
    this.log('ERROR', event, message, options);
  }

  private enqueueForSupabase(entry: SystemLogEntry) {
    this.pendingQueue.push(entry);
    this.flushQueue();
  }

  private async flushQueue() {
    if (this.isPersisting || this.pendingQueue.length === 0) return;
    if (!isServerSupabaseReady()) return;

    this.isPersisting = true;
    const batch = this.pendingQueue.splice(0, 10);

    try {
      const supabase = getServerSupabase();
      const rows = batch.map(b => ({
        level: b.level,
        event: b.event,
        error_code: b.errorCode || null,
        message: b.message,
        request_id: b.requestId || null,
        user_id: b.userId ? parseInt(b.userId.replace(/\D/g, ''), 10) || null : null,
        admin_id: b.adminId || null,
        route: b.route || null,
        method: b.method || null,
        metadata: b.metadata ? JSON.stringify(b.metadata) : null,
        created_at: b.createdAt,
      }));

      const { error } = await supabase.from('system_logs').insert(rows);
      if (error) {
        // Logging failure must NOT break the application or re-throw
        console.warn('Non-blocking system_logs insert warning:', error.message);
      }
    } catch (err) {
      // Non-blocking graceful catch
    } finally {
      this.isPersisting = false;
      if (this.pendingQueue.length > 0) {
        setTimeout(() => this.flushQueue(), 1000);
      }
    }
  }

  public getRecentLogs(filters?: {
    level?: string;
    event?: string;
    errorCode?: string;
    requestId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): { logs: SystemLogEntry[]; total: number } {
    let filtered = [...memoryLogs];

    if (filters?.level && filters.level !== 'ALL') {
      filtered = filtered.filter(l => l.level === filters.level);
    }
    if (filters?.event) {
      const query = filters.event.toLowerCase();
      filtered = filtered.filter(l => l.event.toLowerCase().includes(query));
    }
    if (filters?.errorCode) {
      const query = filters.errorCode.toLowerCase();
      filtered = filtered.filter(l => l.errorCode && l.errorCode.toLowerCase().includes(query));
    }
    if (filters?.requestId) {
      const query = filters.requestId.toLowerCase();
      filtered = filtered.filter(l => l.requestId && l.requestId.toLowerCase().includes(query));
    }
    if (filters?.userId) {
      const query = filters.userId.toLowerCase();
      filtered = filtered.filter(l => l.userId && l.userId.toLowerCase().includes(query));
    }
    if (filters?.startDate) {
      const startTime = new Date(filters.startDate).getTime();
      filtered = filtered.filter(l => new Date(l.createdAt).getTime() >= startTime);
    }
    if (filters?.endDate) {
      const endTime = new Date(filters.endDate).getTime();
      filtered = filtered.filter(l => new Date(l.createdAt).getTime() <= endTime);
    }

    const total = filtered.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return { logs: paginated, total };
  }

  public getLogStats(): {
    totalLogs: number;
    errorsToday: number;
    warningsToday: number;
    infoToday: number;
  } {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    let errorsToday = 0;
    let warningsToday = 0;
    let infoToday = 0;

    for (const log of memoryLogs) {
      const logTime = new Date(log.createdAt).getTime();
      if (logTime >= todayTimestamp) {
        if (log.level === 'ERROR') errorsToday++;
        else if (log.level === 'WARN') warningsToday++;
        else if (log.level === 'INFO') infoToday++;
      }
    }

    return {
      totalLogs: memoryLogs.length,
      errorsToday,
      warningsToday,
      infoToday,
    };
  }
}

export const logger = new Logger();
