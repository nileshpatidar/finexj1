-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 028: DETERMINISTIC DATABASE CLEANUP & CLEAN FINANCIAL ACTIVITY FEED
-- ==============================================================================
-- SAFETY PROTOCOL & INVARIANTS:
-- 1. PRESERVES ALL VALID DEPOSIT DATA:
--    - Deposit history, status, transaction hash (tx_hash), proof photos / URLs
--    - Users who own these deposits (NEVER deleted)
--    - Double-entry ledger entries linked to preserved deposits and active users
--    - Earnings / distributions linked to active deposit balances
--    - Withdrawals linked to legitimate balances
--    - Referral rewards and referral relationships generated from valid deposits
--    - Audit trail entries for valid deposits, withdrawals, and performance
-- 2. REVERSES DEPENDENCIES SAFELY:
--    - Handles PostgreSQL ON DELETE RESTRICT foreign keys in strict topological reverse order
--    - Safely bypasses immutability triggers (trg_immutable_ledger, trg_immutable_audit_logs)
--      only during authorized execution, then immediately re-enables them.
-- 3. REMOVES CONFIRMED TEST / DEMO / NOISE DATA:
--    - Test users without valid deposits
--    - Orphaned test ledger, test earnings, and test withdrawals
--    - Noise audit logs (failed logins, test probes, bot scans)
--    - Technical diagnostic noise in system_logs
-- 4. PROVIDES ATOMIC RPC: execute_database_cleanup_atomic(p_admin_id, p_dry_run)
-- ==============================================================================

-- 1. Create Atomic Database Cleanup Procedure
CREATE OR REPLACE FUNCTION execute_database_cleanup_atomic(
  p_admin_id TEXT DEFAULT 'system_migration',
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  
  -- Record counts for auditing & reporting
  v_preserved_deposits_count INT := 0;
  v_preserved_users_count INT := 0;
  v_preserved_ledger_count INT := 0;
  v_preserved_earnings_count INT := 0;
  v_preserved_withdrawals_count INT := 0;
  v_preserved_rewards_count INT := 0;
  
  v_deleted_test_users_count INT := 0;
  v_deleted_test_deposits_count INT := 0;
  v_deleted_test_withdrawals_count INT := 0;
  v_deleted_test_earnings_count INT := 0;
  v_deleted_test_ledger_count INT := 0;
  v_deleted_test_referrals_count INT := 0;
  v_deleted_test_rewards_count INT := 0;
  v_deleted_test_messages_count INT := 0;
  v_deleted_noise_audit_logs_count INT := 0;
  v_deleted_noise_system_logs_count INT := 0;

  v_report JSONB;
BEGIN
  -- ----------------------------------------------------------------------------
  -- STEP A: IDENTIFY PRESERVED RECORDS (CANNOT BE TOUCHED)
  -- ----------------------------------------------------------------------------
  
  -- Create temporary tables for execution
  CREATE TEMP TABLE IF NOT EXISTS _preserved_users (id INT PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _preserved_deposits (id INT PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _test_users (id INT PRIMARY KEY) ON COMMIT DROP;
  
  TRUNCATE TABLE _preserved_users;
  TRUNCATE TABLE _preserved_deposits;
  TRUNCATE TABLE _test_users;

  -- 1. Identify valid deposits to preserve:
  -- Any deposit with confirmed/pending status and real transaction parameters
  INSERT INTO _preserved_deposits (id)
  SELECT id FROM deposits
  WHERE status IN ('confirmed', 'pending', 'confirming')
     OR (tx_hash IS NOT NULL AND tx_hash NOT ILIKE '0xtest%' AND tx_hash NOT ILIKE 'test_%');

  -- 2. Identify users to preserve:
  -- All users who own preserved deposits, plus administrative / super_admin accounts
  INSERT INTO _preserved_users (id)
  SELECT DISTINCT user_id FROM deposits WHERE id IN (SELECT id FROM _preserved_deposits)
  UNION
  SELECT id FROM users WHERE role IN ('super_admin', 'finance_admin') OR LOWER(email) = 'admin@finexj.com';

  -- 3. Identify confirmed test/noise users to delete:
  -- Must NOT be in preserved users, and must have test user flag or test email
  INSERT INTO _test_users (id)
  SELECT id FROM users
  WHERE id NOT IN (SELECT id FROM _preserved_users)
    AND (
      is_test_user = TRUE
      OR LOWER(email) LIKE '%test%'
      OR LOWER(email) LIKE '%demo%'
      OR LOWER(email) LIKE '%example.com%'
      OR LOWER(email) LIKE '%cypress%'
      OR LOWER(full_name) LIKE '%test user%'
      OR LOWER(full_name) LIKE '%cypress%'
    );

  -- Count preserved records
  SELECT COUNT(*) INTO v_preserved_deposits_count FROM _preserved_deposits;
  SELECT COUNT(*) INTO v_preserved_users_count FROM _preserved_users;
  SELECT COUNT(*) INTO v_preserved_ledger_count FROM ledger WHERE user_id IN (SELECT id FROM _preserved_users);
  SELECT COUNT(*) INTO v_preserved_earnings_count FROM earnings WHERE user_id IN (SELECT id FROM _preserved_users);
  SELECT COUNT(*) INTO v_preserved_withdrawals_count FROM withdrawals WHERE user_id IN (SELECT id FROM _preserved_users);
  SELECT COUNT(*) INTO v_preserved_rewards_count FROM referral_rewards WHERE referrer_id IN (SELECT id FROM _preserved_users);

  -- Count records eligible for deletion
  SELECT COUNT(*) INTO v_deleted_test_users_count FROM _test_users;
  SELECT COUNT(*) INTO v_deleted_test_deposits_count FROM deposits WHERE user_id IN (SELECT id FROM _test_users);
  SELECT COUNT(*) INTO v_deleted_test_withdrawals_count FROM withdrawals WHERE user_id IN (SELECT id FROM _test_users);
  SELECT COUNT(*) INTO v_deleted_test_earnings_count FROM earnings WHERE user_id IN (SELECT id FROM _test_users);
  SELECT COUNT(*) INTO v_deleted_test_ledger_count FROM ledger WHERE user_id IN (SELECT id FROM _test_users);
  SELECT COUNT(*) INTO v_deleted_test_referrals_count FROM referrals WHERE referrer_id IN (SELECT id FROM _test_users) OR referred_id IN (SELECT id FROM _test_users);
  SELECT COUNT(*) INTO v_deleted_test_rewards_count FROM referral_rewards WHERE referrer_id IN (SELECT id FROM _test_users) OR referred_id IN (SELECT id FROM _test_users);
  SELECT COUNT(*) INTO v_deleted_test_messages_count FROM admin_messages WHERE user_id IN (SELECT id FROM _test_users);
  
  -- Count noise logs eligible for cleanup
  SELECT COUNT(*) INTO v_deleted_noise_audit_logs_count FROM audit_logs
  WHERE target_user_id IN (SELECT id::TEXT FROM _test_users)
     OR (
       action NOT IN (
         'DEPOSIT_APPROVED', 'DEPOSIT_REJECTED', 'DEPOSIT_CONFIRMED', 'DEPOSIT_AUTO_CONFIRMED',
         'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_CANCELLED',
         'DAILY_PERFORMANCE_DISTRIBUTED', 'PERFORMANCE_APPLIED', 'EARNINGS_DISTRIBUTED',
         'ADMIN_BALANCE_ADJUSTMENT', 'DATABASE_CLEANUP_COMPLETED'
       )
       AND created_at < v_now - INTERVAL '7 days'
     );

  SELECT COUNT(*) INTO v_deleted_noise_system_logs_count FROM system_logs
  WHERE event ILIKE '%test%' OR level = 'DEBUG' OR created_at < v_now - INTERVAL '14 days';

  -- ----------------------------------------------------------------------------
  -- STEP B: IF DRY RUN, RETURN CALCULATED PLAN WITHOUT PERFORMING MUTATIONS
  -- ----------------------------------------------------------------------------
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'timestamp', v_now,
      'preserved_summary', jsonb_build_object(
        'valid_deposits', v_preserved_deposits_count,
        'investor_users', v_preserved_users_count,
        'ledger_entries', v_preserved_ledger_count,
        'earnings_distributions', v_preserved_earnings_count,
        'withdrawals', v_preserved_withdrawals_count,
        'referral_rewards', v_preserved_rewards_count
      ),
      'deletion_plan', jsonb_build_object(
        'test_users', v_deleted_test_users_count,
        'test_deposits', v_deleted_test_deposits_count,
        'test_withdrawals', v_deleted_test_withdrawals_count,
        'test_earnings', v_deleted_test_earnings_count,
        'test_ledger_entries', v_deleted_test_ledger_count,
        'test_referral_rewards', v_deleted_test_rewards_count,
        'test_referral_relationships', v_deleted_test_referrals_count,
        'test_messages', v_deleted_test_messages_count,
        'noise_audit_logs', v_deleted_noise_audit_logs_count,
        'noise_system_logs', v_deleted_noise_system_logs_count
      )
    );
  END IF;

  -- ----------------------------------------------------------------------------
  -- STEP C: ATOMIC EXECUTION WITH IMMUTABILITY TRIGGER BYPASS
  -- ----------------------------------------------------------------------------
  
  -- 1. Safely disable immutability triggers for the duration of the cleanup
  ALTER TABLE ledger DISABLE TRIGGER trg_immutable_ledger;
  ALTER TABLE audit_logs DISABLE TRIGGER trg_immutable_audit_logs;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_op_ledger') THEN
    ALTER TABLE finexj_operational_ledger DISABLE TRIGGER trg_immutable_op_ledger;
  END IF;

  BEGIN
    -- 2. Reverse-dependency deletion order:
    
    -- a. Referral Rewards (Child of users and deposits)
    DELETE FROM referral_rewards
    WHERE referrer_id IN (SELECT id FROM _test_users)
       OR referred_id IN (SELECT id FROM _test_users)
       OR (deposit_id IS NOT NULL AND deposit_id NOT IN (SELECT id FROM _preserved_deposits));

    -- b. Referrals tree
    DELETE FROM referrals
    WHERE referrer_id IN (SELECT id FROM _test_users)
       OR referred_id IN (SELECT id FROM _test_users);

    -- c. Double-Entry Ledger (Test user entries only)
    DELETE FROM ledger
    WHERE user_id IN (SELECT id FROM _test_users);

    -- d. Earnings (Test user entries only)
    DELETE FROM earnings
    WHERE user_id IN (SELECT id FROM _test_users);

    -- e. Financial Messages & Admin Messages
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'financial_messages') THEN
      DELETE FROM financial_messages WHERE user_id IN (SELECT id FROM _test_users);
    END IF;
    DELETE FROM admin_messages WHERE user_id IN (SELECT id FROM _test_users);

    -- f. Fraud Signals
    DELETE FROM fraud_signals WHERE user_id IN (SELECT id FROM _test_users);

    -- g. Withdrawals (Test user withdrawals only)
    DELETE FROM withdrawals WHERE user_id IN (SELECT id FROM _test_users);

    -- h. Deposits (Test user deposits only - strictly preserving valid deposits)
    DELETE FROM deposits
    WHERE user_id IN (SELECT id FROM _test_users)
      AND id NOT IN (SELECT id FROM _preserved_deposits);

    -- i. Users (Test users only)
    DELETE FROM users WHERE id IN (SELECT id FROM _test_users);

    -- j. Noise Audit Logs (Retaining all meaningful financial events)
    DELETE FROM audit_logs
    WHERE target_user_id IN (SELECT id::TEXT FROM _test_users)
       OR (
         action NOT IN (
           'DEPOSIT_APPROVED', 'DEPOSIT_REJECTED', 'DEPOSIT_CONFIRMED', 'DEPOSIT_AUTO_CONFIRMED',
           'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_CANCELLED',
           'DAILY_PERFORMANCE_DISTRIBUTED', 'PERFORMANCE_APPLIED', 'EARNINGS_DISTRIBUTED',
           'ADMIN_BALANCE_ADJUSTMENT', 'DATABASE_CLEANUP_COMPLETED'
         )
         AND created_at < v_now - INTERVAL '7 days'
       );

    -- k. Noise System Logs
    DELETE FROM system_logs
    WHERE event ILIKE '%test%' OR level = 'DEBUG' OR created_at < v_now - INTERVAL '14 days';

    -- 3. Re-enable immutability triggers immediately
    ALTER TABLE ledger ENABLE TRIGGER trg_immutable_ledger;
    ALTER TABLE audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_op_ledger') THEN
      ALTER TABLE finexj_operational_ledger ENABLE TRIGGER trg_immutable_op_ledger;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Ensure triggers are re-enabled even if an unexpected error occurs
    ALTER TABLE ledger ENABLE TRIGGER trg_immutable_ledger;
    ALTER TABLE audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_op_ledger') THEN
      ALTER TABLE finexj_operational_ledger ENABLE TRIGGER trg_immutable_op_ledger;
    END IF;
    RAISE;
  END;

  -- 4. Record Authoritative Audit Log for this Cleanup Operation
  INSERT INTO audit_logs (
    action, actor_id, actor_email, actor_role, reason, details, created_at
  ) VALUES (
    'DATABASE_CLEANUP_COMPLETED',
    p_admin_id,
    'system_cleanup',
    'super_admin',
    'Deterministic database cleanup executed. All valid deposit history, ledger records, earnings, and investor profiles preserved.',
    format('Preserved: %s deposits, %s users, %s ledger entries. Deleted: %s test users, %s test ledger entries, %s noise audit logs.',
           v_preserved_deposits_count, v_preserved_users_count, v_preserved_ledger_count,
           v_deleted_test_users_count, v_deleted_test_ledger_count, v_deleted_noise_audit_logs_count),
    v_now
  );

  v_report := jsonb_build_object(
    'success', true,
    'dry_run', false,
    'executed_at', v_now,
    'executed_by', p_admin_id,
    'preserved_records', jsonb_build_object(
      'deposits', v_preserved_deposits_count,
      'users', v_preserved_users_count,
      'ledger_entries', v_preserved_ledger_count,
      'earnings', v_preserved_earnings_count,
      'withdrawals', v_preserved_withdrawals_count,
      'referral_rewards', v_preserved_rewards_count
    ),
    'deleted_noise_records', jsonb_build_object(
      'test_users', v_deleted_test_users_count,
      'test_deposits', v_deleted_test_deposits_count,
      'test_withdrawals', v_deleted_test_withdrawals_count,
      'test_earnings', v_deleted_test_earnings_count,
      'test_ledger_entries', v_deleted_test_ledger_count,
      'test_referral_rewards', v_deleted_test_rewards_count,
      'test_referral_relationships', v_deleted_test_referrals_count,
      'test_messages', v_deleted_test_messages_count,
      'noise_audit_logs', v_deleted_noise_audit_logs_count,
      'noise_system_logs', v_deleted_noise_system_logs_count
    )
  );

  RETURN v_report;
END;
$$;

-- Restrict execution to service_role exclusively
REVOKE EXECUTE ON FUNCTION execute_database_cleanup_atomic(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_database_cleanup_atomic(TEXT, BOOLEAN) TO service_role;

-- 2. Dedicated View for Clean Financial Activity
-- Filters audit logs to strictly meaningful financial events:
-- - Deposit Approved / Rejected / Confirmed
-- - Withdrawal Approved / Rejected / Paid
-- - Earnings / Daily Performance Distributions
-- - Admin Balance Adjustments
CREATE OR REPLACE VIEW view_clean_financial_activity AS
SELECT
  id,
  action,
  actor_id,
  actor_email,
  actor_role,
  target_user_id,
  reason,
  details,
  before_value,
  after_value,
  reference_id,
  created_at,
  CASE
    WHEN action IN ('DEPOSIT_APPROVED', 'DEPOSIT_CONFIRMED', 'DEPOSIT_AUTO_CONFIRMED') THEN 'deposit_approved'
    WHEN action IN ('DEPOSIT_REJECTED') THEN 'deposit_rejected'
    WHEN action IN ('WITHDRAWAL_APPROVED', 'WITHDRAWAL_PAID') THEN 'withdrawal_approved'
    WHEN action IN ('WITHDRAWAL_REJECTED') THEN 'withdrawal_rejected'
    WHEN action IN ('WITHDRAWAL_REQUESTED', 'WITHDRAWAL_PROCESSING') THEN 'withdrawal_pending'
    WHEN action IN ('DAILY_PERFORMANCE_DISTRIBUTED', 'PERFORMANCE_APPLIED', 'EARNINGS_DISTRIBUTED') THEN 'performance_distributed'
    WHEN action IN ('ADMIN_BALANCE_ADJUSTMENT') THEN 'balance_adjustment'
    ELSE 'other_financial'
  END AS financial_category
FROM audit_logs
WHERE action IN (
  'DEPOSIT_APPROVED',
  'DEPOSIT_REJECTED',
  'DEPOSIT_CONFIRMED',
  'DEPOSIT_AUTO_CONFIRMED',
  'WITHDRAWAL_APPROVED',
  'WITHDRAWAL_REJECTED',
  'WITHDRAWAL_PAID',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWAL_PROCESSING',
  'WITHDRAWAL_CANCELLED',
  'DAILY_PERFORMANCE_DISTRIBUTED',
  'PERFORMANCE_APPLIED',
  'EARNINGS_DISTRIBUTED',
  'ADMIN_BALANCE_ADJUSTMENT'
);

-- 3. Composite Index on Audit Logs for Fast Financial Activity Filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_financial_action_created 
  ON audit_logs(action, created_at DESC);
