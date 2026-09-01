-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 003: FINANCIAL CONSTRAINTS & DOUBLE-ENTRY LEDGER
-- Canonical 6% Fee, 30-Day Principal Lock, Unique Idempotency & Tx Constraints
-- ==============================================================================

DO $$
BEGIN
  -- Deposits financial constraints
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(18, 4);
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS confirmations INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS required_confirmations INTEGER NOT NULL DEFAULT 12;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deposit_lock_end_date TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS eligibility_date TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS proof_url TEXT;
  ALTER TABLE deposits ADD COLUMN IF NOT EXISTS proof_photo_url TEXT;

  -- Withdrawals financial constraints
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_percentage NUMERIC(8, 4) NOT NULL DEFAULT 6.0000;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS net_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS destination_address TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
  ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

  -- Ledger double-entry constraints
  ALTER TABLE ledger ADD COLUMN IF NOT EXISTS performed_by TEXT;
  ALTER TABLE ledger ADD COLUMN IF NOT EXISTS balance_after NUMERIC(18, 4) NOT NULL DEFAULT 0;
END $$;

-- Enforce Unique Idempotency Keys and Tx Hashes (Partial unique indexes to permit nulls if applicable)
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency_key_uniq ON withdrawals(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash_uniq ON deposits(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_daily_perf ON earnings(user_id, daily_performance_id) WHERE daily_performance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_date ON earnings(user_id, date);

-- Financial System Settings (Canonical defaults)
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('withdrawalFeePercentage', '6', NOW()),
  ('accountAgeRequirementDays', '30', NOW()),
  ('depositLockPeriodDays', '30', NOW()),
  ('minimumDepositAmount', '300', NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
