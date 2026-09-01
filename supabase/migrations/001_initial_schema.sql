-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 001: INITIAL SCHEMA & CORE TABLES
-- Authoritative schema definitions for FINEXJ USDT Managed Fund Platform
-- ==============================================================================

-- Enable UUID extension if supported
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (Investor Profiles, Administrative Roles & Security)
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

-- 2. Deposits Table (BEP-20 USDT Blockchain Deposits & Proof Verification)
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18, 4) NOT NULL,
  actual_amount NUMERIC(18, 4),
  currency TEXT NOT NULL DEFAULT 'USDT',
  network TEXT NOT NULL DEFAULT 'BEP-20',
  tx_hash TEXT NOT NULL UNIQUE,
  from_address TEXT,
  to_address TEXT NOT NULL DEFAULT '0x71C5A8c0B26D19543e49e29547d6e492211C54a9',
  token_contract TEXT NOT NULL DEFAULT '0x55d398326f99059fF775485246999027B3197955',
  block_number BIGINT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'confirming' | 'confirmed' | 'rejected'
  confirmations INTEGER NOT NULL DEFAULT 0,
  required_confirmations INTEGER NOT NULL DEFAULT 12,
  lock_expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  deposit_lock_end_date TIMESTAMP WITH TIME ZONE,
  eligibility_date TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
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

-- 3. Withdrawals Table (Strict 6% Fee, 30-Day Lock, Idempotency & Audit)
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

-- 4. Daily Performances Table (Historical Fund Yield Allocations)
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

-- Compatibility View
CREATE OR REPLACE VIEW daily_performance AS 
SELECT 
  id, date, rate_percentage, applicable_rate, trading_profit_percentage,
  gold_reserves_percentage, total_yield_percentage, is_yield_day,
  overall_fund_amount, total_fund_principal, actual_fund_performance,
  total_yield_distributed, applied_count, notes, distributed_by,
  created_by, distributed_at, created_at, updated_at
FROM daily_performances;

-- 5. Earnings Table (User-Level Credited Daily Performance Payouts)
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
  market_condition TEXT DEFAULT 'profit',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Double-Entry Financial Ledger (Immutable Journal)
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

-- 7. Audit Logs Table (Administrative & Security Event Trail)
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

-- 8. System Logs Table (Diagnostic, Runtime & Observability Tracking)
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

-- 9. Admin Messages Table (In-App Member Communications & Alerts)
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

-- 10. System Settings Table (Dynamic Platform Configurations)
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Initial Core Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_daily_performances_date ON daily_performances(date);
CREATE INDEX IF NOT EXISTS idx_earnings_user_id ON earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_messages_user_id ON admin_messages(user_id);

-- Baseline System Settings
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('bep20DepositAddress', '0x71C5A8c0B26D19543e49e29547d6e492211C54a9', NOW()),
  ('usdtContractAddress', '0x55d398326f99059fF775485246999027B3197955', NOW()),
  ('requiredConfirmations', '12', NOW()),
  ('minimumDepositAmount', '300', NOW()),
  ('withdrawalFeePercentage', '6', NOW()),
  ('accountAgeRequirementDays', '30', NOW()),
  ('depositLockPeriodDays', '30', NOW()),
  ('telegramSupportUrl', 'https://t.me/FINEXJ_OfficialSupport', NOW()),
  ('operationalWalletAddress', '0x71C5A8c0B26D19543e49e29547d6e492211C54a9', NOW()),
  ('compoundingEnabled', 'true', NOW()),
  ('maintenanceMode', 'false', NOW()),
  ('registrationEnabled', 'true', NOW()),
  ('loginEnabled', 'true', NOW()),
  ('sessionVersion', '1', NOW())
ON CONFLICT (key) DO NOTHING;
