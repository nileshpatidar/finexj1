-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 006: FINAL PRODUCTION HARDENING PASS
-- Withdrawal State Machine, Database Integrity Constraints & Concurrency Protection
-- ==============================================================================

DO $$
BEGIN
  -- 1. Ensure all financial columns use PostgreSQL NUMERIC(18, 4) precision
  ALTER TABLE IF EXISTS deposits ALTER COLUMN amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS deposits ALTER COLUMN actual_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS withdrawals ALTER COLUMN requested_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS withdrawals ALTER COLUMN fee_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS withdrawals ALTER COLUMN net_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS withdrawals ALTER COLUMN fee_percentage TYPE NUMERIC(8, 4);
  ALTER TABLE IF EXISTS ledger ALTER COLUMN amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS ledger ALTER COLUMN balance_after TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS earnings ALTER COLUMN earnings_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS earnings ALTER COLUMN payout_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS earnings ALTER COLUMN active_principal TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS earnings ALTER COLUMN base_eligible_amount TYPE NUMERIC(18, 4);
  ALTER TABLE IF EXISTS earnings ALTER COLUMN rate_percentage TYPE NUMERIC(12, 6);
  ALTER TABLE IF EXISTS daily_performances ALTER COLUMN rate_percentage TYPE NUMERIC(12, 6);
  ALTER TABLE IF EXISTS daily_performances ALTER COLUMN applicable_rate TYPE NUMERIC(12, 6);
  ALTER TABLE IF EXISTS daily_performances ALTER COLUMN actual_fund_performance TYPE NUMERIC(12, 6);
  ALTER TABLE IF EXISTS daily_performances ALTER COLUMN overall_fund_amount TYPE NUMERIC(18, 4);
END $$;

-- 2. Unique Constraints & Anti-Replay Indexes (Case-Insensitive for hashes and emails)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_uniq ON users (LOWER(TRIM(email)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_uniq ON users (referral_code) WHERE referral_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash_lower_uniq ON deposits (LOWER(TRIM(tx_hash))) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_tx_hash_lower_uniq ON withdrawals (LOWER(TRIM(tx_hash))) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_payout_tx_hash_lower_uniq ON withdrawals (LOWER(TRIM(payout_tx_hash))) WHERE payout_tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency_key_uniq ON withdrawals (TRIM(idempotency_key)) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_daily_perf_uniq ON earnings (user_id, daily_performance_id) WHERE daily_performance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_date_uniq ON earnings (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_user_ref_type_uniq ON ledger (user_id, reference_id, type) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_key_uniq ON system_settings(key);

-- 3. Query Performance & Concurrency Indexes
CREATE INDEX IF NOT EXISTS idx_deposits_user_status ON deposits(user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON withdrawals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_user_status ON earnings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created ON audit_logs(target_user_id, created_at DESC);

-- 4. Authoritative Withdrawal State Machine & Verification Procedure (Atomic with Row-Level Locks)
CREATE OR REPLACE FUNCTION process_withdrawal_status_atomic(
  p_admin_id TEXT,
  p_admin_role TEXT,
  p_withdrawal_id INTEGER,
  p_new_status TEXT,
  p_tx_hash TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_wd withdrawals%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_normalized_tx TEXT;
  v_dup_id INTEGER;
  v_total_deposited NUMERIC := 0;
  v_total_earnings NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_total_pending_withdrawn NUMERIC := 0;
  v_available_balance NUMERIC := 0;
  v_current_status TEXT;
  v_is_valid_transition BOOLEAN := false;
BEGIN
  -- 1. Lock withdrawal row for update to prevent race conditions
  SELECT * INTO v_wd FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Withdrawal record (%s) not found in database.', p_withdrawal_id));
  END IF;

  v_current_status := v_wd.status;

  -- 2. State Machine Terminal State Protection
  IF v_current_status IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Terminal State Violation: Cannot modify a withdrawal that is already paid and finalized.');
  END IF;

  IF v_current_status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Terminal State Violation: Cannot modify a withdrawal that has already been rejected.');
  END IF;

  IF v_current_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Terminal State Violation: Cannot modify a withdrawal that has been cancelled.');
  END IF;

  -- 3. Validate Permitted State Transitions
  IF v_current_status = 'pending' AND p_new_status IN ('under_review', 'approved', 'processing', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'under_review' AND p_new_status IN ('approved', 'processing', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'approved' AND p_new_status IN ('processing', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'processing' AND p_new_status IN ('paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  END IF;

  IF NOT v_is_valid_transition THEN
    RETURN jsonb_build_object('success', false, 'error', format('Invalid status transition from ''%s'' to ''%s''.', v_current_status, p_new_status));
  END IF;

  -- 4. Paid Status Hardening & Anti-Replay Protection
  IF p_new_status = 'paid' THEN
    IF p_tx_hash IS NULL OR TRIM(p_tx_hash) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'BNB Smart Chain Payout Transaction Hash (TxID) is required to mark withdrawal as paid.');
    END IF;

    v_normalized_tx := LOWER(TRIM(p_tx_hash));
    IF v_normalized_tx !~* '^0x[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid BEP-20 payout transaction hash format. Must be a 0x-prefixed 64-hex character string.');
    END IF;

    -- Anti-Replay: Check withdrawal table
    SELECT id INTO v_dup_id FROM withdrawals 
    WHERE (LOWER(TRIM(COALESCE(tx_hash, ''))) = v_normalized_tx OR LOWER(TRIM(COALESCE(payout_tx_hash, ''))) = v_normalized_tx) 
      AND id != p_withdrawal_id 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s has already been assigned to withdrawal #%s.', v_normalized_tx, v_dup_id));
    END IF;

    -- Anti-Replay: Check deposit table (payout hash must not collide with deposit hash)
    SELECT id INTO v_dup_id FROM deposits 
    WHERE LOWER(TRIM(COALESCE(tx_hash, ''))) = v_normalized_tx 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s is already associated with deposit #%s and cannot be reused for a payout.', v_normalized_tx, v_dup_id));
    END IF;

    -- Update withdrawal to paid
    UPDATE withdrawals SET
      status = 'paid',
      tx_hash = v_normalized_tx,
      payout_tx_hash = v_normalized_tx,
      paid_at = v_now,
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;

    -- Double-Entry Ledger Finalization
    IF NOT EXISTS (SELECT 1 FROM ledger WHERE reference_id = v_wd.id::TEXT AND type = 'withdrawal_paid') THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = v_wd.user_id AND status = 'confirmed';
      SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = v_wd.user_id AND status = 'credited';
      SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('paid', 'completed');
      SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
      v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;

      INSERT INTO ledger (
        user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
      ) VALUES (
        v_wd.user_id, 'withdrawal_paid', 0, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal payout dispatched via BEP-20 (Tx: %s). Net Paid: %s USDT', v_normalized_tx, v_wd.net_amount),
        p_admin_id, v_now
      );
    END IF;

  ELSIF p_new_status = 'rejected' THEN
    -- Update withdrawal to rejected
    UPDATE withdrawals SET
      status = 'rejected',
      rejection_reason = p_admin_notes,
      admin_notes = p_admin_notes,
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;

    -- Refund held withdrawal amount to user balance
    IF NOT EXISTS (SELECT 1 FROM ledger WHERE reference_id = v_wd.id::TEXT AND type = 'withdrawal_rejected') THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = v_wd.user_id AND status = 'confirmed';
      SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = v_wd.user_id AND status = 'credited';
      SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('paid', 'completed');
      SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
      v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;

      INSERT INTO ledger (
        user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
      ) VALUES (
        v_wd.user_id, 'withdrawal_rejected', v_wd.requested_amount, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal request rejected by admin. Refunded %s USDT. Reason: %s', v_wd.requested_amount, COALESCE(p_admin_notes, 'Verification failed')),
        p_admin_id, v_now
      );
    END IF;
  ELSE
    -- Intermediate state transition (e.g. approved, processing, under_review)
    UPDATE withdrawals SET
      status = p_new_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;
  END IF;

  -- 5. Create immutable audit log entry
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, created_at
  ) VALUES (
    format('WITHDRAWAL_%s', UPPER(p_new_status)),
    p_admin_id, COALESCE(p_admin_role, 'admin'), v_wd.user_id::TEXT,
    COALESCE(p_admin_notes, format('Admin updated withdrawal status to %s', p_new_status)), v_now
  );

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_wd));
END;
$$;
