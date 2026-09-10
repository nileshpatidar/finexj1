-- ==============================================================================
-- Migration 019: FINEXJ Referral & Earnings Eligibility Hardening
-- ==============================================================================
-- Business Rule:
-- A user must NOT be allowed to participate in "Refer & Earn" until the user
-- has personally deposited and maintained at least the configured minimum eligible amount.
--
-- 1. Read authoritative value dynamically from system_settings.minimumDepositAmount.
-- 2. Referrer is eligible ONLY when:
--    - They have confirmed personal deposit(s) >= minimumDepositAmount, AND
--    - Their current maintained eligible principal (confirmed deposits minus paid withdrawals) >= minimumDepositAmount.
-- 3. If a user withdraws and eligible principal falls below minimum, eligibility becomes inactive.
-- 4. Referral income and daily yields are NEVER counted as qualifying principal.
-- 5. Unconfirmed, pending, rejected, or cancelled deposits do NOT qualify.
-- 6. Level 1 and Level 2 rewards strictly verify receiving referrer eligibility.
-- 7. All checks enforced atomically inside PostgreSQL transaction.
-- ==============================================================================

-- 1. Helper function to check user referral eligibility in PostgreSQL
CREATE OR REPLACE FUNCTION get_user_referral_eligibility(p_user_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_raw_min_setting TEXT;
  v_min_deposit NUMERIC(18, 4) := 300.0000;
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

  -- 2. Dynamic Minimum Setting from system_settings
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NOT NULL AND TRIM(v_raw_min_setting) <> '' THEN
    BEGIN
      v_min_deposit := v_raw_min_setting::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_min_deposit := 300.0000;
    END;
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

-- 2. Enhanced credit_referral_reward_atomic with Strict Referrer Eligibility Enforcement
CREATE OR REPLACE FUNCTION credit_referral_reward_atomic(
  p_deposit_id INTEGER,
  p_reward_level INTEGER,
  p_referrer_id INTEGER,
  p_referred_id INTEGER,
  p_amount NUMERIC(18, 4),
  p_percentage NUMERIC(8, 4),
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_referral_id INTEGER DEFAULT NULL,
  p_performed_by TEXT DEFAULT 'referral_engine'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_dep deposits%ROWTYPE;
  v_referrer users%ROWTYPE;
  v_existing_reward referral_rewards%ROWTYPE;
  v_new_reward referral_rewards%ROWTYPE;
  v_ref_code TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_min_deposit NUMERIC(18, 4) := 300.0000;
  v_raw_min_setting TEXT;
  v_balance_after NUMERIC(18, 4) := 0.0000;
  v_ledger_id INTEGER;
  v_audit_id INTEGER;
  v_ledger_type TEXT;
  v_audit_action TEXT;

  -- Referrer eligibility variables
  v_referrer_deposits NUMERIC(18, 4) := 0.0000;
  v_referrer_withdrawn NUMERIC(18, 4) := 0.0000;
  v_referrer_maintained_principal NUMERIC(18, 4) := 0.0000;
BEGIN
  -- 1. Input Validation
  IF p_reward_level NOT IN (1, 2) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reward level. Only Level 1 and Level 2 are supported.');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward amount must be strictly greater than 0.');
  END IF;

  IF p_referrer_id IS NULL OR p_referred_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referrer ID and Referred ID are required.');
  END IF;

  IF p_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reward self-referral.');
  END IF;

  -- 2. Verify and Lock Deposit (Serializes concurrent reward operations for this deposit)
  SELECT * INTO v_dep FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Deposit #%s not found in database.', p_deposit_id));
  END IF;

  IF v_dep.status <> 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Deposit #%s is not confirmed (current status: %s).', p_deposit_id, v_dep.status));
  END IF;

  -- 3. Dynamic Configuration Verification (Deposit qualification threshold)
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NOT NULL AND TRIM(v_raw_min_setting) <> '' THEN
    BEGIN
      v_min_deposit := v_raw_min_setting::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_min_deposit := 300.0000;
    END;
  END IF;

  -- Referred user's confirmed deposit must meet or exceed minimum requirement
  IF COALESCE(v_dep.actual_amount, v_dep.amount) < v_min_deposit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Deposit #%s amount (%s USDT) is below the qualifying referral threshold (%s USDT).', p_deposit_id, COALESCE(v_dep.actual_amount, v_dep.amount), v_min_deposit)
    );
  END IF;

  -- 4. Idempotency Check: Reward already exists for (deposit_id, reward_level)
  SELECT * INTO v_existing_reward 
  FROM referral_rewards 
  WHERE deposit_id = p_deposit_id AND reward_level = p_reward_level;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'reward', to_jsonb(v_existing_reward),
      'message', format('Referral reward for deposit #%s at level %s already credited.', p_deposit_id, p_reward_level)
    );
  END IF;

  -- 5. Verify and Lock Referrer User
  SELECT * INTO v_referrer FROM users WHERE id = p_referrer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', format('Referrer user #%s not found.', p_referrer_id));
  END IF;

  IF v_referrer.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Referrer user #%s is not active.', p_referrer_id));
  END IF;

  -- 6. STRICT AUTHORITATIVE REFERRER ELIGIBILITY VALIDATION
  -- Referrer must have confirmed personal deposit(s) >= v_min_deposit
  -- AND current maintained eligible principal (confirmed deposits - paid withdrawals) >= v_min_deposit.
  -- Referral income and daily yields are NEVER counted towards qualifying principal.
  SELECT COALESCE(SUM(amount), 0) INTO v_referrer_deposits
  FROM deposits
  WHERE user_id = p_referrer_id AND status = 'confirmed';

  SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_referrer_withdrawn
  FROM withdrawals
  WHERE user_id = p_referrer_id AND status IN ('paid', 'completed');

  v_referrer_maintained_principal := GREATEST(0.0000, v_referrer_deposits - v_referrer_withdrawn);

  IF v_referrer_deposits < v_min_deposit THEN
    RETURN jsonb_build_object(
      'success', false,
      'ineligible_referrer', true,
      'error', format('Referrer user #%s has total confirmed personal deposits of %s USDT, below required %s USDT.', p_referrer_id, v_referrer_deposits, v_min_deposit)
    );
  END IF;

  IF v_referrer_maintained_principal < v_min_deposit THEN
    RETURN jsonb_build_object(
      'success', false,
      'ineligible_referrer', true,
      'error', format('Referrer user #%s does not maintain the required minimum eligible principal. Current maintained principal: %s USDT (required: %s USDT).', p_referrer_id, v_referrer_maintained_principal, v_min_deposit)
    );
  END IF;

  -- 7. Generate canonical reference code
  v_ref_code := COALESCE(
    p_reference,
    format('REF-L%s-DEP-%s-%s', p_reward_level, p_deposit_id, UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)))
  );

  -- 8. Insert Referral Reward Record (Protected by composite UNIQUE constraint)
  BEGIN
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
      p_referral_id,
      p_referrer_id,
      p_referred_id,
      p_deposit_id,
      p_amount,
      p_percentage,
      v_ref_code,
      'credited',
      COALESCE(p_notes, format('Level %s (%s%%) referral reward on qualifying deposit #%s ($%s USDT)', p_reward_level, p_percentage, p_deposit_id, p_amount)),
      p_reward_level,
      'qualifying_deposit',
      v_now
    ) RETURNING * INTO v_new_reward;
  EXCEPTION
    WHEN unique_violation THEN
      -- Handle concurrent race condition: return existing reward idempotently
      SELECT * INTO v_existing_reward 
      FROM referral_rewards 
      WHERE deposit_id = p_deposit_id AND reward_level = p_reward_level;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'is_duplicate', true,
          'reward', to_jsonb(v_existing_reward),
          'message', format('Referral reward for deposit #%s at level %s already credited (concurrent race resolved).', p_deposit_id, p_reward_level)
        );
      ELSE
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
      END IF;
  END;

  -- 9. Calculate Authoritative Referrer Balance within the Same Transaction
  SELECT (
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = p_referrer_id AND status = 'confirmed'), 0) +
    COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = p_referrer_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = p_referrer_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = p_referrer_id AND type = 'admin_adjustment'), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = p_referrer_id AND status IN ('paid', 'completed')), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = p_referrer_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
  ) INTO v_balance_after;

  -- 10. Insert Ledger Entry
  v_ledger_type := CASE WHEN p_reward_level = 1 THEN 'referral_reward_l1' ELSE 'referral_reward_l2' END;

  INSERT INTO ledger (
    user_id,
    type,
    amount,
    balance_after,
    reference_id,
    description,
    performed_by,
    created_at
  ) VALUES (
    p_referrer_id,
    v_ledger_type,
    p_amount,
    v_balance_after,
    v_new_reward.id::TEXT,
    COALESCE(p_notes, format('Level %s referral reward on qualifying deposit #%s (%s USDT at %s%%)', p_reward_level, p_deposit_id, p_amount, p_percentage)),
    COALESCE(p_performed_by, 'referral_engine'),
    v_now
  ) RETURNING id INTO v_ledger_id;

  -- 11. Insert Audit Log
  v_audit_action := CASE WHEN p_reward_level = 1 THEN 'REFERRAL_REWARD_L1_CREDITED' ELSE 'REFERRAL_REWARD_L2_CREDITED' END;

  INSERT INTO audit_logs (
    action,
    actor_id,
    actor_role,
    target_user_id,
    reason,
    reference_id,
    before_value,
    after_value,
    created_at
  ) VALUES (
    v_audit_action,
    COALESCE(p_performed_by, 'referral_engine'),
    'system',
    p_referrer_id::TEXT,
    format('Credited %s USDT Level %s referral reward from deposit #%s', p_amount, p_reward_level, p_deposit_id),
    v_ref_code,
    jsonb_build_object('availableBalance', v_balance_after - p_amount),
    jsonb_build_object('rewardAmount', p_amount, 'reference', v_ref_code, 'newBalance', v_balance_after),
    v_now
  ) RETURNING id INTO v_audit_id;

  -- 12. Return Success Result
  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', false,
    'reward', to_jsonb(v_new_reward),
    'ledger_id', v_ledger_id,
    'audit_id', v_audit_id,
    'balance_after', v_balance_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION credit_referral_reward_atomic TO authenticated, service_role, anon;
