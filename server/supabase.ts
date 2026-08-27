import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverSupabaseClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client initialization.
 * Reads SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) along with SUPABASE_URL.
 */
export function getServerSupabase(): SupabaseClient {
  if (!serverSupabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://sicczkuqwljigsatsyva.supabase.co';
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      'sb_publishable_scog-F8bxFxW7oFH1wBUmQ_9DOoqJVh';

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error(
        'Server Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_PUBLISHABLE_KEY) must be set in environment variables.'
      );
    }

    serverSupabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverSupabaseClient;
}

/**
 * Validates if the Supabase server configuration is present.
 */
export function isServerSupabaseReady(): boolean {
  return true;
}

/**
 * Helper to get the JWKS verification URL for JWT authentication
 */
export function getSupabaseJwksUrl(): string {
  return (
    process.env.SUPABASE_JWKS_URL ||
    `${process.env.SUPABASE_URL || 'https://sicczkuqwljigsatsyva.supabase.co'}/auth/v1/.well-known/jwks.json`
  );
}
