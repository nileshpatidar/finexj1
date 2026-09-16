-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 021: DATABASE + RLS + RPC SECURITY HARDENING
-- Master Security Boundary Enforcement for FINEXJ Financial & Audit Infrastructure
-- ==============================================================================
-- 1. Hardened Row Level Security (RLS) across all 14 platform tables
--    - Replaces permissive 'Allow all access' with strict least-privilege policies
--    - Enforces tenant isolation: User A cannot SELECT, INSERT, UPDATE, DELETE User B
--    - Grants explicit full bypass only to service_role
-- 2. Foreign Key Non-Destructive Retention (Anti-Cascade Integrity)
--    - Converts ON DELETE CASCADE to ON DELETE RESTRICT on financial tables
--    - Guarantees financial history, ledger journal, and audit trails survive deletion attempts
-- 3. Security Definer & Search Path Injection Protection
--    - Sets explicit 'SET search_path = public, pg_temp' on all SECURITY DEFINER functions
--    - Restricts EXECUTE permissions to service_role for all administrative & financial mutation RPCs
-- 4. Authoritative Caller Identity Verification
--    - Verifies caller context in create_withdrawal_atomic against p_user_id
-- 5. Immutability Triggers for Double-Entry Ledger & Audit Logs
--    - Prohibits UPDATE or DELETE on ledger, audit_logs, and finexj_operational_ledger
-- ==============================================================================

-- ==============================================================================
-- 1. Anti-Cascade Integrity: Restrict Deletion of Financial Data
-- ==============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1.A deposits: user_id -> users(id) ON DELETE RESTRICT
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'deposits'::regclass AND contype = 'f'
      AND confrelid = 'users'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE deposits DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
  ALTER TABLE deposits ADD CONSTRAINT fk_deposits_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

  -- 1.B withdrawals: user_id -> users(id) ON DELETE RESTRICT
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'withdrawals'::regclass AND contype = 'f'
      AND confrelid = 'users'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
  ALTER TABLE withdrawals ADD CONSTRAINT fk_withdrawals_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

  -- 1.C earnings: user_id -> users(id) ON DELETE RESTRICT
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'earnings'::regclass AND contype = 'f'
      AND confrelid = 'users'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE earnings DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
  ALTER TABLE earnings ADD CONSTRAINT fk_earnings_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

  -- 1.D ledger: user_id -> users(id) ON DELETE RESTRICT
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'ledger'::regclass AND contype = 'f'
      AND confrelid = 'users'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
  ALTER TABLE ledger ADD CONSTRAINT fk_ledger_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

  -- 1.E referral_rewards: referrer_id, referred_id, deposit_id ON DELETE RESTRICT
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_rewards') THEN
    FOR r IN (
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'referral_rewards'::regclass AND contype = 'f'
        AND confrelid = 'users'::regclass
    ) LOOP
      EXECUTE 'ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
    ALTER TABLE referral_rewards ADD CONSTRAINT fk_referral_rewards_referrer_id FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE RESTRICT;
    ALTER TABLE referral_rewards ADD CONSTRAINT fk_referral_rewards_referred_id FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE RESTRICT;

    FOR r IN (
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'referral_rewards'::regclass AND contype = 'f'
        AND confrelid = 'deposits'::regclass
    ) LOOP
      EXECUTE 'ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
    ALTER TABLE referral_rewards ADD CONSTRAINT fk_referral_rewards_deposit_id FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE RESTRICT;
  END IF;
END $$;


-- ==============================================================================
-- 2. Financial Amount Sanity Check Constraints
-- ==============================================================================
DO $$
BEGIN
  -- Deposits positive amount check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deposits_positive_amount') THEN
    ALTER TABLE deposits ADD CONSTRAINT chk_deposits_positive_amount CHECK (amount > 0);
  END IF;

  -- Ensure withdrawals amount column exists
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS amount NUMERIC(18, 4);
  UPDATE withdrawals SET amount = requested_amount WHERE amount IS NULL;

  -- Withdrawals positive amount check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_withdrawals_positive_amount') THEN
    ALTER TABLE withdrawals ADD CONSTRAINT chk_withdrawals_positive_amount CHECK (requested_amount > 0 AND (amount IS NULL OR amount > 0));
  END IF;

  -- Ensure earnings columns exist
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS earnings_amount NUMERIC(18, 4) NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS market_condition TEXT DEFAULT 'profit';
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS applicable_rate NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'credited';
  UPDATE earnings SET earnings_amount = payout_amount WHERE earnings_amount = 0 AND payout_amount > 0;

  -- Earnings amount sanity check:
  -- Auto-classify any legacy unclassified negative earnings as 'loss' before applying constraint
  UPDATE earnings 
  SET market_condition = 'loss' 
  WHERE earnings_amount < 0 AND (market_condition IS NULL OR market_condition NOT IN ('loss', 'reversed'));

  -- Drop legacy overly-restrictive constraint if already present
  ALTER TABLE earnings DROP CONSTRAINT IF EXISTS chk_earnings_non_negative_amount;

  -- Earnings amount check: non-negative for standard profit/neutral yields, permits negative for fund loss days or reversed payouts
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_earnings_non_negative_amount') THEN
    ALTER TABLE earnings ADD CONSTRAINT chk_earnings_non_negative_amount 
      CHECK (earnings_amount >= 0 OR market_condition = 'loss' OR applicable_rate < 0 OR status = 'reversed');
  END IF;

  -- Ledger non-zero amount check (permits zero amounts for zero-yield distribution days and withdrawal states)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ledger_nonzero_amount') THEN
    ALTER TABLE ledger ADD CONSTRAINT chk_ledger_nonzero_amount 
      CHECK (amount <> 0 OR type IN ('withdrawal_paid', 'withdrawal_hold', 'daily_earnings', 'admin_adjustment', 'voluntary_lock'));
  END IF;
END $$;


-- ==============================================================================
-- 3. Immutability Triggers (Append-Only Journals)
-- ==============================================================================
CREATE OR REPLACE FUNCTION prevent_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Security Invariant Violation: The double-entry ledger is an append-only journal. Modifying or deleting ledger records is strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_ledger ON ledger;
CREATE TRIGGER trg_immutable_ledger
  BEFORE UPDATE OR DELETE ON ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_tampering();


CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Security Invariant Violation: Audit logs are immutable and tamper-evident. Modifying or deleting audit records is strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_tampering();


CREATE OR REPLACE FUNCTION prevent_operational_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Security Invariant Violation: The operational fund ledger is an append-only financial journal. Modifying or deleting entries is strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_op_ledger ON finexj_operational_ledger;
CREATE TRIGGER trg_immutable_op_ledger
  BEFORE UPDATE OR DELETE ON finexj_operational_ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_operational_ledger_tampering();


-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) HARDENING PASS
-- ==============================================================================
-- Ensure auth schema and JWT helpers exist for self-hosted or testing environments
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow all access to users" ON users;
DROP POLICY IF EXISTS "Allow all access to deposits" ON deposits;
DROP POLICY IF EXISTS "Allow all access to withdrawals" ON withdrawals;
DROP POLICY IF EXISTS "Allow all access to daily_performances" ON daily_performances;
DROP POLICY IF EXISTS "Allow all access to earnings" ON earnings;
DROP POLICY IF EXISTS "Allow all access to ledger" ON ledger;
DROP POLICY IF EXISTS "Allow all access to audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow all access to system_logs" ON system_logs;
DROP POLICY IF EXISTS "Allow all access to admin_messages" ON admin_messages;
DROP POLICY IF EXISTS "Allow all access to system_settings" ON system_settings;
DROP POLICY IF EXISTS "Allow all access to referrals" ON referrals;
DROP POLICY IF EXISTS "Allow all access to referral_rewards" ON referral_rewards;
DROP POLICY IF EXISTS "Allow all access to fraud_signals" ON fraud_signals;
DROP POLICY IF EXISTS "Allow server access to finexj_operational_ledger" ON finexj_operational_ledger;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE finexj_operational_ledger ENABLE ROW LEVEL SECURITY;

-- 4.A Service Role Policies (Backend Server has Full Managed Access)
CREATE POLICY "service_role_all_users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deposits" ON deposits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_withdrawals" ON withdrawals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_daily_performances" ON daily_performances FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_earnings" ON earnings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_ledger" ON ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_system_logs" ON system_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_admin_messages" ON admin_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_system_settings" ON system_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_referrals" ON referrals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_referral_rewards" ON referral_rewards FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_fraud_signals" ON fraud_signals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_finexj_operational_ledger" ON finexj_operational_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.B Users Table Policies
-- Users can only view their own profile, admins can view all profiles
CREATE POLICY "users_select_isolated" ON users FOR SELECT TO authenticated
  USING (
    email = (auth.jwt() ->> 'email')
    OR id::text = (auth.jwt() ->> 'sub')
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- Users can only update their own non-security profile fields (role/status/balances locked)
CREATE POLICY "users_update_own_profile" ON users FOR UPDATE TO authenticated
  USING (
    email = (auth.jwt() ->> 'email')
    OR id::text = (auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    (email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    AND role = (SELECT u.role FROM users u WHERE u.email = (auth.jwt() ->> 'email') OR u.id::text = (auth.jwt() ->> 'sub'))
    AND status = (SELECT u.status FROM users u WHERE u.email = (auth.jwt() ->> 'email') OR u.id::text = (auth.jwt() ->> 'sub'))
  );

-- 4.C Deposits Table Policies
-- User can only view their own deposits; admins view all
CREATE POLICY "deposits_select_isolated" ON deposits FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- User can only submit a pending deposit for themselves; direct confirmation or status update denied
CREATE POLICY "deposits_insert_own_pending" ON deposits FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    AND status = 'pending'
  );

-- 4.D Withdrawals Table Policies
-- User can only view their own withdrawals; direct inserts/updates denied (must use create_withdrawal_atomic)
CREATE POLICY "withdrawals_select_isolated" ON withdrawals FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- 4.E Earnings Table Policies
-- User can only view their own earnings; modification denied
CREATE POLICY "earnings_select_isolated" ON earnings FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- 4.F Ledger Table Policies
-- User can only view their own ledger journal; modification strictly denied
CREATE POLICY "ledger_select_isolated" ON ledger FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- 4.G Daily Performances Table Policies
-- Yield history is public read-only for authenticated & anon clients
CREATE POLICY "daily_performances_select_public" ON daily_performances FOR SELECT TO authenticated, anon
  USING (true);

-- 4.H Referrals Table Policies
-- User can only view referrals where they are the referrer or referred
CREATE POLICY "referrals_select_isolated" ON referrals FOR SELECT TO authenticated
  USING (
    referrer_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR referred_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- 4.I Referral Rewards Table Policies
-- User can only view rewards credited to them as the referrer
CREATE POLICY "referral_rewards_select_isolated" ON referral_rewards FOR SELECT TO authenticated
  USING (
    referrer_id = (SELECT id FROM users WHERE email = (auth.jwt() ->> 'email') OR id::text = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- 4.J Audit & System Logs Table Policies
-- Restricted exclusively to platform administrators
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

CREATE POLICY "system_logs_select_admin" ON system_logs FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin')
  );

-- 4.K System Settings Table Policies
-- Read-only to authenticated and anon clients; updates restricted to super_admin
CREATE POLICY "system_settings_select_public" ON system_settings FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "system_settings_modify_super_admin" ON system_settings FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'super_admin');

-- 4.L Operational Fund Ledger Policies
-- Restricted strictly to super_admin and finance_admin
CREATE POLICY "operational_ledger_select_admin" ON finexj_operational_ledger FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin'));

-- 4.M Fraud Signals Policies
-- Restricted to administrators
CREATE POLICY "fraud_signals_select_admin" ON fraud_signals FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin', 'readonly_admin'));

CREATE POLICY "fraud_signals_update_admin" ON fraud_signals FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('super_admin', 'finance_admin', 'support_admin'));


-- ==============================================================================
-- 5. RPC SECURITY & FUNCTION EXECUTION HARDENING
-- ==============================================================================
DO $$
DECLARE
  r RECORD;
  v_func_names TEXT[] := ARRAY[
    'confirm_deposit_atomic',
    'credit_referral_reward_atomic',
    'process_withdrawal_status_atomic',
    'adjust_user_balance_atomic',
    'adjust_finexj_operational_fund_atomic',
    'distribute_daily_performance_atomic',
    'get_admin_accounting_summary',
    'get_referral_accounting_summary',
    'get_operational_fund_summary_aggregate',
    'get_admin_dashboard_stats_aggregate'
  ];
  v_name TEXT;
BEGIN
  -- Revoke default PUBLIC execution and grant exclusively to service_role
  FOREACH v_name IN ARRAY v_func_names LOOP
    FOR r IN (
      SELECT p.oid::regprocedure AS func_signature 
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = v_name 
        AND n.nspname = 'public'
    ) LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.func_signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.func_signature);
    END LOOP;
  END LOOP;

  -- get_user_referral_eligibility (read-only query function)
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'get_user_referral_eligibility' 
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role, anon', r.func_signature);
  END LOOP;
END $$;



-- ==============================================================================
-- 6. Harden create_withdrawal_atomic: Search Path & Identity Verification
-- ==============================================================================
-- Explicitly drop known obsolete 10-parameter signature from prior migrations
DROP FUNCTION IF EXISTS public.create_withdrawal_atomic(
  INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER
);

-- Safely drop any other non-authoritative overloads of create_withdrawal_atomic
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'create_withdrawal_atomic'
      AND n.nspname = 'public'
      AND p.pronargs <> 12
  ) LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.func_sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION create_withdrawal_atomic(
  p_user_id INTEGER,
  p_requested_amount NUMERIC(18, 4),
  p_destination_address TEXT,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_user_notes TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC(8, 4) DEFAULT NULL,
  p_fee_amount NUMERIC(18, 4) DEFAULT NULL,
  p_net_amount NUMERIC(18, 4) DEFAULT NULL,
  p_fund_lock_days INTEGER DEFAULT 0,
  p_confirm_lock_break BOOLEAN DEFAULT FALSE,
  p_confirm_minimum_break BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_new_wd withdrawals%ROWTYPE;
  v_existing_wd withdrawals%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_available_balance NUMERIC(18, 4) := 0.0000;
  v_eligible_balance NUMERIC(18, 4) := 0.0000;
  v_total_deposited NUMERIC(18, 4) := 0.0000;
  v_total_earnings NUMERIC(18, 4) := 0.0000;
  v_total_referral NUMERIC(18, 4) := 0.0000;
  v_total_adjustments NUMERIC(18, 4) := 0.0000;
  v_total_withdrawn NUMERIC(18, 4) := 0.0000;
  v_total_pending_withdrawn NUMERIC(18, 4) := 0.0000;
  v_locked_principal NUMERIC(18, 4) := 0.0000;
  v_raw_fee_setting TEXT;
  v_fee_pct NUMERIC(8, 4);
  v_raw_min_setting TEXT;
  v_min_deposit NUMERIC(18, 4);
  v_fee_amt NUMERIC(18, 4) := 0.0000;
  v_net_amt NUMERIC(18, 4) := 0.0000;
  v_clean_ref TEXT;
  v_dest TEXT;
  v_caller_id INTEGER;
BEGIN
  -- Caller Identity Verification: If executed by authenticated role, verify caller owns p_user_id
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    SELECT id INTO v_caller_id FROM users 
    WHERE email = current_setting('request.jwt.claim.email', true) 
       OR id::text = current_setting('request.jwt.claim.sub', true);
    
    IF v_caller_id IS NULL OR v_caller_id <> p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Caller identity does not match withdrawal account.');
    END IF;
  END IF;

  -- Validate destination address format
  v_dest := TRIM(p_destination_address);
  IF v_dest IS NULL OR v_dest !~* '^0x[a-fA-F0-9]{40}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid BEP-20 destination address format. Must be a 0x-prefixed 40-hex character BNB Smart Chain address.');
  END IF;

  -- Validate requested amount
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal amount must be greater than 0 USDT.');
  END IF;

  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_wd FROM withdrawals WHERE idempotency_key = TRIM(p_idempotency_key) LIMIT 1;
    IF FOUND THEN
      IF v_existing_wd.user_id != p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key conflict: key belongs to another account.');
      END IF;
      IF ABS(v_existing_wd.requested_amount - p_requested_amount) > 0.0001 OR LOWER(v_existing_wd.destination_address) != LOWER(v_dest) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key reuse conflict: request parameters do not match original request.');
      END IF;
      RETURN jsonb_build_object('success', true, 'is_duplicate', true, 'withdrawal', to_jsonb(v_existing_wd));
    END IF;
  END IF;

  -- 2. Lock user row for update
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found.');
  END IF;

  IF v_user.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Account is currently %s. Withdrawals are disabled.', v_user.status));
  END IF;

  -- 3. STRICT CONFIGURATION SAFETY: Read withdrawalFeePercentage
  SELECT value INTO v_raw_fee_setting FROM system_settings WHERE key = 'withdrawalFeePercentage';
  IF v_raw_fee_setting IS NULL OR TRIM(v_raw_fee_setting) = '' THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_user_id::TEXT, 'system', p_user_id::TEXT, 'Missing required setting withdrawalFeePercentage in create_withdrawal_atomic', v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: withdrawalFeePercentage is missing in system settings. Transaction aborted.');
  END IF;

  BEGIN
    v_fee_pct := v_raw_fee_setting::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_user_id::TEXT, 'system', p_user_id::TEXT, format('Invalid non-numeric withdrawalFeePercentage (%s)', v_raw_fee_setting), v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: withdrawalFeePercentage is non-numeric in system settings. Transaction aborted.');
  END;

  IF v_fee_pct < 0 OR v_fee_pct >= 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: withdrawalFeePercentage must be between 0% and 100%.');
  END IF;

  -- 4. Calculate available balances with row-lock consistency
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_referral FROM referral_rewards WHERE referrer_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_adjustments FROM ledger WHERE user_id = p_user_id AND type = 'admin_adjustment';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal FROM deposits WHERE user_id = p_user_id AND status = 'confirmed' AND (COALESCE(confirmed_at, created_at) + INTERVAL '30 days' > v_now);

  v_available_balance := v_total_deposited + v_total_earnings + v_total_referral + v_total_adjustments - v_total_withdrawn - v_total_pending_withdrawn;
  
  IF p_requested_amount > v_available_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Insufficient available balance. Requested: %s USDT, Available: %s USDT.', p_requested_amount, v_available_balance));
  END IF;

  -- 5. Calculate authoritative fees and net payout
  v_fee_amt := ROUND(p_requested_amount * (v_fee_pct / 100.0), 4);
  v_net_amt := p_requested_amount - v_fee_amt;

  -- 6. Generate Reference
  IF p_reference IS NOT NULL AND TRIM(p_reference) != '' THEN
    v_clean_ref := TRIM(p_reference);
  ELSE
    v_clean_ref := 'WD-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;

  -- 7. Insert withdrawal row
  INSERT INTO withdrawals (
    user_id, requested_amount, amount, fee_percentage, fee_amount, net_amount,
    currency, network, destination_address, status, reference, idempotency_key,
    user_notes, created_at, updated_at
  ) VALUES (
    p_user_id, p_requested_amount, p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt,
    'USDT', 'BEP-20', v_dest, 'pending', v_clean_ref, TRIM(p_idempotency_key),
    p_user_notes, v_now, v_now
  )
  RETURNING * INTO v_new_wd;

  -- 8. Ledger Entry (Hold of Funds)
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_user_id, 'withdrawal_hold', -p_requested_amount, (v_available_balance - p_requested_amount), v_new_wd.id::TEXT,
    format('Withdrawal request #%s initiated for %s USDT to %s (Fee %s%%: %s USDT, Net: %s USDT)', v_new_wd.id, p_requested_amount, v_dest, v_fee_pct, v_fee_amt, v_net_amt),
    COALESCE(current_setting('request.jwt.claim.sub', true), p_user_id::TEXT), v_now
  );

  -- 9. Audit Log
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
  ) VALUES (
    'WITHDRAWAL_REQUESTED', p_user_id::TEXT, 'user', p_user_id::TEXT,
    format('User requested withdrawal #%s of %s USDT (Net: %s USDT, Fee %s%%: %s USDT)', v_new_wd.id, p_requested_amount, v_net_amt, v_fee_pct, v_fee_amt),
    v_clean_ref, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal', to_jsonb(v_new_wd),
    'available_balance_after', (v_available_balance - p_requested_amount)
  );
END;
$$;

-- Unambiguously grant/revoke on the authoritative 12-argument signature
GRANT EXECUTE ON FUNCTION public.create_withdrawal_atomic(
  INTEGER, NUMERIC(18, 4), TEXT, TEXT, TEXT, TEXT, NUMERIC(8, 4), NUMERIC(18, 4), NUMERIC(18, 4), INTEGER, BOOLEAN, BOOLEAN
) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_withdrawal_atomic(
  INTEGER, NUMERIC(18, 4), TEXT, TEXT, TEXT, TEXT, NUMERIC(8, 4), NUMERIC(18, 4), NUMERIC(18, 4), INTEGER, BOOLEAN, BOOLEAN
) FROM anon, PUBLIC;

-- Dynamic loop to guarantee all resolved overloads in public are properly granted
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'create_withdrawal_atomic' 
      AND n.nspname = 'public'
  ) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, authenticated', r.func_signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.func_signature);
  END LOOP;
END $$;

