import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverSupabaseClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client initialization.
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.
 * Never exposes secrets to client.
 */
export function getServerSupabase(): SupabaseClient {
  if (!serverSupabaseClient) {
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase configuration missing. SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_ANON_KEY) must be provided in environment variables.'
      );
    }

    serverSupabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverSupabaseClient;
}

export function isServerSupabaseReady(): boolean {
  try {
    const client = getServerSupabase();
    return Boolean(client);
  } catch {
    return false;
  }
}
