-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 010: REFERRAL ACCOUNTING & OPERATIONAL HARDENING
-- 
-- 1. Multi-Tier Referral Rewards (Level 1 direct & Level 2 indirect)
-- 2. Reward Event Identification (Deposit-triggered qualification)
-- 3. One-Time Reward Protection per (referral_id, deposit_id, reward_level)
-- 4. Referral Relationship Integrity (Single direct referrer per user)
-- 5. Configurable Settings Defaults (companyReferralCode, withdrawalFeePercentage, etc.)
-- 6. Dedicated Admin-Only FINEXJ Operational Fund Ledger Table & RLS Policies
-- ==============================================================================

-- ==============================================================================
-- 1. Multi-Tier Referral Reward Fields & Event Categorization
-- ==============================================================================
DO $$
BEGIN
  -- Add reward_level column (1 for L1 direct referrer, 2 for L2 parent referrer)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_rewards' AND column_name = 'reward_level'
  ) THEN
    ALTER TABLE referral_rewards 
      ADD COLUMN reward_level INTEGER NOT NULL DEFAULT 1 
      CONSTRAINT chk_referral_reward_level CHECK (reward_level IN (1, 2));
  END IF;

  -- Add event_type column to explicitly mark qualifying deposit trigger vs adjustments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_rewards' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE referral_rewards 
      ADD COLUMN event_type TEXT NOT NULL DEFAULT 'qualifying_deposit'
      CONSTRAINT chk_referral_reward_event_type CHECK (event_type IN ('qualifying_deposit', 'manual_adjustment', 'reversal'));
  END IF;
END $$;

-- ==============================================================================
-- 2. One-Time Reward Protection per Referral / Deposit / Level
-- ==============================================================================
-- Migration 008 created uq_referral_reward_per_deposit UNIQUE (deposit_id).
-- In a 2-tier tree (A -> B -> C), C's qualifying deposit legitimately generates
-- an L1 reward for B and an L2 reward for A from the same deposit_id.
-- We safely replace the single-column deposit constraint with a composite constraint
-- guaranteeing at most one reward per (deposit_id, reward_level) and per (referrer_id, deposit_id).
DO $$
BEGIN
  -- Safely drop legacy 1-level-only unique constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_referral_reward_per_deposit'
  ) THEN
    ALTER TABLE referral_rewards DROP CONSTRAINT uq_referral_reward_per_deposit;
  END IF;

  -- Add composite unique constraint: exactly one reward per deposit_id per reward_level
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_referral_reward_deposit_level'
  ) THEN
    ALTER TABLE referral_rewards 
      ADD CONSTRAINT uq_referral_reward_deposit_level UNIQUE (deposit_id, reward_level);
  END IF;

  -- Verify or add constraint: a referrer cannot receive multiple rewards for the same deposit
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_referral_reward_referrer_deposit'
  ) THEN
    ALTER TABLE referral_rewards 
      ADD CONSTRAINT uq_referral_reward_referrer_deposit UNIQUE (referrer_id, deposit_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_referral_rewards_deposit_level ON referral_rewards(deposit_id, reward_level);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_reward_level ON referral_rewards(reward_level);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_event_type ON referral_rewards(event_type);

-- ==============================================================================
-- 3. Referral Relationship Hardening: One Referred User -> One Direct Referrer
-- ==============================================================================
-- In migration 008, uq_referred_user_single_referrer UNIQUE (referred_id) was introduced.
-- We ensure both the unique constraint and non-self-referral constraint are active.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_referred_user_single_referrer'
  ) THEN
    ALTER TABLE referrals 
      ADD CONSTRAINT uq_referred_user_single_referrer UNIQUE (referred_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_referral_no_self_ref'
  ) THEN
    ALTER TABLE referrals 
      ADD CONSTRAINT chk_referral_no_self_ref CHECK (referrer_id <> referred_id);
  END IF;
END $$;

-- ==============================================================================
-- 4. Withdrawal Table Default Alignment
-- ==============================================================================
-- Update withdrawal fee percentage default to 9.0000%
ALTER TABLE withdrawals ALTER COLUMN fee_percentage SET DEFAULT 9.0000;

-- ==============================================================================
-- 5. Configurable System Settings Defaults
-- ==============================================================================
-- Configurable company master referral code (defaults to 'FINEXJ' if not already set)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('companyReferralCode', 'FINEXJ', NOW())
ON CONFLICT (key) DO NOTHING;

-- Configurable withdrawal fee percentage (authoritative 9%)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('withdrawalFeePercentage', '9', NOW())
ON CONFLICT (key) DO UPDATE SET value = '9', updated_at = NOW();

-- Minimum qualifying deposit amount ($300)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('minimumDepositAmount', '300', NOW())
ON CONFLICT (key) DO NOTHING;

-- Configurable Level 1 and Level 2 referral percentage settings
-- Left fully configurable by admins without hardcoding into schema business logic
INSERT INTO system_settings (key, value, updated_at)
VALUES ('referralRewardL1Percentage', '5.0000', NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value, updated_at)
VALUES ('referralRewardL2Percentage', '2.0000', NOW())
ON CONFLICT (key) DO NOTHING;

-- ==============================================================================
-- 6. Dedicated Admin-Only FINEXJ Operational Fund Ledger Table
-- ==============================================================================
-- The user ledger (public.ledger) is strictly bound to individual user accounts (user_id).
-- The finexj_operational_ledger table tracks company-level capital adjustments,
-- retained withdrawal fees (9%), and operational expenses with full audit history.
CREATE TABLE IF NOT EXISTS finexj_operational_ledger (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(18, 4) NOT NULL,
  direction TEXT NOT NULL CONSTRAINT chk_finexj_op_direction CHECK (direction IN ('inflow', 'outflow')),
  reason TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  reference TEXT,
  before_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  after_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finexj_op_ledger_created ON finexj_operational_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finexj_op_ledger_direction ON finexj_operational_ledger(direction);
CREATE INDEX IF NOT EXISTS idx_finexj_op_ledger_admin ON finexj_operational_ledger(admin_id);
CREATE INDEX IF NOT EXISTS idx_finexj_op_ledger_reference ON finexj_operational_ledger(reference) WHERE reference IS NOT NULL;

-- ==============================================================================
-- 7. Row-Level Security (RLS) Enforcement
-- ==============================================================================
ALTER TABLE finexj_operational_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Service role and server backend full access policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'finexj_operational_ledger' 
    AND policyname = 'Allow server access to finexj_operational_ledger'
  ) THEN
    CREATE POLICY "Allow server access to finexj_operational_ledger" 
      ON finexj_operational_ledger FOR ALL 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;
