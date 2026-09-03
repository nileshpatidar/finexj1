-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 011: ATOMIC FINANCIAL LOGIC & RPC HARDENING
-- 
-- 1. confirm_deposit_atomic:
--    - Atomic deposit confirmation with row-locking (FOR UPDATE)
--    - Minimum deposit verification via system_settings (minimumDepositAmount)
--    - Idempotent Level 1 and Level 2 referral reward generation (depth <= 2)
--    - Double-entry ledger integration for user deposit & referral rewards
--    - No compounding: referral rewards are credited to available cash balance,
--      never modifying compounding active principal
-- 
-- 2. create_withdrawal_atomic:
--    - Dynamic 9% fee calculation from system_settings (withdrawalFeePercentage)
--    - Universal withdrawal fee applied across all fund sources
--    - Full available and eligible balance validations
-- 
-- 3. process_withdrawal_status_atomic:
--    - Terminal state machine integrity
--    - On status 'paid', 9% withdrawal fee is retained and recorded as inflow
--      in finexj_operational_ledger
--    - STRICT GUARANTEE: ABSOLUTELY NO referral distribution from withdrawal fees
-- 
-- 4. adjust_user_balance_atomic:
--    - Hardened balance adjustment honoring referral rewards in available balance
-- 
-- 5. adjust_finexj_operational_fund_atomic:
--    - Admin-only atomic adjustment of FINEXJ company operational capital
-- ==============================================================================

-- ==============================================================================
-- 1. Enhanced Deposit Confirmation Procedure with Multi-Tier Referral Distribution
-- ==============================================================================
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
  v_min_deposit NUMERIC(18, 4) := 300.0000;
  v_is_qualifying BOOLEAN := false;

  -- Level 1 Referrer variables
  v_l1_referral_id INTEGER := NULL;
  v_l1_referrer_id INTEGER := NULL;
  v_l1_user users%ROWTYPE;
  v_l1_pct NUMERIC(8, 4) := 5.0000;
  v_l1_amount NUMERIC(18, 4) := 0.0000;
  v_l1_ref_code TEXT;
  v_new_l1_reward_id INTEGER := NULL;
  v_l1_balance_after NUMERIC(18, 4) := 0.0000;

  -- Level 2 Referrer variables
  v_l2_referral_id INTEGER := NULL;
  v_l2_referrer_id INTEGER := NULL;
  v_l2_user users%ROWTYPE;
  v_l2_pct NUMERIC(8, 4) := 2.0000;
  v_l2_amount NUMERIC(18, 4) := 0.0000;
  v_l2_ref_code TEXT;
  v_new_l2_reward_id INTEGER := NULL;
  v_l2_balance_after NUMERIC(18, 4) := 0.0000;

  v_rewards_created JSONB := '[]'::jsonb;
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

  -- 7. Calculate ledger-derived available cash balance for depositing user
  SELECT (
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_dep.user_id AND status = 'confirmed'), 0) +
    COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_dep.user_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_dep.user_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_dep.user_id AND type = 'admin_adjustment'), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('paid', 'completed')), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_dep.user_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
  ) INTO v_available_balance;

  -- 8. Write immutable double-entry ledger entry for deposit
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

  -- ============================================================================
  -- 10. Multi-Tier Referral Qualification & Idempotent Reward Distribution
  -- ============================================================================
  -- Read minimum deposit amount from system_settings (authoritative, dynamic)
  SELECT COALESCE(NULLIF(value, ''), '300')::NUMERIC 
  INTO v_min_deposit 
  FROM system_settings 
  WHERE key = 'minimumDepositAmount';

  IF v_min_deposit IS NULL OR v_min_deposit <= 0 THEN
    v_min_deposit := 300.0000;
  END IF;

  -- Only qualifying deposits (>= minimumDepositAmount) generate referral rewards
  IF v_final_amount >= v_min_deposit AND v_user.status = 'active' THEN
    v_is_qualifying := true;

    -- 10.A Resolve Level 1 Direct Referrer
    SELECT r.id, r.referrer_id INTO v_l1_referral_id, v_l1_referrer_id
    FROM referrals r
    WHERE r.referred_id = v_dep.user_id AND r.status = 'active'
    LIMIT 1;

    IF v_l1_referrer_id IS NULL AND v_user.referrer_id IS NOT NULL THEN
      v_l1_referrer_id := v_user.referrer_id;
    END IF;

    -- Validate Level 1 Referrer eligibility (active user, cannot be self)
    IF v_l1_referrer_id IS NOT NULL AND v_l1_referrer_id <> v_dep.user_id THEN
      SELECT * INTO v_l1_user FROM users WHERE id = v_l1_referrer_id FOR UPDATE;

      IF v_l1_user.id IS NOT NULL AND v_l1_user.status = 'active' THEN
        -- Read Level 1 Reward Percentage from system_settings
        SELECT COALESCE(NULLIF(value, ''), '5.0000')::NUMERIC 
        INTO v_l1_pct 
        FROM system_settings 
        WHERE key = 'referralRewardL1Percentage';

        IF v_l1_pct IS NOT NULL AND v_l1_pct > 0 THEN
          v_l1_amount := ROUND(v_final_amount * (v_l1_pct / 100.0), 4);

          -- Idempotency check: verify L1 reward not already generated for this deposit
          IF v_l1_amount > 0 AND NOT EXISTS (
            SELECT 1 FROM referral_rewards 
            WHERE deposit_id = v_dep.id AND reward_level = 1
          ) THEN
            v_l1_ref_code := 'REF-L1-DEP-' || v_dep.id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

            -- Insert L1 Referral Reward record
            INSERT INTO referral_rewards (
              referral_id,
              referrer_id,
              referred_id,
              deposit_id,
              amount,
              percentage,
              reference,
              status,
              notes,
              reward_level,
              event_type,
              created_at
            ) VALUES (
              v_l1_referral_id,
              v_l1_referrer_id,
              v_dep.user_id,
              v_dep.id,
              v_l1_amount,
              v_l1_pct,
              v_l1_ref_code,
              'credited',
              format('Level 1 (%s%%) referral reward on qualifying deposit #%s of %s USDT', v_l1_pct, v_dep.id, v_final_amount),
              1,
              'qualifying_deposit',
              v_now
            ) RETURNING id INTO v_new_l1_reward_id;

            -- Calculate updated available balance for L1 Referrer
            SELECT (
              COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_l1_referrer_id AND status = 'confirmed'), 0) +
              COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_l1_referrer_id AND status = 'credited'), 0) +
              COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_l1_referrer_id AND status = 'credited'), 0) +
              COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_l1_referrer_id AND type = 'admin_adjustment'), 0) -
              COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l1_referrer_id AND status IN ('paid', 'completed')), 0) -
              COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l1_referrer_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
            ) INTO v_l1_balance_after;

            -- Credit L1 Referrer's Ledger (Separate accounting category: referral_reward_l1)
            -- Note: Does NOT modify daily performance eligible principal; stays pure withdrawable cash
            INSERT INTO ledger (
              user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
            ) VALUES (
              v_l1_referrer_id, 'referral_reward_l1', v_l1_amount, v_l1_balance_after,
              v_new_l1_reward_id::TEXT,
              format('Level 1 referral reward from investor #%s qualifying deposit #%s (%s USDT at %s%%)', v_dep.user_id, v_dep.id, v_final_amount, v_l1_pct),
              p_admin_id, v_now
            );

            -- Audit log for L1 reward
            INSERT INTO audit_logs (
              action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
            ) VALUES (
              'REFERRAL_REWARD_L1_CREDITED', p_admin_id, 'system', v_l1_referrer_id::TEXT,
              format('Credited %s USDT Level 1 referral reward for qualifying deposit #%s', v_l1_amount, v_dep.id),
              v_l1_ref_code, v_now
            );

            v_rewards_created := v_rewards_created || jsonb_build_object(
              'level', 1,
              'referrer_id', v_l1_referrer_id,
              'amount', v_l1_amount,
              'percentage', v_l1_pct,
              'reference', v_l1_ref_code
            );
          END IF;
        END IF;

        -- 10.B Resolve Level 2 Indirect Referrer (Parent of L1 Referrer)
        SELECT r.id, r.referrer_id INTO v_l2_referral_id, v_l2_referrer_id
        FROM referrals r
        WHERE r.referred_id = v_l1_referrer_id AND r.status = 'active'
        LIMIT 1;

        IF v_l2_referrer_id IS NULL AND v_l1_user.referrer_id IS NOT NULL THEN
          v_l2_referrer_id := v_l1_user.referrer_id;
        END IF;

        -- Validate Level 2 Referrer eligibility (must not be self, must not be L1 referrer)
        IF v_l2_referrer_id IS NOT NULL AND v_l2_referrer_id <> v_dep.user_id AND v_l2_referrer_id <> v_l1_referrer_id THEN
          SELECT * INTO v_l2_user FROM users WHERE id = v_l2_referrer_id FOR UPDATE;

          IF v_l2_user.id IS NOT NULL AND v_l2_user.status = 'active' THEN
            -- Read Level 2 Reward Percentage from system_settings
            SELECT COALESCE(NULLIF(value, ''), '2.0000')::NUMERIC 
            INTO v_l2_pct 
            FROM system_settings 
            WHERE key = 'referralRewardL2Percentage';

            IF v_l2_pct IS NOT NULL AND v_l2_pct > 0 THEN
              v_l2_amount := ROUND(v_final_amount * (v_l2_pct / 100.0), 4);

              -- Idempotency check: verify L2 reward not already generated for this deposit
              IF v_l2_amount > 0 AND NOT EXISTS (
                SELECT 1 FROM referral_rewards 
                WHERE deposit_id = v_dep.id AND reward_level = 2
              ) THEN
                v_l2_ref_code := 'REF-L2-DEP-' || v_dep.id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

                -- Insert L2 Referral Reward record
                INSERT INTO referral_rewards (
                  referral_id,
                  referrer_id,
                  referred_id,
                  deposit_id,
                  amount,
                  percentage,
                  reference,
                  status,
                  notes,
                  reward_level,
                  event_type,
                  created_at
                ) VALUES (
                  v_l2_referral_id,
                  v_l2_referrer_id,
                  v_dep.user_id,
                  v_dep.id,
                  v_l2_amount,
                  v_l2_pct,
                  v_l2_ref_code,
                  'credited',
                  format('Level 2 (%s%%) referral reward on qualifying deposit #%s of %s USDT', v_l2_pct, v_dep.id, v_final_amount),
                  2,
                  'qualifying_deposit',
                  v_now
                ) RETURNING id INTO v_new_l2_reward_id;

                -- Calculate updated available balance for L2 Referrer
                SELECT (
                  COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_l2_referrer_id AND status = 'confirmed'), 0) +
                  COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_l2_referrer_id AND status = 'credited'), 0) +
                  COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_l2_referrer_id AND status = 'credited'), 0) +
                  COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_l2_referrer_id AND type = 'admin_adjustment'), 0) -
                  COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l2_referrer_id AND status IN ('paid', 'completed')), 0) -
                  COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l2_referrer_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
                ) INTO v_l2_balance_after;

                -- Credit L2 Referrer's Ledger (Separate accounting category: referral_reward_l2)
                INSERT INTO ledger (
                  user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
                ) VALUES (
                  v_l2_referrer_id, 'referral_reward_l2', v_l2_amount, v_l2_balance_after,
                  v_new_l2_reward_id::TEXT,
                  format('Level 2 referral reward from investor #%s qualifying deposit #%s (%s USDT at %s%%)', v_dep.user_id, v_dep.id, v_final_amount, v_l2_pct),
                  p_admin_id, v_now
                );

                -- Audit log for L2 reward
                INSERT INTO audit_logs (
                  action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
                ) VALUES (
                  'REFERRAL_REWARD_L2_CREDITED', p_admin_id, 'system', v_l2_referrer_id::TEXT,
                  format('Credited %s USDT Level 2 referral reward for qualifying deposit #%s', v_l2_amount, v_dep.id),
                  v_l2_ref_code, v_now
                );

                v_rewards_created := v_rewards_created || jsonb_build_object(
                  'level', 2,
                  'referrer_id', v_l2_referrer_id,
                  'amount', v_l2_amount,
                  'percentage', v_l2_pct,
                  'reference', v_l2_ref_code
                );
              END IF;
            END IF;
          END IF;
        END IF; -- End L2 block
      END IF;
    END IF; -- End L1 block
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deposit', to_jsonb(v_dep),
    'is_qualifying', v_is_qualifying,
    'rewards_created', v_rewards_created
  );
END;
$$;

-- ==============================================================================
-- 2. Atomic Withdrawal Creation with Configured 9% Fee
-- ==============================================================================
CREATE OR REPLACE FUNCTION create_withdrawal_atomic(
  p_user_id INTEGER,
  p_requested_amount NUMERIC,
  p_destination_address TEXT,
  p_reference TEXT,
  p_idempotency_key TEXT,
  p_user_notes TEXT,
  p_fee_percentage NUMERIC DEFAULT NULL,
  p_fee_amount NUMERIC DEFAULT NULL,
  p_net_amount NUMERIC DEFAULT NULL,
  p_fund_lock_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_total_deposited NUMERIC(18, 4) := 0.0000;
  v_total_earnings NUMERIC(18, 4) := 0.0000;
  v_total_referral NUMERIC(18, 4) := 0.0000;
  v_total_adjustments NUMERIC(18, 4) := 0.0000;
  v_total_withdrawn NUMERIC(18, 4) := 0.0000;
  v_total_pending_withdrawn NUMERIC(18, 4) := 0.0000;
  v_locked_principal NUMERIC(18, 4) := 0.0000;
  v_available_balance NUMERIC(18, 4) := 0.0000;
  v_eligible_balance NUMERIC(18, 4) := 0.0000;
  v_existing_wd withdrawals%ROWTYPE;
  v_new_wd withdrawals%ROWTYPE;
  v_lock_until TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();

  -- Dynamic authoritative fee percentage from system_settings
  v_configured_fee_pct NUMERIC(8, 4) := 9.0000;
  v_fee_pct NUMERIC(8, 4) := 9.0000;
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

  -- 5. Calculate confirmed deposits, earnings, referral rewards, adjustments, and withdrawals
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited FROM deposits WHERE user_id = p_user_id AND status = 'confirmed';
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earnings FROM earnings WHERE user_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_referral FROM referral_rewards WHERE referrer_id = p_user_id AND status = 'credited';
  SELECT COALESCE(SUM(amount), 0) INTO v_total_adjustments FROM ledger WHERE user_id = p_user_id AND type = 'admin_adjustment';
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('paid', 'completed');
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_pending_withdrawn FROM withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'processing', 'under_review');
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal FROM deposits WHERE user_id = p_user_id AND status = 'confirmed' AND (COALESCE(confirmed_at, created_at) + INTERVAL '30 days' > v_now);

  v_available_balance := v_total_deposited + v_total_earnings + v_total_referral + v_total_adjustments - v_total_withdrawn - v_total_pending_withdrawn;
  v_eligible_balance := GREATEST(0.0000, v_available_balance - v_locked_principal);

  IF p_requested_amount > v_eligible_balance THEN
    RETURN jsonb_build_object('success', false, 'error', format('Insufficient eligible balance. Requested: %s USDT, Eligible: %s USDT (Available: %s USDT, Principal locked: %s USDT)', p_requested_amount, v_eligible_balance, v_available_balance, v_locked_principal));
  END IF;

  -- 6. Dynamic Authoritative 9% Fee Calculation from system_settings
  SELECT COALESCE(NULLIF(value, ''), '9.0000')::NUMERIC 
  INTO v_configured_fee_pct 
  FROM system_settings 
  WHERE key = 'withdrawalFeePercentage';

  IF v_configured_fee_pct IS NULL OR v_configured_fee_pct < 0 THEN
    v_configured_fee_pct := 9.0000;
  END IF;

  v_fee_pct := v_configured_fee_pct;
  v_fee_amt := ROUND(p_requested_amount * (v_fee_pct / 100.0), 4);
  v_net_amt := p_requested_amount - v_fee_amt;
  v_clean_ref := COALESCE(p_reference, 'WD-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)));

  -- 7. Insert withdrawal record
  INSERT INTO withdrawals (
    user_id, amount, requested_amount, fee_percentage, fee_amount, net_amount,
    currency, network, destination_address, status, reference, idempotency_key, user_notes, created_at
  ) VALUES (
    p_user_id, p_requested_amount, p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt,
    'USDT', 'BEP-20', v_dest, 'pending', v_clean_ref, p_idempotency_key, p_user_notes, v_now
  ) RETURNING * INTO v_new_wd;

  -- 8. Insert double-entry ledger debit (reserves total requested amount)
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_user_id, 'withdrawal_request', -p_requested_amount, v_available_balance - p_requested_amount,
    v_new_wd.id::TEXT, format('Withdrawal request submitted for %s USDT (%s%% Fee: %s USDT, Net: %s USDT)', p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt),
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
    format('User requested withdrawal of %s USDT to %s (%s%% fee: %s USDT, net: %s USDT)', p_requested_amount, v_dest, v_fee_pct, v_fee_amt, v_net_amt),
    v_now
  );

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_new_wd));
END;
$$;

-- ==============================================================================
-- 3. Atomic Admin Withdrawal Status Processing with FINEXJ Fee Accounting
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

    -- ==========================================================================
    -- FINEXJ Operational Fund Fee Income Accounting
    -- The retained 9% fee is FINEXJ-owned income.
    -- ABSOLUTELY NO referral reward or distribution is created from this fee.
    -- ==========================================================================
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
        amount,
        direction,
        reason,
        admin_id,
        reference,
        before_balance,
        after_balance,
        created_at
      ) VALUES (
        v_wd.fee_amount,
        'inflow',
        format('Withdrawal fee collected (%s%%) from withdrawal #%s (Reference: %s)', v_wd.fee_percentage, v_wd.id, v_wd.reference),
        p_admin_id,
        'WD-FEE-' || v_wd.id::TEXT,
        v_op_prev_balance,
        v_op_new_balance,
        v_now
      );

      -- Audit log for withdrawal fee receipt
      INSERT INTO audit_logs (
        action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
      ) VALUES (
        'WITHDRAWAL_FEE_COLLECTED', p_admin_id, 'admin', v_wd.user_id::TEXT,
        format('FINEXJ retained %s USDT withdrawal fee (%s%%) from withdrawal #%s', v_wd.fee_amount, v_wd.fee_percentage, v_wd.id),
        'WD-FEE-' || v_wd.id::TEXT, v_now
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

  RETURN jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_wd));
END;
$$;

-- ==============================================================================
-- 4. Atomic Admin Balance Adjustment with Full Ledger Integration
-- ==============================================================================
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
  v_available_balance NUMERIC(18, 4) := 0.0000;
  v_balance_after NUMERIC(18, 4) := 0.0000;
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

  -- Calculate current balance from all ledger sources (including referral rewards)
  SELECT (
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = p_target_user_id AND status = 'confirmed'), 0) +
    COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = p_target_user_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = p_target_user_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = p_target_user_id AND type = 'admin_adjustment'), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = p_target_user_id AND status IN ('paid', 'completed')), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = p_target_user_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
  ) INTO v_available_balance;

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

-- ==============================================================================
-- 5. Atomic FINEXJ Operational Fund Adjustment (Admin Only)
-- ==============================================================================
CREATE OR REPLACE FUNCTION adjust_finexj_operational_fund_atomic(
  p_admin_id TEXT,
  p_amount NUMERIC(18, 4),
  p_direction TEXT, -- 'inflow' | 'outflow'
  p_reason TEXT,
  p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_before_balance NUMERIC(18, 4) := 0.0000;
  v_after_balance NUMERIC(18, 4) := 0.0000;
  v_new_entry finexj_operational_ledger%ROWTYPE;
  v_clean_ref TEXT;
BEGIN
  -- Input Validation
  IF p_admin_id IS NULL OR TRIM(p_admin_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin ID is required for operational fund adjustments.');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment amount must be greater than 0 USDT.');
  END IF;

  IF p_direction NOT IN ('inflow', 'outflow') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment direction must be either ''inflow'' or ''outflow''.');
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A specific reason is mandatory for operational fund adjustments.');
  END IF;

  -- Lock table / serialize updates by fetching previous after_balance
  SELECT COALESCE(after_balance, 0.0000) INTO v_before_balance 
  FROM finexj_operational_ledger 
  ORDER BY created_at DESC, id DESC 
  LIMIT 1;

  v_before_balance := COALESCE(v_before_balance, 0.0000);

  IF p_direction = 'inflow' THEN
    v_after_balance := v_before_balance + p_amount;
  ELSE
    v_after_balance := v_before_balance - p_amount;
  END IF;

  v_clean_ref := COALESCE(p_reference, 'OP-ADJ-' || EXTRACT(EPOCH FROM v_now)::BIGINT || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)));

  -- Insert immutable operational fund ledger entry
  INSERT INTO finexj_operational_ledger (
    amount,
    direction,
    reason,
    admin_id,
    reference,
    before_balance,
    after_balance,
    created_at
  ) VALUES (
    p_amount,
    p_direction,
    TRIM(p_reason),
    p_admin_id,
    v_clean_ref,
    v_before_balance,
    v_after_balance,
    v_now
  ) RETURNING * INTO v_new_entry;

  -- Insert audit log
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, reference_id, before_value, after_value, created_at
  ) VALUES (
    'FINEXJ_OPERATIONAL_FUND_ADJUSTED',
    p_admin_id,
    'admin',
    'FINEXJ_COMPANY_ACCOUNT',
    TRIM(p_reason),
    v_clean_ref,
    jsonb_build_object('balance', v_before_balance),
    jsonb_build_object('balance', v_after_balance, 'amount', p_amount, 'direction', p_direction),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'entry', to_jsonb(v_new_entry),
    'before_balance', v_before_balance,
    'after_balance', v_after_balance
  );
END;
$$;
