-- ==============================================================================
-- Migration 030: FINEXJ Canonical Deposit Maturity & Deprecation of Obsolete Account Age Lock
-- ==============================================================================
-- AUTHORITATIVE BUSINESS INVARIANTS:
-- 1. Investment maturity is deposit-specific.
-- 2. Account creation date (users.created_at) has NO role in investment maturity or withdrawal eligibility.
-- 3. Every confirmed/eligible deposit gets its own independent maturity date (deposit_lock_end_date).
-- 4. Current deposit lock period comes ONLY from dynamic settings.depositLockPeriodDays (default 66).
-- 5. Voluntary/administrative fund locks (users.fund_lock_until, users.lock_until) are strictly preserved
--    as account-level security features and are completely decoupled from deposit maturity.
-- ==============================================================================

-- 1. Schema Invariant: Ensure canonical deposit_lock_end_date exists on deposits
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deposit_lock_end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP WITH TIME ZONE;

-- 2. Non-Destructive Data Alignment & Backfill:
-- Synchronize deposit_lock_end_date from lock_expires_at where null
UPDATE deposits 
SET deposit_lock_end_date = lock_expires_at 
WHERE deposit_lock_end_date IS NULL AND lock_expires_at IS NOT NULL;

-- Synchronize lock_expires_at from deposit_lock_end_date where null
UPDATE deposits 
SET lock_expires_at = deposit_lock_end_date 
WHERE lock_expires_at IS NULL AND deposit_lock_end_date IS NOT NULL;

-- Backfill any remaining null maturity dates using confirmed_at/created_at + 66 days
UPDATE deposits
SET deposit_lock_end_date = COALESCE(confirmed_at, created_at) + INTERVAL '66 days',
    lock_expires_at = COALESCE(confirmed_at, created_at) + INTERVAL '66 days'
WHERE deposit_lock_end_date IS NULL;

-- Ensure performance index exists for rapid maturity evaluation
CREATE INDEX IF NOT EXISTS idx_deposits_deposit_lock_end_date ON deposits(deposit_lock_end_date);

-- 3. Update confirm_deposit_atomic to automatically calculate and record deposit_lock_end_date
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
  v_final_amount NUMERIC(18, 4);
  v_available_balance NUMERIC(18, 4) := 0.0000;

  -- Settings & Qualification variables
  v_raw_min_setting TEXT;
  v_min_deposit NUMERIC(18, 4);
  v_is_qualifying BOOLEAN := false;
  v_raw_conf_setting TEXT;
  v_req_conf INTEGER := 12;
  v_raw_lock_setting TEXT;
  v_deposit_lock_days INTEGER := 66;
  v_maturity_date TIMESTAMPTZ;

  -- Level 1 Referrer variables
  v_l1_referral_id INTEGER := NULL;
  v_l1_referrer_id INTEGER := NULL;
  v_raw_l1_setting TEXT;
  v_l1_pct NUMERIC(8, 4);
  v_l1_amount NUMERIC(18, 4) := 0.0000;
  v_l1_ref_code TEXT;

  -- Level 2 Referrer variables
  v_l2_referral_id INTEGER := NULL;
  v_l2_referrer_id INTEGER := NULL;
  v_l1_user users%ROWTYPE;
  v_raw_l2_setting TEXT;
  v_l2_pct NUMERIC(8, 4);
  v_l2_amount NUMERIC(18, 4) := 0.0000;
  v_l2_ref_code TEXT;

  v_reward_result JSONB;
  v_rewards_created JSONB := '[]'::jsonb;
BEGIN
  -- 1. Fetch deposit record with row-level locking
  SELECT * INTO v_dep FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Deposit record #%s not found in database.', p_deposit_id));
  END IF;

  -- 2. Check if already confirmed
  IF v_dep.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'is_duplicate', true, 'error', 'This deposit has already been confirmed.');
  END IF;

  -- 3. Fetch user record with row-level locking
  SELECT * INTO v_user FROM users WHERE id = v_dep.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('User account #%s associated with deposit #%s not found.', v_dep.user_id, p_deposit_id));
  END IF;

  -- 4. Normalize transaction hash
  IF p_tx_hash IS NOT NULL AND TRIM(p_tx_hash) != '' THEN
    v_norm_tx := LOWER(TRIM(p_tx_hash));
    SELECT id INTO v_dup_id FROM deposits WHERE LOWER(tx_hash) = v_norm_tx AND id != p_deposit_id LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s is already assigned to deposit #%s.', v_norm_tx, v_dup_id));
    END IF;
  ELSE
    v_norm_tx := v_dep.tx_hash;
  END IF;

  -- 5. Determine final amount
  v_final_amount := COALESCE(p_actual_amount, v_dep.actual_amount, v_dep.amount);
  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit amount must be greater than 0 USDT.');
  END IF;

  -- 6. Read minimumDepositAmount
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NOT NULL AND TRIM(v_raw_min_setting) != '' THEN
    BEGIN
      v_min_deposit := v_raw_min_setting::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_min_deposit := 300.0;
    END;
  ELSE
    v_min_deposit := 300.0;
  END IF;

  -- 6.5. Required Confirmations
  SELECT value INTO v_raw_conf_setting FROM system_settings WHERE key = 'requiredConfirmations';
  IF v_raw_conf_setting IS NOT NULL AND TRIM(v_raw_conf_setting) != '' THEN
    BEGIN
      v_req_conf := v_raw_conf_setting::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_req_conf := 12;
    END;
  END IF;

  -- 6.6. Authoritative depositLockPeriodDays from system_settings
  SELECT value INTO v_raw_lock_setting FROM system_settings WHERE key = 'depositLockPeriodDays';
  IF v_raw_lock_setting IS NOT NULL AND TRIM(v_raw_lock_setting) != '' THEN
    BEGIN
      v_deposit_lock_days := v_raw_lock_setting::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_deposit_lock_days := 66;
    END;
  ELSE
    v_deposit_lock_days := 66;
  END IF;

  -- Calculate per-deposit maturity date
  IF v_dep.deposit_lock_end_date IS NOT NULL THEN
    v_maturity_date := v_dep.deposit_lock_end_date;
  ELSE
    v_maturity_date := v_now + (v_deposit_lock_days || ' days')::INTERVAL;
  END IF;

  -- 7. Update deposit record to confirmed status with canonical per-deposit maturity
  UPDATE deposits SET
    status = 'confirmed',
    confirmed_at = v_now,
    verified_at = v_now,
    deposit_lock_end_date = v_maturity_date,
    lock_expires_at = v_maturity_date,
    notes = COALESCE(p_admin_notes, notes),
    tx_hash = COALESCE(v_norm_tx, tx_hash),
    from_address = COALESCE(p_from_address, from_address),
    block_number = COALESCE(p_block_number, block_number),
    token_contract = COALESCE(p_token_contract, token_contract),
    confirmations = COALESCE(p_confirmations, GREATEST(COALESCE(confirmations, 0), v_req_conf)),
    actual_amount = v_final_amount,
    amount = v_final_amount,
    updated_at = v_now
  WHERE id = p_deposit_id
  RETURNING * INTO v_dep;

  -- 8. Calculate authoritative ledger-derived available cash balance
  SELECT (
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_dep.user_id AND status = 'confirmed'), 0) +
    COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_dep.user_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_dep.user_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_dep.user_id AND type = 'admin_adjustment'), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('paid', 'completed')), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
  ) INTO v_available_balance;

  -- 9. Insert double-entry ledger entry
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    v_dep.user_id, 'deposit', v_final_amount, v_available_balance, v_dep.id::TEXT,
    format('Confirmed BEP-20 USDT deposit of %s USDT (Tx: %s)', v_final_amount, v_dep.tx_hash),
    p_admin_id, v_now
  );

  -- 10. Audit log
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, created_at
  ) VALUES (
    'DEPOSIT_CONFIRMED', p_admin_id, 'admin', v_dep.user_id::TEXT,
    COALESCE(p_admin_notes, format('Confirmed deposit #%s for %s USDT on BNB Smart Chain (Tx: %s)', p_deposit_id, v_final_amount, v_dep.tx_hash)),
    v_now
  );

  -- 11. Multi-Tier Referral Distribution
  IF v_final_amount >= v_min_deposit AND v_user.status = 'active' THEN
    v_is_qualifying := true;

    -- Level 1 referral
    SELECT value INTO v_raw_l1_setting FROM system_settings WHERE key = 'referralRewardL1Percentage';
    IF v_raw_l1_setting IS NOT NULL AND TRIM(v_raw_l1_setting) != '' THEN
      BEGIN
        v_l1_pct := v_raw_l1_setting::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_l1_pct := 5.0;
      END;
    ELSE
      v_l1_pct := 5.0;
    END IF;

    -- Level 2 referral
    SELECT value INTO v_raw_l2_setting FROM system_settings WHERE key = 'referralRewardL2Percentage';
    IF v_raw_l2_setting IS NOT NULL AND TRIM(v_raw_l2_setting) != '' THEN
      BEGIN
        v_l2_pct := v_raw_l2_setting::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_l2_pct := 2.0;
      END IF;
    ELSE
      v_l2_pct := 2.0;
    END IF;

    -- Check direct referral relationship
    SELECT id, referrer_id INTO v_l1_referral_id, v_l1_referrer_id
    FROM referrals WHERE referred_id = v_dep.user_id LIMIT 1;

    IF v_l1_referrer_id IS NOT NULL AND v_l1_pct > 0 THEN
      v_l1_amount := ROUND((v_final_amount * (v_l1_pct / 100.0)), 4);
      IF v_l1_amount > 0 THEN
        SELECT referral_code INTO v_l1_ref_code FROM users WHERE id = v_l1_referrer_id;
        v_reward_result := credit_referral_reward_atomic(
          v_l1_referrer_id, v_dep.user_id, v_dep.id, 1, v_l1_amount, v_final_amount, v_l1_pct, v_l1_ref_code, p_admin_id
        );
        IF (v_reward_result->>'success')::BOOLEAN THEN
          v_rewards_created := v_rewards_created || jsonb_build_array(v_reward_result->'reward');
        END IF;
      END IF;

      -- Check parent referral (Level 2)
      SELECT id, referrer_id INTO v_l2_referral_id, v_l2_referrer_id
      FROM referrals WHERE referred_id = v_l1_referrer_id LIMIT 1;

      IF v_l2_referrer_id IS NOT NULL AND v_l2_pct > 0 THEN
        v_l2_amount := ROUND((v_final_amount * (v_l2_pct / 100.0)), 4);
        IF v_l2_amount > 0 THEN
          SELECT referral_code INTO v_l2_ref_code FROM users WHERE id = v_l2_referrer_id;
          v_reward_result := credit_referral_reward_atomic(
            v_l2_referrer_id, v_dep.user_id, v_dep.id, 2, v_l2_amount, v_final_amount, v_l2_pct, v_l2_ref_code, p_admin_id
          );
          IF (v_reward_result->>'success')::BOOLEAN THEN
            v_rewards_created := v_rewards_created || jsonb_build_array(v_reward_result->'reward');
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deposit', to_jsonb(v_dep),
    'is_qualifying', v_is_qualifying,
    'rewards_created', v_rewards_created
  );
END;
$$;

-- 4. Re-assert create_withdrawal_atomic to strictly check canonical deposit maturity
CREATE OR REPLACE FUNCTION create_withdrawal_atomic(
  p_user_id INTEGER,
  p_requested_amount NUMERIC(18, 4),
  p_destination_address TEXT,
  p_reference TEXT,
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
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_dest TEXT;
  v_fee_pct NUMERIC(8, 4);
  v_fee_amt NUMERIC(18, 4);
  v_net_amt NUMERIC(18, 4);
  v_clean_ref TEXT;
  v_new_wd withdrawals%ROWTYPE;
  v_existing_wd withdrawals%ROWTYPE;
  v_total_deposited NUMERIC(18, 4) := 0;
  v_total_earnings NUMERIC(18, 4) := 0;
  v_total_referral NUMERIC(18, 4) := 0;
  v_total_adjustments NUMERIC(18, 4) := 0;
  v_total_withdrawn NUMERIC(18, 4) := 0;
  v_total_pending_withdrawn NUMERIC(18, 4) := 0;
  v_available_balance NUMERIC(18, 4) := 0;
  v_locked_principal NUMERIC(18, 4) := 0;
  v_locked_earnings NUMERIC(18, 4) := 0;
  v_total_locked_investment NUMERIC(18, 4) := 0;
  v_eligible_withdrawal NUMERIC(18, 4) := 0;
  v_raw_fee_setting TEXT;
  v_raw_lock_setting TEXT;
  v_deposit_lock_days INTEGER := 66;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_is_fund_locked BOOLEAN := FALSE;
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

  -- Check voluntary/administrative fund lock on user
  IF v_user.fund_lock_until IS NOT NULL AND v_user.fund_lock_until > v_now THEN
    v_is_fund_locked := TRUE;
  END IF;

  -- 3. Dynamic Configuration
  SELECT value INTO v_raw_fee_setting FROM system_settings WHERE key = 'withdrawalFeePercentage';
  IF v_raw_fee_setting IS NOT NULL AND TRIM(v_raw_fee_setting) != '' THEN
    BEGIN
      v_fee_pct := v_raw_fee_setting::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_fee_pct := 9.0;
    END;
  ELSE
    v_fee_pct := 9.0;
  END IF;

  SELECT value INTO v_raw_lock_setting FROM system_settings WHERE key = 'depositLockPeriodDays';
  IF v_raw_lock_setting IS NOT NULL AND TRIM(v_raw_lock_setting) != '' THEN
    BEGIN
      v_deposit_lock_days := v_raw_lock_setting::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_deposit_lock_days := 66;
    END;
  ELSE
    v_deposit_lock_days := 66;
  END IF;

  -- 4. Calculate available balances with row-lock consistency
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_referral FROM referral_rewards WHERE referrer_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_adjustments FROM ledger WHERE user_id = p_user_id AND type = 'admin_adjustment';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');

  v_available_balance := v_total_deposited + v_total_earnings + v_total_referral + v_total_adjustments - v_total_withdrawn - v_total_pending_withdrawn;
  
  IF p_requested_amount > v_available_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Insufficient available balance. Requested: %s USDT, Available: %s USDT.', p_requested_amount, v_available_balance));
  END IF;

  -- 5. True Per-Deposit Maturity Calculation
  -- Principal is locked ONLY if the deposit's own lock period has not expired
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal
  FROM deposits
  WHERE user_id = p_user_id
    AND status = 'confirmed'
    AND COALESCE(deposit_lock_end_date, lock_expires_at, COALESCE(confirmed_at, created_at) + (v_deposit_lock_days || ' days')::INTERVAL) > v_now;

  -- Earnings attributed to locked deposits are locked with them
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_locked_earnings
  FROM earnings
  WHERE user_id = p_user_id
    AND status = 'credited'
    AND deposit_id IN (
      SELECT id FROM deposits
      WHERE user_id = p_user_id
        AND status = 'confirmed'
        AND COALESCE(deposit_lock_end_date, lock_expires_at, COALESCE(confirmed_at, created_at) + (v_deposit_lock_days || ' days')::INTERVAL) > v_now
    );

  v_total_locked_investment := v_locked_principal + v_locked_earnings;

  -- Eligible for withdrawal calculation
  IF v_is_fund_locked THEN
    v_eligible_withdrawal := LEAST(v_available_balance, v_total_referral);
  ELSE
    v_eligible_withdrawal := GREATEST(0, v_available_balance - LEAST(v_available_balance, v_total_locked_investment));
  END IF;

  IF p_requested_amount > v_eligible_withdrawal THEN
    IF v_is_fund_locked THEN
      RETURN jsonb_build_object('success', false, 'error', 'Your non-referral funds are currently locked under an active administrative or voluntary Fund Lock.');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Your deposited funds and associated investment earnings are currently locked until deposit maturity.');
    END IF;
  END IF;

  -- 6. Calculate authoritative fees and net payout
  v_fee_amt := ROUND(p_requested_amount * (v_fee_pct / 100.0), 4);
  v_net_amt := p_requested_amount - v_fee_amt;

  -- 7. Generate Reference
  IF p_reference IS NOT NULL AND TRIM(p_reference) != '' THEN
    v_clean_ref := TRIM(p_reference);
  ELSE
    v_clean_ref := 'WD-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;

  -- 8. Insert withdrawal row
  INSERT INTO withdrawals (
    user_id, requested_amount, fee_percentage, fee_amount, net_amount,
    currency, network, destination_address, reference, idempotency_key,
    user_notes, status, created_at, updated_at
  ) VALUES (
    p_user_id, p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt,
    'USDT', 'BEP-20', v_dest, v_clean_ref, p_idempotency_key,
    p_user_notes, 'pending', v_now, v_now
  )
  RETURNING * INTO v_new_wd;

  -- 9. Insert double-entry ledger entry
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_user_id, 'withdrawal_request', -p_requested_amount, (v_available_balance - p_requested_amount),
    v_clean_ref, format('Withdrawal request of %s USDT (Net: %s, Fee: %s)', p_requested_amount, v_net_amt, v_fee_amt),
    p_user_id::TEXT, v_now
  );

  -- 10. Audit log
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
  ) VALUES (
    'WITHDRAWAL_REQUESTED', p_user_id::TEXT, 'user', p_user_id::TEXT,
    format('User requested withdrawal of %s USDT to %s (Net: %s USDT, Fee: %s USDT, Ref: %s)', p_requested_amount, v_dest, v_net_amt, v_fee_amt, v_clean_ref),
    v_clean_ref, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal', to_jsonb(v_new_wd),
    'available_balance_after', (v_available_balance - p_requested_amount),
    'eligible_withdrawal', (v_eligible_withdrawal - p_requested_amount)
  );
END;
$$;
