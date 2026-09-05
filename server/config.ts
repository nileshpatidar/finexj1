import dotenv from 'dotenv';
dotenv.config();

function isPlaceholderOrInvalidKey(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (trimmed.length < 8) return true;
  const lower = trimmed.toLowerCase();
  if (
    trimmed === 'SUPABASE_SERVICE_ROLE_KEY' ||
    trimmed === 'SUPABASE_SECRET_KEY' ||
    trimmed === 'SUPABASE_KEY' ||
    trimmed === 'SUPABASE_SERVICE_KEY' ||
    trimmed === 'SUPABASE_URL' ||
    lower.includes('placeholder') ||
    lower.includes('your_') ||
    lower.includes('your-') ||
    (lower.startsWith('<') && lower.endsWith('>'))
  ) {
    return true;
  }
  return false;
}

function resolveFirstValid(keys: string[], defaultValue: string = ''): string {
  for (const key of keys) {
    const val = process.env[key];
    if (val !== undefined && val.trim() !== '' && !isPlaceholderOrInvalidKey(val)) {
      return val.trim();
    }
  }
  return defaultValue;
}

function getEnv(key: string, defaultValue: string = ''): string {
  const value = process.env[key];
  if (value !== undefined && value.trim() !== '') {
    return value.trim();
  }
  return defaultValue;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`${key} is not configured`);
  }
  return value.trim();
}

/**
 * Centralized Server Configuration Module
 * 
 * Strict Single-Source-of-Truth:
 * - Server uses SUPABASE_URL and SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY
 * - Session/JWT signing uses SESSION_SECRET (never hard-coded)
 * - Never exposes service-role keys or session secrets to client/browser code
 */
export const config = {
  // Supabase Configuration (Strictly server-side)
  supabaseUrl: resolveFirstValid(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
  supabaseServiceRoleKey: resolveFirstValid([
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_KEY',
  ]),

  // Authentication & Security
  sessionSecret: getEnv('SESSION_SECRET'),

  // Environment & Runtime
  nodeEnv: getEnv('NODE_ENV', 'development'),
  isProduction: getEnv('NODE_ENV') === 'production',
  enableLogging: getEnv('ENABLE_LOGGING') === 'true' || getEnv('ENABLE_DB_LOGGING') === 'true',
  enableDebugLogs: getEnv('ENABLE_DEBUG_LOGS') === 'true',

  // Methods to enforce required configuration with clear errors
  getRequiredSupabaseUrl(): string {
    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured');
    }
    return this.supabaseUrl;
  },
  getRequiredSupabaseServiceRoleKey(): string {
    if (!this.supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    return this.supabaseServiceRoleKey;
  },
  getRequiredSessionSecret(): string {
    return requireEnv('SESSION_SECRET');
  },
};
