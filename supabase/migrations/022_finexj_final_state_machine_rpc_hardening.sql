-- ==============================================================================
-- Migration 022: Final State Machine & Financial RPC Security Hardening
-- Step 44: Database & Financial State-Machine Deep Integrity Pass
--
-- Actions:
-- 1. Hardens search_path (SET search_path = public, pg_temp) on all financial RPCs
-- 2. Enforces SECURITY DEFINER on all critical privileged mutation functions
-- 3. Dynamically resolves function signatures from pg_proc to prevent 42883 signature errors
-- 4. Restricts execution privileges exclusively to service_role for privileged financial RPCs
-- ==============================================================================

DO $$
DECLARE
  r RECORD;
  v_func_names TEXT[] := ARRAY[
    'confirm_deposit_atomic',
    'credit_referral_reward_atomic',
    'process_withdrawal_status_atomic',
    'distribute_daily_performance_atomic',
    'adjust_user_balance_atomic',
    'adjust_finexj_operational_fund_atomic',
    'get_admin_accounting_summary',
    'get_referral_accounting_summary',
    'get_operational_fund_summary_aggregate',
    'get_admin_dashboard_stats_aggregate'
  ];
  v_name TEXT;
BEGIN
  -- 1-7. Harden and restrict privileged financial RPCs
  FOREACH v_name IN ARRAY v_func_names LOOP
    FOR r IN (
      SELECT p.oid::regprocedure AS func_signature 
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = v_name 
        AND n.nspname = 'public'
    ) LOOP
      EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, pg_temp', r.func_signature);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.func_signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.func_signature);
    END LOOP;
  END LOOP;

  -- 8. Harden get_user_referral_eligibility (Read-only query function)
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'get_user_referral_eligibility' 
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.func_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role, anon', r.func_signature);
  END LOOP;
END $$;

