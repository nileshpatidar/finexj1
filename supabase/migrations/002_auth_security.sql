-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 002: AUTHENTICATION & SECURITY CONTROLS
-- 2FA, Login lockout enforcement, fund locks, and session tracking
-- ==============================================================================

DO $$
BEGIN
  -- User authentication & 2FA security fields
  ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
  
  -- Login Lockout & Rate-limiting fields
  ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_until TIMESTAMP WITH TIME ZONE;
  
  -- Fund Lock & Withdrawal maturity fields
  ALTER TABLE users ADD COLUMN IF NOT EXISTS fund_lock_until TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS fund_lock_reason TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_withdrawal_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
END $$;

-- Indexes for security lookup queries
CREATE INDEX IF NOT EXISTS idx_users_lock_until ON users(lock_until);
CREATE INDEX IF NOT EXISTS idx_users_fund_lock_until ON users(fund_lock_until);
CREATE INDEX IF NOT EXISTS idx_users_login_attempts ON users(login_attempts);

-- Global session revocation setting
INSERT INTO system_settings (key, value, updated_at)
VALUES ('sessionVersion', '1', NOW())
ON CONFLICT (key) DO NOTHING;
