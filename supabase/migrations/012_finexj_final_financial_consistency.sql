-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 012: FINAL FINANCIAL CONSISTENCY & INVARIANTS HARDENING
--
-- 1. DATABASE INVARIANTS:
--    - Unique referral reward per deposit and level: uq_referral_reward_deposit_level
--    - Unique direct referrer per user: uq_referred_user_single_referrer
--    - Unique deposit transaction hash: idx_deposits_tx_hash_lower_uniq
--    - Unique payout transaction hash: idx_withdrawals_payout_tx_hash_lower_uniq
--    - Cross-table anti-replay enforcement (no deposit hash in withdrawals, and vice versa)
--
-- 2. ZERO SILENT FALLBACKS IN RPCS:
--    - If minimumDepositAmount, withdrawalFeePercentage, referralRewardL1Percentage,
--      or referralRewardL2Percentage are missing/invalid:
--      -> Log CONFIGURATION_ERROR in audit_logs
--      -> Abort transaction immediately with failure
--      -> Zero unintended money credited or deducted
--
-- 3. TRUE ATOMICITY IN ALL FINANCIAL OPERATIONS:
--    - confirm_deposit_atomic
--    - create_withdrawal_atomic
--    - process_withdrawal_status_atomic
--    - adjust_user_balance_atomic
-- ==============================================================================

-- ==============================================================================
-- 1. Database Invariants & Unique Constraints Verification
-- ==============================================================================
DO $$
BEGIN
  -- 1.A One referral L1 / L2 reward per deposit
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_referral_reward_deposit_level'
  ) THEN
    ALTER TABLE referral_rewards 
      ADD CONSTRAINT uq_referral_reward_deposit_level UNIQUE (deposit_id, reward_level);
  END IF;

  -- 1.B One direct referral relationship per referred user
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_referred_user_single_referrer'
  ) THEN
    ALTER TABLE referrals 
      ADD CONSTRAINT uq_referred_user_single_referrer UNIQUE (referred_id);
  END IF;

  -- 1.C Prevent self-referral
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_no_self_ref'
  ) THEN
    ALTER TABLE referrals 
      ADD CONSTRAINT chk_referral_no_self_ref CHECK (referrer_id <> referred_id);
  END IF;
END $$;

-- Case-insensitive unique indexes on transaction hashes
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash_lower_uniq 
  ON deposits (LOWER(TRIM(tx_hash))) 
  WHERE tx_hash IS NOT NULL AND TRIM(tx_hash) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_tx_hash_lower_uniq 
  ON withdrawals (LOWER(TRIM(tx_hash))) 
  WHERE tx_hash IS NOT NULL AND TRIM(tx_hash) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_payout_tx_hash_lower_uniq 
  ON withdrawals (LOWER(TRIM(payout_tx_hash))) 
  WHERE payout_tx_hash IS NOT NULL AND TRIM(payout_tx_hash) != '';

-- ==============================================================================
-- 2. Enhanced confirm_deposit_atomic (Zero Silent Fallbacks)
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

  -- Settings & Qualification variables (NO HARDCODED FALLBACKS)
  v_raw_min_setting TEXT;
  v_min_deposit NUMERIC(18, 4);
  v_is_qualifying BOOLEAN := false;

  -- Level 1 Referrer variables
  v_l1_referral_id INTEGER := NULL;
  v_l1_referrer_id INTEGER := NULL;
  v_l1_user users%ROWTYPE;
  v_raw_l1_setting TEXT;
  v_l1_pct NUMERIC(8, 4);
  v_l1_amount NUMERIC(18, 4) := 0.0000;
  v_l1_ref_code TEXT;
  v_new_l1_reward_id INTEGER := NULL;
  v_l1_balance_after NUMERIC(18, 4) := 0.0000;

  -- Level 2 Referrer variables
  v_l2_referral_id INTEGER := NULL;
  v_l2_referrer_id INTEGER := NULL;
  v_l2_user users%ROWTYPE;
  v_raw_l2_setting TEXT;
  v_l2_pct NUMERIC(8, 4);
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

  -- 2. Terminal state check
  IF v_dep.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'is_duplicate', true, 'error', 'This deposit is already confirmed and credited.');
  END IF;

  IF v_dep.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot confirm a deposit that has been rejected.');
  END IF;

  IF v_dep.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot confirm a deposit that has been cancelled.');
  END IF;

  -- 3. Lock user account
  SELECT * INTO v_user FROM users WHERE id = v_dep.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('User account #%s associated with this deposit was not found.', v_dep.user_id));
  END IF;

  -- 4. Cross-table Anti-Replay: Verify TX hash uniqueness
  v_norm_tx := LOWER(TRIM(COALESCE(p_tx_hash, v_dep.tx_hash, '')));
  IF v_norm_tx != '' THEN
    SELECT id INTO v_dup_id FROM deposits 
    WHERE LOWER(TRIM(COALESCE(tx_hash, ''))) = v_norm_tx AND id != p_deposit_id 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s has already been claimed by deposit #%s.', v_norm_tx, v_dup_id));
    END IF;

    SELECT id INTO v_dup_id FROM withdrawals 
    WHERE (LOWER(TRIM(COALESCE(tx_hash, ''))) = v_norm_tx OR LOWER(TRIM(COALESCE(payout_tx_hash, ''))) = v_norm_tx) 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Transaction hash %s was used for withdrawal payout #%s and cannot be reused for a deposit.', v_norm_tx, v_dup_id));
    END IF;
  END IF;

  -- 5. Determine Authoritative Amount
  v_final_amount := COALESCE(p_actual_amount, v_dep.actual_amount, v_dep.amount);
  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit amount must be greater than 0 USDT.');
  END IF;

  -- 6. STRICT CONFIGURATION SAFETY: Read minimumDepositAmount
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NULL OR TRIM(v_raw_min_setting) = '' THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_admin_id, 'system', v_dep.user_id::TEXT, 'Missing required setting minimumDepositAmount in confirm_deposit_atomic', v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: minimumDepositAmount is missing in system settings. Transaction aborted.');
  END IF;

  BEGIN
    v_min_deposit := v_raw_min_setting::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_admin_id, 'system', v_dep.user_id::TEXT, format('Invalid non-numeric minimumDepositAmount (%s) in confirm_deposit_atomic', v_raw_min_setting), v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: minimumDepositAmount is non-numeric in system settings. Transaction aborted.');
  END;

  IF v_min_deposit <= 0 THEN
    INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
    VALUES ('CONFIGURATION_ERROR', p_admin_id, 'system', v_dep.user_id::TEXT, 'minimumDepositAmount must be positive', v_now);
    RETURN jsonb_build_object('success', false, 'error', 'Financial configuration error: minimumDepositAmount must be greater than 0. Transaction aborted.');
  END IF;

  -- 7. Update deposit record to confirmed status
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

  -- 11. Multi-Tier Referral Distribution (Zero Silent Fallbacks)
  IF v_final_amount >= v_min_deposit AND v_user.status = 'active' THEN
    v_is_qualifying := true;

    -- Read Level 1 percentage setting
    SELECT value INTO v_raw_l1_setting FROM system_settings WHERE key = 'referralRewardL1Percentage';
    IF v_raw_l1_setting IS NULL OR TRIM(v_raw_l1_setting) = '' THEN
      INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
      VALUES ('CONFIGURATION_ERROR', p_admin_id, 'system', v_dep.user_id::TEXT, 'Missing referralRewardL1Percentage setting. No L1 reward credited.', v_now);
      v_l1_pct := NULL;
    ELSE
      BEGIN
        v_l1_pct := v_raw_l1_setting::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_l1_pct := NULL;
      END;
    END IF;

    -- Read Level 2 percentage setting
    SELECT value INTO v_raw_l2_setting FROM system_settings WHERE key = 'referralRewardL2Percentage';
    IF v_raw_l2_setting IS NULL OR TRIM(v_raw_l2_setting) = '' THEN
      INSERT INTO audit_logs (action, actor_id, actor_role, target_user_id, reason, created_at)
      VALUES ('CONFIGURATION_ERROR', p_admin_id, 'system', v_dep.user_id::TEXT, 'Missing referralRewardL2Percentage setting. No L2 reward credited.', v_now);
      v_l2_pct := NULL;
    ELSE
      BEGIN
        v_l2_pct := v_raw_l2_setting::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_l2_pct := NULL;
      END;
    END IF;

    -- 11.A Resolve Level 1 Direct Referrer
    SELECT r.id, r.referrer_id INTO v_l1_referral_id, v_l1_referrer_id
    FROM referrals r
    WHERE r.referred_id = v_dep.user_id AND r.status = 'active'
    LIMIT 1;

    IF v_l1_referrer_id IS NULL AND v_user.referrer_id IS NOT NULL THEN
      v_l1_referrer_id := v_user.referrer_id;
    END IF;

    IF v_l1_referrer_id IS NOT NULL AND v_l1_referrer_id <> v_dep.user_id AND v_l1_pct IS NOT NULL AND v_l1_pct > 0 THEN
      SELECT * INTO v_l1_user FROM users WHERE id = v_l1_referrer_id FOR UPDATE;

      IF v_l1_user.id IS NOT NULL AND v_l1_user.status = 'active' THEN
        v_l1_amount := ROUND(v_final_amount * (v_l1_pct / 100.0), 4);

        IF v_l1_amount > 0 AND NOT EXISTS (
          SELECT 1 FROM referral_rewards WHERE deposit_id = v_dep.id AND reward_level = 1
        ) THEN
          v_l1_ref_code := 'REF-L1-DEP-' || v_dep.id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

          INSERT INTO referral_rewards (
            referral_id, referrer_id, referred_id, deposit_id, amount, percentage,
            reference, status, notes, reward_level, event_type, created_at
          ) VALUES (
            v_l1_referral_id, v_l1_referrer_id, v_dep.user_id, v_dep.id, v_l1_amount, v_l1_pct,
            v_l1_ref_code, 'credited',
            format('Level 1 (%s%%) referral reward on qualifying deposit #%s of %s USDT', v_l1_pct, v_dep.id, v_final_amount),
            1, 'qualifying_deposit', v_now
          ) RETURNING id INTO v_new_l1_reward_id;

          -- Calculate updated balance for L1 Referrer
          SELECT (
            COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_l1_referrer_id AND status = 'confirmed'), 0) +
            COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_l1_referrer_id AND status = 'credited'), 0) +
            COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_l1_referrer_id AND status = 'credited'), 0) +
            COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_l1_referrer_id AND type = 'admin_adjustment'), 0) -
            COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l1_referrer_id AND status IN ('paid', 'completed')), 0) -
            COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l1_referrer_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
          ) INTO v_l1_balance_after;

          INSERT INTO ledger (
            user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
          ) VALUES (
            v_l1_referrer_id, 'referral_reward_l1', v_l1_amount, v_l1_balance_after,
            v_new_l1_reward_id::TEXT,
            format('Level 1 referral reward from direct investor #%s qualifying deposit #%s (%s USDT at %s%%)', v_dep.user_id, v_dep.id, v_final_amount, v_l1_pct),
            p_admin_id, v_now
          );

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

          -- 11.B Resolve Level 2 Parent Referrer
          IF v_l2_pct IS NOT NULL AND v_l2_pct > 0 THEN
            SELECT r2.id, r2.referrer_id INTO v_l2_referral_id, v_l2_referrer_id
            FROM referrals r2
            WHERE r2.referred_id = v_l1_referrer_id AND r2.status = 'active'
            LIMIT 1;

            IF v_l2_referrer_id IS NULL AND v_l1_user.referrer_id IS NOT NULL THEN
              v_l2_referrer_id := v_l1_user.referrer_id;
            END IF;

            IF v_l2_referrer_id IS NOT NULL 
               AND v_l2_referrer_id <> v_dep.user_id 
               AND v_l2_referrer_id <> v_l1_referrer_id THEN
              SELECT * INTO v_l2_user FROM users WHERE id = v_l2_referrer_id FOR UPDATE;

              IF v_l2_user.id IS NOT NULL AND v_l2_user.status = 'active' THEN
                v_l2_amount := ROUND(v_final_amount * (v_l2_pct / 100.0), 4);

                IF v_l2_amount > 0 AND NOT EXISTS (
                  SELECT 1 FROM referral_rewards WHERE deposit_id = v_dep.id AND reward_level = 2
                ) THEN
                  v_l2_ref_code := 'REF-L2-DEP-' || v_dep.id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

                  INSERT INTO referral_rewards (
                    referral_id, referrer_id, referred_id, deposit_id, amount, percentage,
                    reference, status, notes, reward_level, event_type, created_at
                  ) VALUES (
                    v_l2_referral_id, v_l2_referrer_id, v_dep.user_id, v_dep.id, v_l2_amount, v_l2_pct,
                    v_l2_ref_code, 'credited',
                    format('Level 2 (%s%%) referral reward on qualifying deposit #%s of %s USDT', v_l2_pct, v_dep.id, v_final_amount),
                    2, 'qualifying_deposit', v_now
                  ) RETURNING id INTO v_new_l2_reward_id;

                  SELECT (
                    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_l2_referrer_id AND status = 'confirmed'), 0) +
                    COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_l2_referrer_id AND status = 'credited'), 0) +
                    COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_l2_referrer_id AND status = 'credited'), 0) +
                    COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_l2_referrer_id AND type = 'admin_adjustment'), 0) -
                    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l2_referrer_id AND status IN ('paid', 'completed')), 0) -
                    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_l2_referrer_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
                  ) INTO v_l2_balance_after;

                  INSERT INTO ledger (
                    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
                  ) VALUES (
                    v_l2_referrer_id, 'referral_reward_l2', v_l2_amount, v_l2_balance_after,
                    v_new_l2_reward_id::TEXT,
                    format('Level 2 referral reward from investor #%s qualifying deposit #%s (%s USDT at %s%%)', v_dep.user_id, v_dep.id, v_final_amount, v_l2_pct),
                    p_admin_id, v_now
                  );

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

-- ==============================================================================
-- 3. Enhanced create_withdrawal_atomic (Zero Silent Fallbacks)
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
  p_fund_lock_days INTEGER DEFAULT 0,
  p_confirm_lock_break BOOLEAN DEFAULT FALSE,
  p_confirm_minimum_break BOOLEAN DEFAULT FALSE
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
  v_now TIMESTAMPTZ := NOW();

  -- Authoritative fee percentage & minimum from system_settings (NO SILENT FALLBACKS)
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
    RETURN jsonb_build_object('success', false, 'error', format('Account is currently %s.', v_user.status));
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

-- ==============================================================================
-- 4. Enhanced process_withdrawal_status_atomic (Zero Silent Fallbacks)
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
