-- ==============================================================================
-- Migration 016: FINEXJ Step 15 - Atomic Withdrawal State Machine (WD-001)
-- ==============================================================================
-- Hardens withdrawal state machine, concurrency, and payout processing:
-- 1. Strict State Machine transitions: pending -> under_review -> approved -> processing -> paid/rejected.
-- 2. Terminal state protection: paid, completed, rejected, cancelled cannot be re-modified.
-- 3. Cross-Table Anti-Replay: Payout TxHash cannot collide with other withdrawals or deposits.
-- 4. ACID Atomic row locking (FOR UPDATE) preventing double-spend and race conditions.
-- 5. Full Double-Entry ledger consistency: reserves on request, confirms on payout, refunds on rejection.
-- 6. Canonical 9% Fee retention directly credited to finexj_operational_ledger upon payout.
-- ==============================================================================

-- 1. Ensure composite unique constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_withdrawals_idempotency_key_uniq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency_key_uniq
      ON withdrawals (idempotency_key)
      WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_withdrawals_payout_tx_hash_uniq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_payout_tx_hash_uniq
      ON withdrawals (LOWER(TRIM(payout_tx_hash)))
      WHERE payout_tx_hash IS NOT NULL AND payout_tx_hash != '';
  END IF;
END $$;

-- 2. Define or Replace create_withdrawal_atomic
CREATE OR REPLACE FUNCTION create_withdrawal_atomic(
  p_user_id INTEGER,
  p_requested_amount NUMERIC(18, 4),
  p_destination_address TEXT,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_user_notes TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC(8, 4) DEFAULT NULL,
  p_fee_amount NUMERIC(18, 4) DEFAULT NULL,
  p_net_amount NUMERIC(18, 4) DEFAULT NULL,
  p_fund_lock_days INTEGER DEFAULT 0,
  p_confirm_lock_break BOOLEAN DEFAULT FALSE,
  p_confirm_minimum_break BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_new_wd withdrawals%ROWTYPE;
  v_existing_wd withdrawals%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_available_balance NUMERIC(18, 4) := 0.0000;
  v_eligible_balance NUMERIC(18, 4) := 0.0000;
  v_total_deposited NUMERIC(18, 4) := 0.0000;
  v_total_earnings NUMERIC(18, 4) := 0.0000;
  v_total_referral NUMERIC(18, 4) := 0.0000;
  v_total_adjustments NUMERIC(18, 4) := 0.0000;
  v_total_withdrawn NUMERIC(18, 4) := 0.0000;
  v_total_pending_withdrawn NUMERIC(18, 4) := 0.0000;
  v_locked_principal NUMERIC(18, 4) := 0.0000;
  v_raw_fee_setting TEXT;
  v_fee_pct NUMERIC(8, 4);
  v_raw_min_setting TEXT;
  v_min_deposit NUMERIC(18, 4);
  v_fee_amt NUMERIC(18, 4) := 0.0000;
  v_net_amt NUMERIC(18, 4) := 0.0000;
  v_clean_ref TEXT;
  v_dest TEXT;
BEGIN
  -- Validate destination address format
  v_dest := TRIM(p_destination_address);
  IF v_dest IS NULL OR v_dest !~* '^0x[a-fA-F0-9]{40}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid BEP-20 destination address format. Must be a 0x-prefixed 40-hex character BNB Smart Chain address.');
  END IF;

  -- Validate requested amount
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal amount must be greater than 0 USDT.');
  END IF;

  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_wd FROM withdrawals WHERE idempotency_key = TRIM(p_idempotency_key) LIMIT 1;
    IF FOUND THEN
      IF v_existing_wd.user_id != p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key conflict: key belongs to another account.');
      END IF;
      IF ABS(v_existing_wd.requested_amount - p_requested_amount) > 0.0001 OR LOWER(v_existing_wd.destination_address) != LOWER(v_dest) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key reuse conflict: request parameters do not match original request.');
      END IF;
      RETURN jsonb_build_object('success', true, 'is_duplicate', true, 'withdrawal', to_jsonb(v_existing_wd));
    END IF;
  END IF;

  -- 2. Lock user row for update
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found.');
  END IF;

  IF v_user.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Account is currently %s. Withdrawals are disabled.', v_user.status));
  END IF;

  -- 3. STRICT CONFIGURATION SAFETY: Read withdrawalFeePercentage
  SELECT value INTO v_raw_fee_setting FROM system_settings WHERE key = 'withdrawalFeePercentage';
  IF v_raw_fee_setting IS NULL OR TRIM(v_raw_fee_setting) = '' THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_user_id::TEXT, 'system', p_user_id::TEXT, 'Missing required setting withdrawalFeePercentage in create_withdrawal_atomic', v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: withdrawalFeePercentage is missing in system settings. Transaction aborted.');
  END IF;

  BEGIN
    v_fee_pct := v_raw_fee_setting::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_user_id::TEXT, 'system', p_user_id::TEXT, format('Invalid non-numeric withdrawalFeePercentage (%s)', v_raw_fee_setting), v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: withdrawalFeePercentage is non-numeric in system settings. Transaction aborted.');
  END;

  IF v_fee_pct < 0 OR v_fee_pct >= 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: withdrawalFeePercentage must be between 0% and 100%.');
  END IF;

  -- 4. Calculate available balances with row-lock consistency
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_referral FROM referral_rewards WHERE referrer_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_adjustments FROM ledger WHERE user_id = p_user_id AND type = 'admin_adjustment';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal FROM deposits WHERE user_id = p_user_id AND status = 'confirmed' AND (COALESCE(confirmed_at, created_at) + INTERVAL '30 days' > v_now);

  v_available_balance := v_total_deposited + v_total_earnings + v_total_referral + v_total_adjustments - v_total_withdrawn - v_total_pending_withdrawn;
  
  -- Referral income can always be withdrawn; non-referral principal has 30-day lock
  v_eligible_balance := GREATEST(0.0000, v_available_balance - v_locked_principal);

  IF p_requested_amount > v_available_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Insufficient available balance. Requested: %s USDT, Available: %s USDT', p_requested_amount, v_available_balance));
  END IF;

  IF p_requested_amount > v_eligible_balance AND NOT p_confirm_lock_break THEN
    RETURN jsonb_build_object('success', false, 'requires_confirmation', true, 'warning_type', 'LOCK_BREAK_WARNING',
      'error', format('Withdrawal touches locked deposit principal (%s USDT locked for 30 days). Confirmation required.', v_locked_principal));
  END IF;

  -- Compute fee and net amount
  v_fee_amt := ROUND(p_requested_amount * (v_fee_pct / 100.0), 4);
  v_net_amt := p_requested_amount - v_fee_amt;
  v_clean_ref := COALESCE(p_reference, 'WD-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)));

  -- 5. Insert withdrawal record
  INSERT INTO withdrawals (
    user_id, amount, requested_amount, fee_percentage, fee_amount, net_amount,
    currency, network, destination_address, status, reference, idempotency_key, user_notes, created_at
  ) VALUES (
    p_user_id, p_requested_amount, p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt,
    'USDT', 'BEP-20', v_dest, 'pending', v_clean_ref, p_idempotency_key, p_user_notes, v_now
  ) RETURNING * INTO v_new_wd;

  -- 6. Insert double-entry ledger debit (reserves total requested amount)
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_user_id, 'withdrawal_request', -p_requested_amount, v_available_balance - p_requested_amount,
    v_new_wd.id::TEXT, format('Withdrawal request submitted for %s USDT (%s%% Fee: %s USDT, Net: %s USDT)', p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt),
    p_user_id::TEXT, v_now
  );

  -- 7. Audit Log
  INSERT INTO audit_logs (
    action, actor_id, actor_email, actor_role, target_user_id, reason, created_at
  ) VALUES (
    'WITHDRAWAL_REQUESTED', p_user_id::TEXT, v_user.email, v_user.role, p_user_id::TEXT,
    format('User requested withdrawal of %s USDT to %s (%s%% fee: %s USDT, net: %s USDT)', p_requested_amount, v_dest, v_fee_pct, v_fee_amt, v_net_amt),
    v_now
  );

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_new_wd));
END;
$$;

-- 3. Define or Replace process_withdrawal_status_atomic
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
AS $$
DECLARE
  v_wd withdrawals%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_normalized_tx TEXT;
  v_dup_id INTEGER;
  v_available_balance NUMERIC(18, 4) := 0.0000;
  v_current_status TEXT;
  v_is_valid_transition BOOLEAN := false;

  -- Operational fund ledger variables
  v_op_prev_balance NUMERIC(18, 4) := 0.0000;
  v_op_new_balance NUMERIC(18, 4) := 0.0000;
BEGIN
  -- 1. Lock withdrawal row for update
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

  -- 4. Paid Status Processing & Anti-Replay
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
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
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
    -- ABSOLUTELY NO referral distribution from withdrawal fee
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

  ELSIF p_new_status = 'rejected' THEN
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
        COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_wd.user_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
      ) INTO v_available_balance;

      INSERT INTO ledger (
        user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
      ) VALUES (
        v_wd.user_id, 'withdrawal_rejected', v_wd.requested_amount, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal request rejected by admin. Refunded %s USDT. Reason: %s', v_wd.requested_amount, COALESCE(p_admin_notes, 'Verification failed')),
        p_admin_id, v_now
      );
    END IF;
  ELSE
    UPDATE withdrawals SET
      status = p_new_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;
  END IF;

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_wd));
END;
$$;
