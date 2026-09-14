-- ==============================================================================
-- Migration 022: Final State Machine & Financial RPC Security Hardening
-- Step 44: Database & Financial State-Machine Deep Integrity Pass
--
-- Actions:
-- 1. Hardens search_path (SET search_path = public, pg_temp) on all financial RPCs
-- 2. Enforces SECURITY DEFINER on all critical privileged mutation functions
-- 3. Fixes argument signature mismatch in REVOKE/GRANT for adjust_user_balance_atomic
--    and adjust_finexj_operational_fund_atomic from migration 021
-- 4. Restricts execution privileges exclusively to service_role for privileged financial RPCs
-- ==============================================================================

-- 1. Harden confirm_deposit_atomic
ALTER FUNCTION confirm_deposit_atomic(
  INTEGER, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, NUMERIC
) SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION confirm_deposit_atomic(
  INTEGER, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, NUMERIC
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION confirm_deposit_atomic(
  INTEGER, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, NUMERIC
) TO service_role;

-- 2. Harden credit_referral_reward_atomic
ALTER FUNCTION credit_referral_reward_atomic(
  INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER, TEXT
) SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION credit_referral_reward_atomic(
  INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION credit_referral_reward_atomic(
  INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER, TEXT
) TO service_role;

-- 3. Harden process_withdrawal_status_atomic
ALTER FUNCTION process_withdrawal_status_atomic(
  TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT
) SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION process_withdrawal_status_atomic(
  TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION process_withdrawal_status_atomic(
  TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT
) TO service_role;

-- 4. Harden distribute_daily_performance_atomic
ALTER FUNCTION distribute_daily_performance_atomic(
  TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN
) SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION distribute_daily_performance_atomic(
  TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION distribute_daily_performance_atomic(
  TEXT, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN
) TO service_role;

-- 5. Harden adjust_user_balance_atomic (Correcting 8-parameter signature)
ALTER FUNCTION adjust_user_balance_atomic(
  TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT
) SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION adjust_user_balance_atomic(
  TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION adjust_user_balance_atomic(
  TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT
) TO service_role;

-- 6. Harden adjust_finexj_operational_fund_atomic (Correcting 5-parameter signature with TEXT first)
ALTER FUNCTION adjust_finexj_operational_fund_atomic(
  TEXT, NUMERIC, TEXT, TEXT, TEXT
) SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION adjust_finexj_operational_fund_atomic(
  TEXT, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION adjust_finexj_operational_fund_atomic(
  TEXT, NUMERIC, TEXT, TEXT, TEXT
) TO service_role;

-- 7. Harden get_admin_accounting_summary & get_referral_accounting_summary
ALTER FUNCTION get_admin_accounting_summary(TEXT, TEXT) SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION get_referral_accounting_summary(TEXT, TEXT) SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION get_operational_fund_summary_aggregate() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION get_admin_dashboard_stats_aggregate() SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION get_admin_accounting_summary(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_accounting_summary(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION get_referral_accounting_summary(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_referral_accounting_summary(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION get_operational_fund_summary_aggregate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_operational_fund_summary_aggregate() TO service_role;

REVOKE EXECUTE ON FUNCTION get_admin_dashboard_stats_aggregate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats_aggregate() TO service_role;

-- 8. Harden get_user_referral_eligibility
ALTER FUNCTION get_user_referral_eligibility(INTEGER) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION get_user_referral_eligibility(INTEGER) TO authenticated, service_role;
