-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 005: ATOMIC TRANSACTIONAL PROCEDURES
-- Atomic procedures with row-level locks (FOR UPDATE) for Withdrawals, Deposits, and Admin Balance Adjustments
-- ==============================================================================

-- 1. Atomic Withdrawal Creation (PostgreSQL Transaction with Row-Level Locking & 6% Authoritative Fee)
CREATE OR REPLACE FUNCTION create_withdrawal_atomic(
  p_user_id INTEGER,
  p_requested_amount NUMERIC,
  p_destination_address TEXT,
  p_reference TEXT,
  p_idempotency_key TEXT,
  p_user_notes TEXT,
  p_fee_percentage NUMERIC DEFAULT 6.0000,
  p_fee_amount NUMERIC DEFAULT NULL,
  p_net_amount NUMERIC DEFAULT NULL,
  p_fund_lock_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_total_deposited NUMERIC := 0;
  v_total_earnings NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_total_pending_withdrawn NUMERIC := 0;
  v_locked_principal NUMERIC := 0;
  v_available_balance NUMERIC := 0;
  v_eligible_balance NUMERIC := 0;
  v_existing_wd withdrawals%ROWTYPE;
  v_new_wd withdrawals%ROWTYPE;
  v_lock_until TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_fee_pct NUMERIC := 6.0000;
  v_fee_amt NUMERIC := 0.0000;
  v_net_amt NUMERIC := 0.0000;
  v_clean_ref TEXT;
  v_dest TEXT;
BEGIN
  -- Validate destination address format
  v_dest := TRIM(p_destination_address);
  IF v_dest IS NULL OR v_dest !~* '^0x[a-fA-F0-9]{40}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid BEP-20 destination address format. Must be a 0x-prefixed 40-hex character BNB Smart Chain address.');
  END IF;

  -- Validate amount
  IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal amount must be greater than 0 USDT.');
  END IF;

  -- 1. Check idempotency key
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_wd FROM withdrawals WHERE idempotency_key = TRIM(p_idempotency_key) LIMIT 1;
    IF FOUND THEN
      IF v_existing_wd.user_id != p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key conflict: key belongs to another account.');
      END IF;
      IF v_existing_wd.requested_amount != p_requested_amount OR LOWER(v_existing_wd.destination_address) != LOWER(v_dest) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Idempotency key reuse conflict: request parameters do not match original request.');
      END IF;
      RETURN jsonb_build_object('success', true, 'is_duplicate', true, 'withdrawal', to_jsonb(v_existing_wd));
    END IF;
  END IF;

  -- 2. Lock user row for update
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found');
  END IF;

  IF v_user.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Account is currently %s.', v_user.status));
  END IF;

  -- 3. Check 30-Day Account Maturity Rule
  IF v_user.created_at + INTERVAL '30 days' > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawals require account maturity of at least 30 full days from registration.');
  END IF;

  -- 4. Check active user-level fund lock
  IF v_user.fund_lock_until IS NOT NULL AND v_user.fund_lock_until > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', '30-Day post-withdrawal fund lock is active on this account.');
  END IF;

  -- 5. Calculate confirmed deposits, earnings, and withdrawals
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal FROM deposits WHERE user_id = p_user_id AND status = 'confirmed' AND (COALESCE(confirmed_at, created_at) + INTERVAL '30 days' > v_now);

  v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;
  v_eligible_balance := GREATEST(0, v_available_balance - v_locked_principal);

  IF p_requested_amount > v_eligible_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Insufficient eligible balance. Requested: %s USDT, Eligible: %s USDT', p_requested_amount, v_eligible_balance));
  END IF;

  -- 6. Canonical 6% Fee Calculation
  v_fee_pct := 6.0000;
  v_fee_amt := ROUND(p_requested_amount * 0.0600, 4);
  v_net_amt := p_requested_amount - v_fee_amt;
  v_clean_ref := COALESCE(p_reference, 'WD-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)));

  -- 7. Insert withdrawal
  INSERT INTO withdrawals (
    user_id, amount, requested_amount, fee_percentage, fee_amount, net_amount,
    currency, network, destination_address, status, reference, idempotency_key, user_notes, created_at
  ) VALUES (
    p_user_id, p_requested_amount, p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt,
    'USDT', 'BEP-20', v_dest, 'pending', v_clean_ref, p_idempotency_key, p_user_notes, v_now
  ) RETURNING * INTO v_new_wd;

  -- 8. Insert double-entry ledger debit
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_user_id, 'withdrawal_request', -p_requested_amount, v_available_balance - p_requested_amount,
    v_new_wd.id::TEXT, format('Withdrawal request submitted for %s USDT (6%% Fee: %s USDT, Net: %s USDT)', p_requested_amount, v_fee_amt, v_net_amt),
    p_user_id::TEXT, v_now
  );

  -- 9. Activate 30-Day Post-Withdrawal Fund Lock
  v_lock_until := v_now + (COALESCE(p_fund_lock_days, 30) || ' days')::INTERVAL;
  UPDATE users SET
    fund_lock_until = v_lock_until,
    fund_lock_reason = format('%s-Day Post-Withdrawal Fund Lock (%s)', COALESCE(p_fund_lock_days, 30), v_clean_ref),
    last_withdrawal_at = v_now,
    updated_at = v_now
  WHERE id = p_user_id;

  -- 10. Audit Log
  INSERT INTO audit_logs (
    action, actor_id, actor_email, actor_role, target_user_id, reason, created_at
  ) VALUES (
    'WITHDRAWAL_REQUESTED', p_user_id::TEXT, v_user.email, v_user.role, p_user_id::TEXT,
    format('User requested withdrawal of %s USDT to %s', p_requested_amount, v_dest), v_now
  );

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_new_wd));
END;
$$;

-- 2. Atomic Admin Withdrawal Status Processing
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
BEGIN
  SELECT * INTO v_wd FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Withdrawal record (%s) not found.', p_withdrawal_id));
  END IF;

  IF v_wd.status IN ('paid', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot modify a withdrawal that is already paid and completed.');
  END IF;

  IF v_wd.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot modify a withdrawal that has already been rejected.');
  END IF;

  IF p_new_status = 'paid' THEN
    IF p_tx_hash IS NULL OR TRIM(p_tx_hash) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'BNB Smart Chain Payout Transaction Hash (TxID) is required to mark withdrawal as paid.');
    END IF;

    v_normalized_tx := TRIM(p_tx_hash);
    IF v_normalized_tx !~* '^0x[a-fA-F0-9]{64}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid BEP-20 payout transaction hash format.');
    END IF;

    SELECT id INTO v_dup_id FROM withdrawals 
    WHERE (LOWER(tx_hash) = LOWER(v_normalized_tx) OR LOWER(payout_tx_hash) = LOWER(v_normalized_tx)) 
      AND id != p_withdrawal_id 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s has already been assigned to withdrawal #%s.', v_normalized_tx, v_dup_id));
    END IF;

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
    UPDATE withdrawals SET
      status = 'rejected',
      rejection_reason = p_admin_notes,
      admin_notes = p_admin_notes,
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;

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
    UPDATE withdrawals SET
      status = p_new_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;
  END IF;

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

-- 3. Atomic Deposit Confirmation
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
  v_available_balance NUMERIC := 0;
  v_total_deposited NUMERIC := 0;
  v_total_earnings NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_total_pending_withdrawn NUMERIC := 0;
BEGIN
  SELECT * INTO v_dep FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Deposit record %s not found in database', p_deposit_id));
  END IF;

  IF v_dep.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'is_duplicate', true, 'error', 'This deposit has already been confirmed.');
  END IF;

  SELECT * INTO v_user FROM users WHERE id = v_dep.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Associated user account not found');
  END IF;

  UPDATE deposits SET
    status = 'confirmed',
    confirmed_at = v_now,
    verified_at = v_now,
    notes = COALESCE(p_admin_notes, notes),
    tx_hash = COALESCE(p_tx_hash, tx_hash),
    from_address = COALESCE(p_from_address, from_address),
    block_number = COALESCE(p_block_number, block_number),
    token_contract = COALESCE(p_token_contract, token_contract),
    confirmations = COALESCE(p_confirmations, GREATEST(confirmations, 12)),
    actual_amount = COALESCE(p_actual_amount, actual_amount, amount),
    amount = COALESCE(p_actual_amount, amount),
    updated_at = v_now
  WHERE id = p_deposit_id
  RETURNING * INTO v_dep;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = v_dep.user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = v_dep.user_id AND status = 'credited';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;

  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    v_dep.user_id, 'deposit', v_dep.amount, v_available_balance, v_dep.id::TEXT,
    format('Confirmed BEP-20 USDT deposit of %s USDT (Tx: %s)', v_dep.amount, v_dep.tx_hash),
    p_admin_id, v_now
  );

  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, created_at
  ) VALUES (
    'DEPOSIT_APPROVED', p_admin_id, 'admin', v_dep.user_id::TEXT,
    COALESCE(p_admin_notes, format('Confirmed deposit #%s for %s USDT on BNB Smart Chain (Tx: %s)', p_deposit_id, v_dep.amount, v_dep.tx_hash)),
    v_now
  );

  RETURN jsonb_build_object('success', true, 'deposit', to_jsonb(v_dep));
END;
$$;

-- 4. Atomic Admin Balance Adjustment (Hardened Double-Entry Ledger & Concurrency Lock)
CREATE OR REPLACE FUNCTION adjust_user_balance_atomic(
  p_admin_id TEXT,
  p_admin_email TEXT,
  p_admin_role TEXT,
  p_target_user_id INTEGER,
  p_amount NUMERIC,
  p_reason TEXT,
  p_adjustment_type TEXT DEFAULT 'credit',
  p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_ref_id TEXT;
  v_total_deposited NUMERIC := 0;
  v_total_earnings NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_total_pending_withdrawn NUMERIC := 0;
  v_available_balance NUMERIC := 0;
  v_balance_after NUMERIC := 0;
  v_new_ledger ledger%ROWTYPE;
  v_new_audit audit_logs%ROWTYPE;
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user ID is required.');
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment amount must be a non-zero number.');
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A specific reason is mandatory for administrative balance adjustments.');
  END IF;

  -- Lock target user row for update
  SELECT * INTO v_user FROM users WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Target user #%s not found in database.', p_target_user_id));
  END IF;

  -- Calculate current balance from ledger sources
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_target_user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_target_user_id AND status = 'credited';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_target_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_target_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  v_available_balance := v_total_deposited + v_total_earnings - v_total_withdrawn - v_total_pending_withdrawn;
  v_balance_after := v_available_balance + p_amount;

  v_ref_id := COALESCE(p_reference_id, 'ADJ-' || EXTRACT(EPOCH FROM v_now)::BIGINT || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)));

  -- Insert immutable double-entry ledger entry
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_target_user_id, 'admin_adjustment', p_amount, v_balance_after, v_ref_id,
    format('Admin balance adjustment (%s): %s', UPPER(p_adjustment_type), TRIM(p_reason)),
    p_admin_id, v_now
  ) RETURNING * INTO v_new_ledger;

  -- Insert audit log record
  INSERT INTO audit_logs (
    action, actor_id, actor_email, actor_role, target_user_id, reason, before_value, after_value, reference_id, created_at
  ) VALUES (
    'ADMIN_BALANCE_ADJUSTMENT', p_admin_id, COALESCE(p_admin_email, 'admin'), COALESCE(p_admin_role, 'super_admin'),
    p_target_user_id::TEXT, TRIM(p_reason),
    jsonb_build_object('availableBalance', v_available_balance),
    jsonb_build_object('availableBalance', v_balance_after, 'amount', p_amount, 'referenceId', v_ref_id, 'type', p_adjustment_type),
    v_ref_id, v_now
  ) RETURNING * INTO v_new_audit;

  RETURN jsonb_build_object(
    'success', true,
    'referenceId', v_ref_id,
    'amount', p_amount,
    'previousBalance', v_available_balance,
    'newBalance', v_balance_after,
    'ledgerId', v_new_ledger.id,
    'auditLogId', v_new_audit.id
  );
END;
$$;
