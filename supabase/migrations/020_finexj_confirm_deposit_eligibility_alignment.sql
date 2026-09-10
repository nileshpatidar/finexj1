-- ==============================================================================
-- Migration 020: Align confirm_deposit_atomic with Strict Referral Eligibility Validation
-- ==============================================================================
-- Ensures that when confirm_deposit_atomic executes in PostgreSQL:
-- 1. Qualifying deposit threshold (minimumDepositAmount) is dynamically verified.
-- 2. Referral rewards for Level 1 and Level 2 are routed through credit_referral_reward_atomic.
-- 3. Referrers MUST personally maintain at least minimumDepositAmount in eligible principal.
-- 4. If a referrer has withdrawn and their maintained principal is below minimumDepositAmount,
--    no referral reward is credited to them.
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

  -- 11. Multi-Tier Referral Distribution (Enforces Strict Referrer Eligibility via credit_referral_reward_atomic)
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
      v_l1_amount := ROUND(v_final_amount * (v_l1_pct / 100.0), 4);
      IF v_l1_amount > 0 THEN
        v_l1_ref_code := 'REF-L1-DEP-' || v_dep.id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

        -- Authoritative atomic credit with strict referrer maintained principal validation
        v_reward_result := credit_referral_reward_atomic(
          p_deposit_id => v_dep.id,
          p_reward_level => 1,
          p_referrer_id => v_l1_referrer_id,
          p_referred_id => v_dep.user_id,
          p_amount => v_l1_amount,
          p_percentage => v_l1_pct,
          p_reference => v_l1_ref_code,
          p_notes => format('Level 1 (%s%%) referral reward on qualifying deposit #%s of %s USDT', v_l1_pct, v_dep.id, v_final_amount),
          p_referral_id => v_l1_referral_id,
          p_performed_by => p_admin_id
        );

        IF (v_reward_result->>'success')::boolean = true AND (v_reward_result->>'is_duplicate')::boolean IS NOT true THEN
          v_rewards_created := v_rewards_created || jsonb_build_object(
            'level', 1,
            'referrer_id', v_l1_referrer_id,
            'amount', v_l1_amount,
            'percentage', v_l1_pct,
            'reference', v_l1_ref_code
          );
        END IF;
      END IF;
    END IF;

    -- 11.B Resolve Level 2 Parent Referrer
    IF v_l2_pct IS NOT NULL AND v_l2_pct > 0 AND v_l1_referrer_id IS NOT NULL THEN
      SELECT * INTO v_l1_user FROM users WHERE id = v_l1_referrer_id;

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
        v_l2_amount := ROUND(v_final_amount * (v_l2_pct / 100.0), 4);
        IF v_l2_amount > 0 THEN
          v_l2_ref_code := 'REF-L2-DEP-' || v_dep.id || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

          -- Authoritative atomic credit with strict referrer maintained principal validation
          v_reward_result := credit_referral_reward_atomic(
            p_deposit_id => v_dep.id,
            p_reward_level => 2,
            p_referrer_id => v_l2_referrer_id,
            p_referred_id => v_dep.user_id,
            p_amount => v_l2_amount,
            p_percentage => v_l2_pct,
            p_reference => v_l2_ref_code,
            p_notes => format('Level 2 (%s%%) referral reward on qualifying deposit #%s of %s USDT', v_l2_pct, v_dep.id, v_final_amount),
            p_referral_id => v_l2_referral_id,
            p_performed_by => p_admin_id
          );

          IF (v_reward_result->>'success')::boolean = true AND (v_reward_result->>'is_duplicate')::boolean IS NOT true THEN
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

  RETURN jsonb_build_object(
    'success', true,
    'deposit', to_jsonb(v_dep),
    'is_qualifying', v_is_qualifying,
    'rewards_created', v_rewards_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_deposit_atomic TO authenticated, service_role, anon;

-- ==============================================================================
-- Zero-Fallback get_user_referral_eligibility: Fails closed if setting missing
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_user_referral_eligibility(p_user_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_raw_min_setting TEXT;
  v_min_deposit NUMERIC(18, 4);
  v_total_deposited NUMERIC(18, 4) := 0.0000;
  v_total_withdrawn NUMERIC(18, 4) := 0.0000;
  v_maintained_principal NUMERIC(18, 4) := 0.0000;
  v_has_confirmed_deposit BOOLEAN := FALSE;
  v_is_eligible BOOLEAN := FALSE;
  v_reason TEXT := NULL;
BEGIN
  -- 1. Verify user exists
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_eligible', false,
      'error', 'User not found'
    );
  END IF;

  -- 2. Authoritative Minimum Setting from system_settings (Fail Closed)
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NULL OR TRIM(v_raw_min_setting) = '' THEN
    RETURN jsonb_build_object(
      'is_eligible', false,
      'has_confirmed_deposit', false,
      'total_deposited', 0,
      'total_withdrawn', 0,
      'maintained_eligible_principal', 0,
      'minimum_required_principal', 0,
      'error', 'Financial configuration error: minimumDepositAmount is missing in system settings.'
    );
  END IF;

  BEGIN
    v_min_deposit := v_raw_min_setting::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'is_eligible', false,
      'has_confirmed_deposit', false,
      'total_deposited', 0,
      'total_withdrawn', 0,
      'maintained_eligible_principal', 0,
      'minimum_required_principal', 0,
      'error', format('Financial configuration error: minimumDepositAmount (%s) is non-numeric in system settings.', v_raw_min_setting)
    );
  END;

  IF v_min_deposit <= 0 THEN
    RETURN jsonb_build_object(
      'is_eligible', false,
      'has_confirmed_deposit', false,
      'total_deposited', 0,
      'total_withdrawn', 0,
      'maintained_eligible_principal', 0,
      'minimum_required_principal', 0,
      'error', 'Financial configuration error: minimumDepositAmount must be greater than zero.'
    );
  END IF;

  -- 3. Confirmed personal deposits (pending, rejected, cancelled strictly excluded)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposited
  FROM deposits
  WHERE user_id = p_user_id AND status = 'confirmed';

  -- 4. Paid withdrawals
  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_withdrawn
  FROM withdrawals
  WHERE user_id = p_user_id AND status IN ('paid', 'completed');

  -- 5. Maintained eligible principal (Strictly deposits minus withdrawals; referral rewards & yields EXCLUDED)
  v_maintained_principal := GREATEST(0.0000, v_total_deposited - v_total_withdrawn);

  v_has_confirmed_deposit := (v_total_deposited >= v_min_deposit);
  v_is_eligible := (v_user.status = 'active') AND v_has_confirmed_deposit AND (v_maintained_principal >= v_min_deposit);

  IF v_user.status <> 'active' THEN
    v_reason := format('Account is %s.', v_user.status);
  ELSIF NOT v_has_confirmed_deposit THEN
    v_reason := format('Must have confirmed personal deposit(s) of at least %s USDT to participate in Refer & Earn.', v_min_deposit);
  ELSIF v_maintained_principal < v_min_deposit THEN
    v_reason := format('Maintain at least %s USDT in eligible funds to participate in Refer & Earn. Current maintained: %s USDT.', v_min_deposit, v_maintained_principal);
  END IF;

  RETURN jsonb_build_object(
    'is_eligible', v_is_eligible,
    'has_confirmed_deposit', v_has_confirmed_deposit,
    'total_deposited', v_total_deposited,
    'total_withdrawn', v_total_withdrawn,
    'maintained_eligible_principal', v_maintained_principal,
    'minimum_required_principal', v_min_deposit,
    'reason', v_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_referral_eligibility TO authenticated, service_role, anon;

