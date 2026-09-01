-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 008: FRAUD, REFERRAL INTEGRITY & SECURITY HARDENING (#30, #31, #32)
-- Database Integrity Constraints, Multi-Account Abuse Prevention & Audit Durability
-- ==============================================================================

DO $$
BEGIN
  -- 1. Add Referral & Fraud Risk Columns to users table safely
  ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS fraud_flags JSONB DEFAULT '[]'::jsonb;

  -- 2. Add Self-Referral Prevention Check Constraint
  ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_no_self_referral;
  ALTER TABLE users ADD CONSTRAINT chk_user_no_self_referral 
    CHECK (referrer_id IS NULL OR referrer_id <> id);
END $$;

-- 3. Case-Insensitive Unique Index for Referral Codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_uniq 
  ON users (LOWER(TRIM(referral_code))) WHERE referral_code IS NOT NULL AND TRIM(referral_code) != '';

CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON users(referrer_id) WHERE referrer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_flagged ON users(is_flagged_for_review) WHERE is_flagged_for_review = TRUE;

-- ==============================================================================
-- 4. Referrals Relationship Table (One-to-One Referral Binding & Anti-Manipulation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code_used TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'flagged' | 'revoked'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_referral_no_self_ref CHECK (referrer_id <> referred_id),
  CONSTRAINT uq_referred_user_single_referrer UNIQUE (referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- ==============================================================================
-- 5. Referral Rewards Table (Idempotent Commission / Bonus Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS referral_rewards (
  id SERIAL PRIMARY KEY,
  referral_id INTEGER REFERENCES referrals(id) ON DELETE SET NULL,
  referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_id INTEGER NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  percentage NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'credited', -- 'credited' | 'pending_review' | 'flagged' | 'reversed'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_referral_reward_per_deposit UNIQUE (deposit_id),
  CONSTRAINT uq_referral_reward_referrer_deposit UNIQUE (referrer_id, deposit_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_deposit ON referral_rewards(deposit_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_created ON referral_rewards(created_at DESC);

-- ==============================================================================
-- 6. Fraud Signals & Security Alerts Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS fraud_signals (
  id SERIAL PRIMARY KEY,
  signal_type TEXT NOT NULL, -- 'duplicate_wallet' | 'rapid_cycle' | 'self_referral_attempt' | 'replay_tx' | 'high_auth_failures' | 'suspicious_payout'
  severity TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' | 'critical'
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  wallet_address TEXT,
  tx_hash TEXT,
  details JSONB,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'reviewed' | 'dismissed' | 'action_taken'
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON fraud_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON fraud_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_status ON fraud_signals(status);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_severity ON fraud_signals(severity);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_wallet ON fraud_signals(LOWER(TRIM(wallet_address))) WHERE wallet_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_signals_created ON fraud_signals(created_at DESC);

-- ==============================================================================
-- 7. Audit Log Enhancement & Indexes
-- ==============================================================================
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_reference ON audit_logs(reference_id) WHERE reference_id IS NOT NULL;

-- Enable RLS on newly created tables
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'referrals' AND policyname = 'Allow all access to referrals') THEN
    CREATE POLICY "Allow all access to referrals" ON referrals FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'referral_rewards' AND policyname = 'Allow all access to referral_rewards') THEN
    CREATE POLICY "Allow all access to referral_rewards" ON referral_rewards FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fraud_signals' AND policyname = 'Allow all access to fraud_signals') THEN
    CREATE POLICY "Allow all access to fraud_signals" ON fraud_signals FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
