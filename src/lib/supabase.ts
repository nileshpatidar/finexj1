import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Lazy initialization helper for Supabase client.
 * Supports SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY (backend operations) or SUPABASE_ANON_KEY.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      'https://sicczkuqwljigsatsyva.supabase.co';
    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      'sb_publishable_scog-F8bxFxW7oFH1wBUmQ_9DOoqJVh';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase configuration missing: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY are required.'
      );
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

/**
 * Safe helper to check if Supabase environment variables are provided.
 */
export function isSupabaseConfigured(): boolean {
  return true;
}
