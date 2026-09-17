-- Migration 029: FINEXJ Per-Deposit Maturity, Deposit-Level Earnings Attribution & Authoritative Withdrawal RPC Hardening
-- Decouples investment withdrawal eligibility from account registration age.
-- Enforces per-deposit maturity based on each confirmed deposit's independent lock schedule.

-- 1. Ensure deposit_id column and index on earnings table for authoritative deposit-level attribution
ALTER TABLE earnings ADD COLUMN IF NOT EXISTS deposit_id BIGINT REFERENCES deposits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_earnings_deposit_id ON earnings(deposit_id);

-- 2. Update create_withdrawal_atomic to strictly enforce per-deposit maturity
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

  -- Check voluntary fund lock on user
  IF v_user.fund_lock_until IS NOT NULL AND v_user.fund_lock_until > v_now THEN
    v_is_fund_locked := TRUE;
  END IF;

  -- 3. Configuration Safety: Read withdrawalFeePercentage & depositLockPeriodDays
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
  -- Principal is locked if the deposit's own lock period has not expired
  SELECT COALESCE(SUM(amount), 0) INTO v_locked_principal
  FROM deposits
  WHERE user_id = p_user_id
    AND status = 'confirmed'
    AND COALESCE(deposit_lock_end_date, COALESCE(confirmed_at, created_at) + (v_deposit_lock_days || ' days')::INTERVAL) > v_now;

  -- Earnings attributed to locked deposits are also locked
  SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_locked_earnings
  FROM earnings
  WHERE user_id = p_user_id
    AND status = 'credited'
    AND deposit_id IN (
      SELECT id FROM deposits
      WHERE user_id = p_user_id
        AND status = 'confirmed'
        AND COALESCE(deposit_lock_end_date, COALESCE(confirmed_at, created_at) + (v_deposit_lock_days || ' days')::INTERVAL) > v_now
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
      RETURN jsonb_build_object('success', false, 'error', 'Your non-referral funds are currently locked under an active 30-Day Fund Lock.');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Your deposited funds and associated investment earnings are currently locked until maturity.');
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
    user_id, requested_amount, amount, fee_percentage, fee_amount, net_amount,
    currency, network, destination_address, status, reference, idempotency_key,
    user_notes, created_at, updated_at
  ) VALUES (
    p_user_id, p_requested_amount, p_requested_amount, v_fee_pct, v_fee_amt, v_net_amt,
    'USDT', 'BEP-20', v_dest, 'pending', v_clean_ref, TRIM(p_idempotency_key),
    p_user_notes, v_now, v_now
  )
  RETURNING * INTO v_new_wd;

  -- 9. Ledger Entry (Hold of Funds)
  INSERT INTO ledger (
    user_id, type, amount, balance_after, reference_id, description, performed_by, created_at
  ) VALUES (
    p_user_id, 'withdrawal_hold', -p_requested_amount, (v_available_balance - p_requested_amount), v_new_wd.id::TEXT,
    format('Withdrawal request #%s initiated for %s USDT to %s (Fee %s%%: %s USDT, Net: %s USDT)', v_new_wd.id, p_requested_amount, v_dest, v_fee_pct, v_fee_amt, v_net_amt),
    COALESCE(current_setting('request.jwt.claim.sub', true), p_user_id::TEXT), v_now
  );

  -- 10. Audit Log
  INSERT INTO audit_logs (
    action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
  ) VALUES (
    'WITHDRAWAL_REQUESTED', p_user_id::TEXT, 'user', p_user_id::TEXT,
    format('User requested withdrawal #%s of %s USDT (Net: %s USDT, Fee %s%%: %s USDT)', v_new_wd.id, p_requested_amount, v_net_amt, v_fee_pct, v_fee_amt),
    v_clean_ref, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal', to_jsonb(v_new_wd),
    'available_balance_after', (v_available_balance - p_requested_amount)
  );
END;
$$;

-- Unambiguously grant/revoke on the authoritative 12-argument signature
GRANT EXECUTE ON FUNCTION public.create_withdrawal_atomic(
  INTEGER, NUMERIC(18, 4), TEXT, TEXT, TEXT, TEXT, NUMERIC(8, 4), NUMERIC(18, 4), NUMERIC(18, 4), INTEGER, BOOLEAN, BOOLEAN
) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_withdrawal_atomic(
  INTEGER, NUMERIC(18, 4), TEXT, TEXT, TEXT, TEXT, NUMERIC(8, 4), NUMERIC(18, 4), NUMERIC(18, 4), INTEGER, BOOLEAN, BOOLEAN
) FROM anon, PUBLIC;
