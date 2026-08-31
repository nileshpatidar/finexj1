-- ==============================================================================
-- FINEXJ AUTHORITATIVE SUPABASE POSTGRESQL SCHEMA INITIALIZATION SCRIPT
-- USDT Managed Fund Platform (Double-Entry Ledger, Yield Distribution, Deposits, Withdrawals, Security)
-- ==============================================================================

-- Enable UUID extension if supported
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. Users Table (Investor Profiles, Administrative Roles & Security)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT 'Investor',
  phone TEXT DEFAULT '',
  country TEXT DEFAULT 'India',
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'super_admin' | 'finance_admin' | 'support_admin' | 'readonly_admin'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'suspended' | 'locked' | 'pending_verification'
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  wallet_address TEXT,
  profile_picture_url TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_secret TEXT,
  login_attempts INTEGER NOT NULL DEFAULT 0,
  last_login_at TIMESTAMP WITH TIME ZONE,
  lock_until TIMESTAMP WITH TIME ZONE,
  fund_lock_until TIMESTAMP WITH TIME ZONE,
  fund_lock_reason TEXT,
  last_withdrawal_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety: Add any missing columns to existing users table
DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'Investor';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_until TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS fund_lock_until TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS fund_lock_reason TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_withdrawal_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
END $$;

-- ==============================================================================
-- 2. Deposits Table (BEP-20 USDT Blockchain Deposits & Proof Verification)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18, 4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  network TEXT NOT NULL DEFAULT 'BEP-20',
  tx_hash TEXT NOT NULL UNIQUE,
  from_address TEXT,
  to_address TEXT NOT NULL DEFAULT '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  status TEXT NOT NULL DEFAULT 'confirmed', -- 'pending' | 'confirmed' | 'rejected'
  confirmations INTEGER NOT NULL DEFAULT 15,
  required_confirmations INTEGER NOT NULL DEFAULT 12,
  lock_expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  deposit_lock_end_date TIMESTAMP WITH TIME ZONE,
  eligibility_date TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  proof_url TEXT,
  proof_photo_url TEXT,
  notes TEXT,
  user_notes TEXT,
  admin_notes TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety for deposits
DO $$
BEGIN
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USDT';
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'BEP-20';
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS from_address TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS to_address TEXT NOT NULL DEFAULT '0x71C5A8c0B26D19543e49e29547d6e492211C54a9';
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS required_confirmations INTEGER NOT NULL DEFAULT 12;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deposit_lock_end_date TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS eligibility_date TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS proof_url TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS proof_photo_url TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS user_notes TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS admin_notes TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
END $$;

-- ==============================================================================
-- 3. Withdrawals Table (Strict 6% Fee, 30-Day Lock, Idempotency & Audit)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  reference TEXT UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_amount NUMERIC(18, 4) NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  fee_percentage NUMERIC(8, 4) NOT NULL DEFAULT 6.0000, -- Canonical 6% withdrawal fee
  fee_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  net_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  currency TEXT NOT NULL DEFAULT 'USDT',
  network TEXT NOT NULL DEFAULT 'BEP-20',
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'under_review' | 'approved' | 'processing' | 'completed' | 'paid' | 'rejected'
  tx_hash TEXT,
  payout_tx_hash TEXT,
  rejection_reason TEXT,
  admin_notes TEXT,
  user_notes TEXT,
  idempotency_key TEXT UNIQUE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety for withdrawals
DO $$
BEGIN
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS reference TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS amount NUMERIC(18, 4);
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_percentage NUMERIC(8, 4) NOT NULL DEFAULT 4.0000;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USDT';
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'BEP-20';
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS admin_notes TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS user_notes TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
END $$;

-- ==============================================================================
-- 4. Daily Performances Table (Historical Fund Yield Allocations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS daily_performances (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
  rate_percentage NUMERIC(8, 4) NOT NULL, -- e.g. 0.5000 for 0.50%
  applicable_rate NUMERIC(8, 4) NOT NULL DEFAULT 0, -- e.g. 0.0050
  trading_profit_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0,
  gold_reserves_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0,
  total_yield_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0,
  is_yield_day BOOLEAN NOT NULL DEFAULT TRUE,
  overall_fund_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  total_fund_principal NUMERIC(18, 4) NOT NULL DEFAULT 0,
  actual_fund_performance NUMERIC(8, 4) NOT NULL DEFAULT 0,
  total_yield_distributed NUMERIC(18, 4) NOT NULL DEFAULT 0,
  applied_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  distributed_by TEXT NOT NULL DEFAULT 'super_admin',
  created_by TEXT NOT NULL DEFAULT 'super_admin',
  distributed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety for daily_performances
DO $$
BEGIN
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS applicable_rate NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS trading_profit_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS gold_reserves_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS total_yield_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS is_yield_day BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS overall_fund_amount NUMERIC(18, 4) NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS actual_fund_performance NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS applied_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'super_admin';
  ALTER TABLE daily_performances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
END $$;

-- Compatibility View: support queries targeting 'daily_performance' (singular)
CREATE OR REPLACE VIEW daily_performance AS 
SELECT 
  id,
  date,
  rate_percentage,
  applicable_rate,
  trading_profit_percentage,
  gold_reserves_percentage,
  total_yield_percentage,
  is_yield_day,
  overall_fund_amount,
  total_fund_principal,
  actual_fund_performance,
  total_yield_distributed,
  applied_count,
  notes,
  distributed_by,
  created_by,
  distributed_at,
  created_at,
  updated_at
FROM daily_performances;

-- ==============================================================================
-- 5. Earnings Table (User-Level Credited Daily Performance Payouts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS earnings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_performance_id INTEGER REFERENCES daily_performances(id) ON DELETE SET NULL,
  calculation_id TEXT,
  date TEXT NOT NULL,
  performance_date TEXT,
  active_principal NUMERIC(18, 4) NOT NULL DEFAULT 0,
  base_eligible_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  rate_percentage NUMERIC(8, 4) NOT NULL DEFAULT 0,
  applicable_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
  payout_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  earnings_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'credited', -- 'credited' | 'reversed' | 'pending'
  market_condition TEXT DEFAULT 'profit', -- 'profit' | 'loss' | 'neutral'
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety for earnings
DO $$
BEGIN
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS calculation_id TEXT;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS performance_date TEXT;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS base_eligible_amount NUMERIC(18, 4) NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS applicable_rate NUMERIC(8, 4) NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS earnings_amount NUMERIC(18, 4) NOT NULL DEFAULT 0;
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'credited';
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS market_condition TEXT DEFAULT 'profit';
  ALTER TABLE earnings ADD COLUMN IF NOT EXISTS note TEXT;
END $$;

-- ==============================================================================
-- 6. Double-Entry Financial Ledger (Immutable Journal)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'deposit' | 'withdrawal_request' | 'withdrawal_paid' | 'withdrawal_rejected' | 'daily_earnings' | 'daily_loss' | 'admin_adjustment' | 'refund'
  amount NUMERIC(18, 4) NOT NULL,
  balance_after NUMERIC(18, 4) NOT NULL DEFAULT 0,
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  performed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety for ledger
DO $$
BEGIN
  ALTER TABLE ledger ADD COLUMN IF NOT EXISTS performed_by TEXT;
  ALTER TABLE ledger ADD COLUMN IF NOT EXISTS balance_after NUMERIC(18, 4) NOT NULL DEFAULT 0;
END $$;

-- ==============================================================================
-- 7. Audit Logs Table (Administrative & Security Event Trail)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT NOT NULL DEFAULT 'system',
  actor_role TEXT DEFAULT 'admin',
  target_user_id TEXT,
  reason TEXT,
  details TEXT,
  before_value JSONB,
  after_value JSONB,
  ip_address TEXT,
  reference_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Migration safety for audit_logs
DO $$
BEGIN
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT DEFAULT 'admin';
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_user_id TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_value JSONB;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_value JSONB;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reference_id TEXT;
END $$;

-- ==============================================================================
-- 8. System Logs Table (Diagnostic, Runtime & Observability Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'INFO', -- 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  event TEXT NOT NULL DEFAULT 'GENERAL',
  error_code TEXT,
  message TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT 'SERVER',
  user_id TEXT,
  admin_id TEXT,
  route TEXT,
  method TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. Admin Messages Table (In-App Member Communications & Alerts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS admin_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id TEXT,
  deposit_id TEXT,
  withdrawal_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'General Message',
  subject TEXT NOT NULL DEFAULT 'Notification from FINEXJ Administration',
  body TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. System Settings Table (Dynamic Platform Configurations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- Indexes for High-Performance Querying & Constraints
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(tx_hash);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_created_at ON deposits(created_at);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_reference ON withdrawals(reference);
CREATE INDEX IF NOT EXISTS idx_withdrawals_idempotency_key ON withdrawals(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at);

CREATE INDEX IF NOT EXISTS idx_daily_performances_date ON daily_performances(date);
CREATE INDEX IF NOT EXISTS idx_daily_performances_created_at ON daily_performances(created_at);

CREATE INDEX IF NOT EXISTS idx_earnings_user_id ON earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON earnings(date);
CREATE INDEX IF NOT EXISTS idx_earnings_created_at ON earnings(created_at);

CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_admin_messages_user_id ON admin_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_is_read ON admin_messages(is_read);

-- ==============================================================================
-- Initial System Settings (Canonical 6% Withdrawal Fee & 30-Day Lock Rule)
-- ==============================================================================
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('bep20DepositAddress', '0x71C5A8c0B26D19543e49e29547d6e492211C54a9', NOW()),
  ('usdtContractAddress', '0x55d398326f99059fF775485246999027B3197955', NOW()),
  ('requiredConfirmations', '12', NOW()),
  ('minimumDepositAmount', '300', NOW()),
  ('withdrawalFeePercentage', '6', NOW()), -- Canonical 6% Fee
  ('accountAgeRequirementDays', '30', NOW()), -- Canonical 30-Day Account Age Lock
  ('depositLockPeriodDays', '30', NOW()), -- Canonical 30-Day Deposit Principal Lock
  ('telegramSupportUrl', 'https://t.me/FINEXJ_OfficialSupport', NOW()),
  ('operationalWalletAddress', '0x71C5A8c0B26D19543e49e29547d6e492211C54a9', NOW()),
  ('compoundingEnabled', 'true', NOW()),
  ('maintenanceMode', 'false', NOW()),
  ('registrationEnabled', 'true', NOW()),
  ('loginEnabled', 'true', NOW()),
  ('sessionVersion', '1', NOW()),
  ('systemLogRetentionDays', '30', NOW()),
  ('errorLogRetentionDays', '90', NOW()),
  ('notificationRetentionDays', '90', NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- ==============================================================================
-- Enable Row Level Security (RLS) & Policies
-- ==============================================================================
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

-- Permissive service role and public access policies for application backend
DO $$
BEGIN
  -- users
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow all access to users') THEN
    CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- deposits
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deposits' AND policyname = 'Allow all access to deposits') THEN
    CREATE POLICY "Allow all access to deposits" ON deposits FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- withdrawals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'withdrawals' AND policyname = 'Allow all access to withdrawals') THEN
    CREATE POLICY "Allow all access to withdrawals" ON withdrawals FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- daily_performances
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_performances' AND policyname = 'Allow all access to daily_performances') THEN
    CREATE POLICY "Allow all access to daily_performances" ON daily_performances FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- earnings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'earnings' AND policyname = 'Allow all access to earnings') THEN
    CREATE POLICY "Allow all access to earnings" ON earnings FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- ledger
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ledger' AND policyname = 'Allow all access to ledger') THEN
    CREATE POLICY "Allow all access to ledger" ON ledger FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- audit_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Allow all access to audit_logs') THEN
    CREATE POLICY "Allow all access to audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- system_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_logs' AND policyname = 'Allow all access to system_logs') THEN
    CREATE POLICY "Allow all access to system_logs" ON system_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- admin_messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_messages' AND policyname = 'Allow all access to admin_messages') THEN
    CREATE POLICY "Allow all access to admin_messages" ON admin_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- system_settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Allow all access to system_settings') THEN
    CREATE POLICY "Allow all access to system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================================
-- 11. Atomic Financial Functions (PostgreSQL Transactions)
-- ==============================================================================

-- Atomic Withdrawal Creation
CREATE OR REPLACE FUNCTION create_withdrawal_atomic(
  p_user_id INTEGER,
  p_requested_amount NUMERIC,
  p_destination_address TEXT,
  p_reference TEXT,
  p_idempotency_key TEXT,
  p_user_notes TEXT,
  p_fee_percentage NUMERIC,
  p_fee_amount NUMERIC,
  p_net_amount NUMERIC,
  p_fund_lock_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_total_deposited NUMERIC := 0;
  v_total_earnings NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_total_pending_withdrawn NUMERIC := 0;
  v_locked_principal NUMERIC := 0;
  v_available_balance NUMERIC := 0;
  v_eligible_balance NUMERIC := 0;
  v_existing_wd withdrawals%ROWTYPE;
  v_new_wd withdrawals%ROWTYPE;
  v_lock_until TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Check idempotency key to prevent double submits
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key != '' THEN
    SELECT * INTO v_existing_wd FROM withdrawals WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'is_duplicate', true, 'withdrawal', to_jsonb(v_existing_wd));
    END IF;
  END IF;

  -- 2. Lock user row for update to prevent race condition balance drains
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found');
  END IF;

  IF v_user.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Account is currently %s', v_user.status));
  END IF;

  -- 3. Check 30-Day Account Age Rule
  IF v_user.created_at + INTERVAL '30 days' > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawals require account maturity of at least 30 full days.');
  END IF;

  -- 4. Check active user-level fund lock
  IF v_user.fund_lock_until IS NOT NULL AND v_user.fund_lock_until > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', '30-Day post-withdrawal fund lock is active on this account.');
  END IF;

  -- 5. Calculate confirmed deposits
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_user_id AND status = 'confirmed';

  -- 6. Calculate credited earnings
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_user_id AND status = 'credited';

  -- 7. Calculate paid and pending withdrawals
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');

  -- 8. Calculate locked principal (deposits under 30 days)
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal FROM deposits WHERE user_id = p_user_id AND status = 'confirmed' AND (COALESCE(confirmed_at, created_at) + INTERVAL '30 days' > v_now);

  v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;
  v_eligible_balance := GREATEST(0, v_available_balance - v_locked_principal);

  IF p_requested_amount > v_eligible_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Insufficient eligible balance. Requested: %s USDT, Eligible: %s USDT', p_requested_amount, v_eligible_balance));
  END IF;

  -- 9. Insert new pending withdrawal
  INSERT INTO withdrawals (
    user_id,
    amount,
    requested_amount,
    fee_percentage,
    fee_amount,
    net_amount,
    currency,
    network,
    destination_address,
    status,
    reference,
    idempotency_key,
    user_notes,
    created_at
  ) VALUES (
    p_user_id,
    p_requested_amount,
    p_requested_amount,
    p_fee_percentage,
    p_fee_amount,
    p_net_amount,
    'USDT',
    'BEP-20',
    p_destination_address,
    'pending',
    p_reference,
    p_idempotency_key,
    p_user_notes,
    v_now
  ) RETURNING * INTO v_new_wd;

  -- 10. Insert ledger journal entry
  INSERT INTO ledger (
    user_id,
    type,
    amount,
    balance_after,
    reference_id,
    description,
    performed_by,
    created_at
  ) VALUES (
    p_user_id,
    'withdrawal_request',
    -p_requested_amount,
    v_available_balance - p_requested_amount,
    v_new_wd.id::TEXT,
    format('Withdrawal request submitted for %s USDT (%s%% Fee: %s USDT, Net: %s USDT)', p_requested_amount, p_fee_percentage, p_fee_amount, p_net_amount),
    p_user_id::TEXT,
    v_now
  );

  -- 11. Activate 30-Day Post-Withdrawal Fund Lock
  v_lock_until := v_now + (p_fund_lock_days || ' days')::INTERVAL;
  UPDATE users SET
    fund_lock_until = v_lock_until,
    fund_lock_reason = format('%s-Day Post-Withdrawal Fund Lock (%s)', p_fund_lock_days, p_reference),
    last_withdrawal_at = v_now,
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_new_wd));
END;
$$;


