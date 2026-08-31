import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let serverSupabaseClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client initialization.
 * Reads strictly SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Never exposes secrets to client.
 */
export function getServerSupabase(): SupabaseClient {
  if (!serverSupabaseClient) {
    const supabaseUrl = config.supabaseUrl;
    const supabaseServiceRoleKey = config.supabaseServiceRoleKey;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured');
    }

    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }

    serverSupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverSupabaseClient;
}

export function isServerSupabaseReady(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

