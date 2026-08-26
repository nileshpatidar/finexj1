-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA INITIALIZATION SCRIPT
-- USDT Managed Fund Platform (Multi-tenant Ledger, Users, Yield, Withdrawals)
-- ==============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'super_admin' | 'finance_admin' | 'support_admin'
  full_name TEXT NOT NULL,
  wallet_address TEXT,
  two_factor_secret TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Deposits Table
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_hash TEXT NOT NULL UNIQUE,
  amount NUMERIC(18, 4) NOT NULL,
  net_amount NUMERIC(18, 4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed', -- 'pending' | 'confirmed' | 'rejected'
  confirmations INTEGER NOT NULL DEFAULT 15,
  lock_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Withdrawals Table
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_amount NUMERIC(18, 4) NOT NULL,
  fee_amount NUMERIC(18, 4) NOT NULL,
  net_amount NUMERIC(18, 4) NOT NULL,
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'completed' | 'paid'
  tx_hash TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by TEXT
);

-- 5. Daily Performances Table (Yield Distribution History)
CREATE TABLE IF NOT EXISTS daily_performances (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
  rate_percentage NUMERIC(8, 4) NOT NULL,
  total_fund_principal NUMERIC(18, 4) NOT NULL,
  total_yield_distributed NUMERIC(18, 4) NOT NULL,
  distributed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  distributed_by TEXT NOT NULL
);

-- 6. Earnings Table (User-Level Daily Performance Payouts)
CREATE TABLE IF NOT EXISTS earnings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_performance_id INTEGER NOT NULL REFERENCES daily_performances(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  active_principal NUMERIC(18, 4) NOT NULL,
  rate_percentage NUMERIC(8, 4) NOT NULL,
  payout_amount NUMERIC(18, 4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. Double-Entry Financial Ledger (Immutable Journal)
CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'DEPOSIT_CREDIT' | 'YIELD_CREDIT' | 'WITHDRAWAL_LOCK' | 'WITHDRAWAL_FEE' | 'ADMIN_ADJUSTMENT' | 'REFUND'
  amount NUMERIC(18, 4) NOT NULL,
  balance_after NUMERIC(18, 4) NOT NULL,
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 8. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  details TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 9. System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_user_id ON earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger(created_at);

-- Initial default system settings
INSERT INTO system_settings (key, value) VALUES
  ('bep20DepositAddress', '0x71C5A8c0B26D19543e49e29547d6e492211C54a9'),
  ('usdtContractAddress', '0x55d398326f99059fF775485246999027B3197955'),
  ('requiredConfirmations', '15'),
  ('withdrawalFeePercentage', '0.04'),
  ('accountAgeRequirementDays', '30'),
  ('depositLockPeriodDays', '20'),
  ('telegramSupportUrl', 'https://t.me/USDTFundOfficialSupport')
ON CONFLICT (key) DO NOTHING;
