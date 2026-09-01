import dotenv from 'dotenv';
dotenv.config();

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
 * - Server uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * - Session/JWT signing uses SESSION_SECRET (never hard-coded)
 * - Never exposes service-role keys or session secrets to client/browser code
 */
export const config = {
  // Supabase Configuration (Strictly server-side)
  supabaseUrl: getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL'),
  supabaseServiceRoleKey:
    getEnv('SUPABASE_SERVICE_ROLE_KEY') ||
    getEnv('SUPABASE_SERVICE_KEY') ||
    getEnv('SUPABASE_KEY'),

  // Authentication & Security
  sessionSecret: getEnv('SESSION_SECRET'),

  // Environment & Runtime
  nodeEnv: getEnv('NODE_ENV', 'development'),
  isProduction: getEnv('NODE_ENV') === 'production',
  enableLogging: getEnv('ENABLE_LOGGING') === 'true' || getEnv('ENABLE_DB_LOGGING') === 'true',
  enableDebugLogs: getEnv('ENABLE_DEBUG_LOGS') === 'true',

  // Methods to enforce required configuration with clear errors
  getRequiredSupabaseUrl(): string {
    return requireEnv('SUPABASE_URL');
  },
  getRequiredSupabaseServiceRoleKey(): string {
    return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  },
  getRequiredSessionSecret(): string {
    return requireEnv('SESSION_SECRET');
  },
};
