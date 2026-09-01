-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 007: PRODUCTION HARDENING (#21, #22, #23)
-- Deposit Lifecycle, Duplicate Credit Prevention, Daily Yield Integrity & Wallet Security
-- ==============================================================================

DO $$
BEGIN
  -- 1. Ensure Table Check Constraints for Deposits
  ALTER TABLE IF EXISTS deposits DROP CONSTRAINT IF EXISTS chk_deposit_status;
  ALTER TABLE IF EXISTS deposits ADD CONSTRAINT chk_deposit_status 
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'confirming'));

  ALTER TABLE IF EXISTS deposits DROP CONSTRAINT IF EXISTS chk_deposit_amount_positive;
  ALTER TABLE IF EXISTS deposits ADD CONSTRAINT chk_deposit_amount_positive 
    CHECK (amount >= 0);

  -- 2. Ensure Table Check Constraints for Earnings
  ALTER TABLE IF EXISTS earnings DROP CONSTRAINT IF EXISTS chk_earnings_status;
  ALTER TABLE IF EXISTS earnings ADD CONSTRAINT chk_earnings_status 
    CHECK (status IN ('credited', 'reversed', 'pending'));

  -- 3. Ensure Table Check Constraints for Withdrawals
  ALTER TABLE IF EXISTS withdrawals DROP CONSTRAINT IF EXISTS chk_withdrawal_status;
  ALTER TABLE IF EXISTS withdrawals ADD CONSTRAINT chk_withdrawal_status 
    CHECK (status IN ('pending', 'under_review', 'approved', 'processing', 'paid', 'completed', 'rejected', 'cancelled'));

  ALTER TABLE IF EXISTS withdrawals DROP CONSTRAINT IF EXISTS chk_withdrawal_amount_positive;
  ALTER TABLE IF EXISTS withdrawals ADD CONSTRAINT chk_withdrawal_amount_positive 
    CHECK (requested_amount > 0);
END $$;

-- 4. Case-Insensitive Unique Indexes for Strict Anti-Replay & Anti-Duplicate Protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash_lower_uniq 
  ON deposits (LOWER(TRIM(tx_hash))) WHERE tx_hash IS NOT NULL AND TRIM(tx_hash) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_tx_hash_lower_uniq 
  ON withdrawals (LOWER(TRIM(tx_hash))) WHERE tx_hash IS NOT NULL AND TRIM(tx_hash) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_payout_tx_hash_lower_uniq 
  ON withdrawals (LOWER(TRIM(payout_tx_hash))) WHERE payout_tx_hash IS NOT NULL AND TRIM(payout_tx_hash) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency_key_uniq 
  ON withdrawals (TRIM(idempotency_key)) WHERE idempotency_key IS NOT NULL AND TRIM(idempotency_key) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_daily_perf_uniq 
  ON earnings (user_id, daily_performance_id) WHERE daily_performance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_date_uniq 
  ON earnings (user_id, date) WHERE date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_performances_date_uniq 
  ON daily_performances (date);

-- 5. Enhanced Deposit Confirmation Procedure (Atomic, Row-Locked, Double-Credit Guarded)
CREATE OR REPLACE FUNCTION confirm_deposit_atomic(
  p_deposit_id INTEGER,
  p_admin_id TEXT,
  p_admin_notes TEXT,
  p_tx_hash TEXT,
  p_from_address TEXT DEFAULT NULL,
  p_block_number BIGINT DEFAULT NULL,
  p_token_contract TEXT DEFAULT NULL,
  p_confirmations INTEGER DEFAULT NULL,
  p_actual_amount NUMERIC(18, 4) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_dep deposits%ROWTYPE;
  v_user users%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_norm_tx TEXT;
  v_dup_id INTEGER;
  v_available_balance NUMERIC := 0;
  v_total_deposited NUMERIC := 0;
  v_total_earnings NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_total_pending_withdrawn NUMERIC := 0;
  v_final_amount NUMERIC(18, 4);
BEGIN
  -- 1. Lock deposit row for update to prevent concurrent confirmation races
  SELECT * INTO v_dep FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Deposit record #%s not found in database.', p_deposit_id));
  END IF;

  -- 2. State Machine Protection: Terminal state check
  IF v_dep.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'is_duplicate', true, 'error', 'This deposit is already confirmed and credited. Cannot credit again.');
  END IF;

  IF v_dep.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot confirm a deposit that has been rejected.');
  END IF;

  IF v_dep.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot confirm a deposit that has been cancelled.');
  END IF;

  -- 3. Lock associated user account
  SELECT * INTO v_user FROM users WHERE id = v_dep.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('User account #%s associated with this deposit was not found.', v_dep.user_id));
  END IF;

  -- 4. Cross-table Anti-Replay: Verify TX hash uniqueness
  v_norm_tx := LOWER(TRIM(COALESCE(p_tx_hash, v_dep.tx_hash, '')));
  IF v_norm_tx != '' THEN
    -- Check if hash is used by another deposit
    SELECT id INTO v_dup_id FROM deposits 
    WHERE LOWER(TRIM(COALESCE(tx_hash, ''))) = v_norm_tx AND id != p_deposit_id 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s has already been claimed by deposit #%s.', v_norm_tx, v_dup_id));
    END IF;

    -- Check if hash is used by a withdrawal payout
    SELECT id INTO v_dup_id FROM withdrawals 
    WHERE (LOWER(TRIM(COALESCE(tx_hash, ''))) = v_norm_tx OR LOWER(TRIM(COALESCE(payout_tx_hash, ''))) = v_norm_tx) 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s was used for withdrawal payout #%s and cannot be reused for a deposit.', v_norm_tx, v_dup_id));
    END IF;
  END IF;

  -- 5. Determine Authoritative Amount
  v_final_amount := COALESCE(p_actual_amount, v_dep.actual_amount, v_dep.amount);
  IF v_final_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit amount must be greater than 0 USDT.');
  END IF;

  -- 6. Update deposit record to confirmed status
  UPDATE deposits SET
    status = 'confirmed',
    confirmed_at = v_now,
    verified_at = v_now,
    notes = COALESCE(p_admin_notes, notes),
    tx_hash = COALESCE(v_norm_tx, tx_hash),
    from_address = COALESCE(p_from_address, from_address),
    block_number = COALESCE(p_block_number, block_number),
    token_contract = COALESCE(p_token_contract, token_contract),
    confirmations = COALESCE(p_confirmations, GREATEST(COALESCE(confirmations, 0), 12)),
    actual_amount = v_final_amount,
    amount = v_final_amount,
    updated_at = v_now
  WHERE id = p_deposit_id
  RETURNING * INTO v_dep;

  -- 7. Calculate ledger-derived balance
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = v_dep.user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = v_dep.user_id AND status = 'credited';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;

  -- 8. Write immutable double-entry ledger entry
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    v_dep.user_id, 'deposit', v_final_amount, v_available_balance, v_dep.id::TEXT,
    format('Confirmed BEP-20 USDT deposit of %s USDT (Tx: %s)', v_final_amount, v_dep.tx_hash),
    p_admin_id, v_now
  );

  -- 9. Insert immutable audit log record
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, created_at
  ) VALUES (
    'DEPOSIT_CONFIRMED', p_admin_id, 'admin', v_dep.user_id::TEXT,
    COALESCE(p_admin_notes, format('Confirmed deposit #%s for %s USDT on BNB Smart Chain (Tx: %s)', p_deposit_id, v_final_amount, v_dep.tx_hash)),
    v_now
  );

  RETURN jsonb_build_object('success', true, 'deposit', to_jsonb(v_dep));
END;
$$;
