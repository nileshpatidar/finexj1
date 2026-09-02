-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 009: TEST USER BSC VERIFICATION BYPASS FLAG
-- Adds is_test_user boolean column to users table to support test user deposit bypass
-- ==============================================================================

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT FALSE;
