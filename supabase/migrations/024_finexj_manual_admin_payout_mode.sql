-- ==============================================================================
-- Migration 023: Manual Admin Withdrawal Payout Mode & State Machine Hardening
-- Step 53: Safe Production Manual Payout Workflow
--
-- Actions:
-- 1. Updates process_withdrawal_status_atomic to recognize the complete manual payout state lifecycle:
--    - 'pending'
--    - 'under_review'
--    - 'approved'
--    - 'manual_payment_pending'
--    - 'processing'
--    - 'payment_submitted'
--    - 'payment_verified'
--    - 'paid' / 'completed'
--    - 'rejected'
--    - 'cancelled'
-- 2. Enforces terminal states: completed/paid, rejected, and cancelled cannot be reopened.
-- 3. Enforces strict anti-replay on submitted payout transaction hashes (across both withdrawals and deposits).
-- 4. Guarantees ACID-level concurrency control with SELECT FOR UPDATE row-level locking.
-- ==============================================================================

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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wd withdrawals%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_normalized_tx TEXT;
  v_dup_id INTEGER;
  v_available_balance NUMERIC(18, 4) := 0.0000;
  v_current_status TEXT;
  v_target_status TEXT;
  v_is_valid_transition BOOLEAN := false;

  -- Operational fund ledger variables
  v_op_prev_balance NUMERIC(18, 4) := 0.0000;
  v_op_new_balance NUMERIC(18, 4) := 0.0000;
BEGIN
  -- 1. Lock withdrawal row for update to prevent concurrent duplicate processing
  SELECT * INTO v_wd FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Withdrawal record (%s) not found in database.', p_withdrawal_id));
  END IF;

  v_current_status := LOWER(TRIM(v_wd.status));
  v_target_status := LOWER(TRIM(p_new_status));

  -- Normalize alias 'completed' to 'paid'
  IF v_target_status = 'completed' THEN
    v_target_status := 'paid';
  END IF;

  -- 2. Prevent modifications to terminal statuses
  IF v_current_status IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal has already been finalized as paid and cannot be modified.');
  END IF;

  IF v_current_status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal has already been rejected and cannot be modified.');
  END IF;

  IF v_current_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal has already been cancelled and cannot be modified.');
  END IF;

  -- 3. Strict State Transition Enforcement
  IF v_current_status = 'pending' AND v_target_status IN ('under_review', 'approved', 'processing', 'manual_payment_pending', 'payment_submitted', 'payment_verified', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'under_review' AND v_target_status IN ('approved', 'processing', 'manual_payment_pending', 'payment_submitted', 'payment_verified', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'approved' AND v_target_status IN ('processing', 'manual_payment_pending', 'payment_submitted', 'payment_verified', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'manual_payment_pending' AND v_target_status IN ('payment_submitted', 'payment_verified', 'paid', 'processing', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'processing' AND v_target_status IN ('manual_payment_pending', 'payment_submitted', 'payment_verified', 'paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'payment_submitted' AND v_target_status IN ('payment_verified', 'paid', 'manual_payment_pending', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  ELSIF v_current_status = 'payment_verified' AND v_target_status IN ('paid', 'rejected', 'cancelled') THEN
    v_is_valid_transition := true;
  END IF;

  IF NOT v_is_valid_transition THEN
    RETURN jsonb_build_object('success', false, 'error', format('Invalid status transition from ''%s'' to ''%s''.', v_current_status, v_target_status));
  END IF;

  -- 4. Paid / Completed Status Processing & Anti-Replay
  IF v_target_status = 'paid' THEN
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

    -- Anti-Replay: Check deposit table
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

    -- Double-Entry Ledger Finalization for user
    IF NOT EXISTS (SELECT 1 FROM ledger WHERE reference_id = v_wd.id::TEXT AND type = 'withdrawal_paid') THEN
      SELECT (
        COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_wd.user_id AND status = 'confirmed'), 0) +
        COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_wd.user_id AND status = 'credited'), 0) +
        COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_wd.user_id AND status = 'credited'), 0) +
        COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_wd.user_id AND type = 'admin_adjustment'), 0) -
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('paid', 'completed')), 0) -
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review', 'manual_payment_pending', 'payment_submitted', 'payment_verified')), 0)
      ) INTO v_available_balance;

      INSERT INTO ledger (
        user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
      ) VALUES (
        v_wd.user_id, 'withdrawal_paid', 0, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal payout dispatched via BEP-20 (Tx: %s). Net Paid: %s USDT (%s%% Fee: %s USDT retained by FINEXJ)', v_normalized_tx, v_wd.net_amount, v_wd.fee_percentage, v_wd.fee_amount),
        p_admin_id, v_now
      );
    END IF;

    -- Operational Fund Fee Recording (100% Retained by FINEXJ)
    IF v_wd.fee_amount > 0 AND NOT EXISTS (
      SELECT 1 FROM finexj_operational_ledger 
      WHERE reference = 'WD-FEE-' || v_wd.id::TEXT
    ) THEN
      SELECT COALESCE(after_balance, 0.0000) INTO v_op_prev_balance 
      FROM finexj_operational_ledger 
      ORDER BY created_at DESC, id DESC 
      LIMIT 1;

      v_op_prev_balance := COALESCE(v_op_prev_balance, 0.0000);
      v_op_new_balance := v_op_prev_balance + v_wd.fee_amount;

      INSERT INTO finexj_operational_ledger (
        amount, direction, reason, admin_id, reference, before_balance, after_balance, created_at
      ) VALUES (
        v_wd.fee_amount, 'inflow',
        format('Withdrawal fee collected (%s%%) from withdrawal #%s (Reference: %s)', v_wd.fee_percentage, v_wd.id, v_wd.reference),
        p_admin_id, 'WD-FEE-' || v_wd.id::TEXT, v_op_prev_balance, v_op_new_balance, v_now
      );

      INSERT INTO audit_logs (
        action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
      ) VALUES (
        'WITHDRAWAL_FEE_COLLECTED', p_admin_id, 'admin', v_wd.user_id::TEXT,
        format('FINEXJ retained %s USDT withdrawal fee (%s%%) from withdrawal #%s', v_wd.fee_amount, v_wd.fee_percentage, v_wd.id),
        'WD-FEE-' || v_wd.id::TEXT, v_now
      );
    END IF;

  -- 5. Rejected Status Processing
  ELSIF v_target_status = 'rejected' THEN
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
      SELECT (
        COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_wd.user_id AND status = 'confirmed'), 0) +
        COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_wd.user_id AND status = 'credited'), 0) +
        COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_wd.user_id AND status = 'credited'), 0) +
        COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_wd.user_id AND type = 'admin_adjustment'), 0) -
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('paid', 'completed')), 0) -
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review', 'manual_payment_pending', 'payment_submitted', 'payment_verified')), 0)
      ) INTO v_available_balance;

      INSERT INTO ledger (
        user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
      ) VALUES (
        v_wd.user_id, 'withdrawal_rejected', v_wd.requested_amount, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal request rejected by administrator. Refunded %s USDT. Reason: %s', v_wd.requested_amount, COALESCE(p_admin_notes, 'Verification failed')),
        p_admin_id, v_now
      );
    END IF;

  -- 6. Cancelled Status Processing
  ELSIF v_target_status = 'cancelled' THEN
    UPDATE withdrawals SET
      status = 'cancelled',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;

    -- Refund held withdrawal amount to user balance
    IF NOT EXISTS (SELECT 1 FROM ledger WHERE reference_id = v_wd.id::TEXT AND type = 'withdrawal_cancelled') THEN
      SELECT (
        COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_wd.user_id AND status = 'confirmed'), 0) +
        COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_wd.user_id AND status = 'credited'), 0) +
        COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_wd.user_id AND status = 'credited'), 0) +
        COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_wd.user_id AND type = 'admin_adjustment'), 0) -
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('paid', 'completed')), 0) -
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review', 'manual_payment_pending', 'payment_submitted', 'payment_verified')), 0)
      ) INTO v_available_balance;

      INSERT INTO ledger (
        user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
      ) VALUES (
        v_wd.user_id, 'withdrawal_cancelled', v_wd.requested_amount, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal request cancelled. Refunded %s USDT. Reason: %s', v_wd.requested_amount, COALESCE(p_admin_notes, 'Cancelled by user or administrator')),
        p_admin_id, v_now
      );
    END IF;

  -- 7. Payment Submitted / Manual Payment Pending / Processing / Approved Status
  ELSE
    IF p_tx_hash IS NOT NULL AND TRIM(p_tx_hash) != '' THEN
      v_normalized_tx := LOWER(TRIM(p_tx_hash));
    ELSE
      v_normalized_tx := v_wd.tx_hash;
    END IF;

    UPDATE withdrawals SET
      status = v_target_status,
      tx_hash = v_normalized_tx,
      payout_tx_hash = COALESCE(v_normalized_tx, payout_tx_hash),
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_at = COALESCE(reviewed_at, v_now),
      reviewed_by = COALESCE(reviewed_by, p_admin_id),
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal', row_to_json(v_wd)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION process_withdrawal_status_atomic(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_withdrawal_status_atomic(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO service_role;
