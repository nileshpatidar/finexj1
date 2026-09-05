-- ==============================================================================
-- Migration 013: FINEXJ Step 14C - Atomic Referral Reward Crediting
-- ==============================================================================
-- Hardens referral reward crediting so the entire financial operation is atomic:
-- 1. referral_rewards INSERT
-- 2. ledger INSERT (referral_reward_l1 / referral_reward_l2)
-- 3. audit_logs INSERT
-- All succeed or fail together inside a single ACID PostgreSQL transaction.
-- Row-locks referrer and deposit rows to prevent concurrent race conditions.
-- Authoritative balance_after is calculated within the transaction.
-- Enforces UNIQUE (deposit_id, reward_level) constraint.
-- ==============================================================================

-- 1. Ensure composite unique constraint on (deposit_id, reward_level)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_referral_reward_deposit_level'
  ) THEN
    ALTER TABLE referral_rewards
      ADD CONSTRAINT uq_referral_reward_deposit_level UNIQUE (deposit_id, reward_level);
  END IF;
END $$;

-- 2. Define credit_referral_reward_atomic
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

  -- 3. Strict Configuration Verification (Deposit qualification threshold)
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NOT NULL AND TRIM(v_raw_min_setting) <> '' THEN
    BEGIN
      v_min_deposit := v_raw_min_setting::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_min_deposit := 300.0000;
    END;
  END IF;

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

  -- 6. Generate canonical reference code
  v_ref_code := COALESCE(
    p_reference,
    format('REF-L%s-DEP-%s-%s', p_reward_level, p_deposit_id, UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)))
  );

  -- 7. Insert Referral Reward Record (Protected by UNIQUE constraint)
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

  -- 8. Calculate Authoritative Referrer Balance within the Same Transaction
  -- Note: v_new_reward is already in referral_rewards with status = 'credited'
  SELECT (
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = p_referrer_id AND status = 'confirmed'), 0) +
    COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = p_referrer_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = p_referrer_id AND status = 'credited'), 0) +
    COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = p_referrer_id AND type = 'admin_adjustment'), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = p_referrer_id AND status IN ('paid', 'completed')), 0) -
    COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = p_referrer_id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
  ) INTO v_balance_after;

  -- 9. Insert Ledger Entry
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

  -- 10. Insert Audit Log
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

  -- 11. Return Success Result
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
