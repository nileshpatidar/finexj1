-- ==============================================================================
-- Migration 017: FINEXJ Step 23 - Withdrawal Cancellation Ledger Refund & Performance Date Eligibility (WD-CANCEL-001 & PERF-ELIG-001)
-- ==============================================================================
-- 1. Hardens process_withdrawal_status_atomic to atomically handle 'cancelled' status:
--    - Enforces terminal-state protection (cannot modify already paid, completed, rejected, or cancelled).
--    - Issues double-entry ledger refund ('withdrawal_cancelled', +requested_amount) to restore user's held balance.
--    - Adds immutable audit log for WITHDRAWAL_CANCELLED.
-- 2. Hardens distribute_daily_performance_atomic:
--    - Fixes deposit eligibility date evaluation to strictly prioritize eligibility_date over confirmed_at/created_at,
--      preventing deposits scheduled for next-day eligibility from receiving unearned day-0 yield.
-- ==============================================================================

-- 1. Enhanced process_withdrawal_status_atomic
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
    IF NOT EXISTS (SELECT 1 FROM ledger WHERE reference_id = v_wd.id::TEXT AND type IN ('withdrawal_rejected', 'withdrawal_cancelled')) THEN
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

  -- 6. Cancelled Status Processing (Double-Entry Refund & Audit Logging)
  ELSIF p_new_status = 'cancelled' THEN
    UPDATE withdrawals SET
      status = 'cancelled',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_at = v_now,
      reviewed_by = p_admin_id,
      updated_at = v_now
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_wd;

    -- Refund held withdrawal amount to user balance
    IF NOT EXISTS (SELECT 1 FROM ledger WHERE reference_id = v_wd.id::TEXT AND type IN ('withdrawal_cancelled', 'withdrawal_rejected')) THEN
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
        v_wd.user_id, 'withdrawal_cancelled', v_wd.requested_amount, v_available_balance, v_wd.id::TEXT,
        format('Withdrawal request cancelled. Refunded %s USDT. Reason: %s', v_wd.requested_amount, COALESCE(p_admin_notes, 'Cancelled by user or administrator')),
        p_admin_id, v_now
      );
    END IF;

    INSERT INTO audit_logs (
      action, actor_id, actor_role, target_user_id, reason, reference_id, created_at
    ) VALUES (
      'WITHDRAWAL_CANCELLED', p_admin_id, COALESCE(p_admin_role, 'admin'), v_wd.user_id::TEXT,
      format('Withdrawal #%s of %s USDT was cancelled and refunded. Reason: %s', v_wd.id, v_wd.requested_amount, COALESCE(p_admin_notes, 'Cancelled')),
      v_wd.reference, v_now
    );

  -- 7. Intermediate States (approved, processing, under_review)
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


-- 2. Enhanced distribute_daily_performance_atomic with Strict Deposit Eligibility Date Handling
CREATE OR REPLACE FUNCTION distribute_daily_performance_atomic(
  p_date TEXT,
  p_applicable_rate NUMERIC(8, 6),
  p_admin_user_id TEXT,
  p_notes TEXT DEFAULT NULL,
  p_overall_fund_amount NUMERIC(18, 4) DEFAULT NULL,
  p_overwrite_existing BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_acquired BOOLEAN := FALSE;
  v_perf daily_performance%ROWTYPE;
  v_existing_perf daily_performance%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_rate_pct NUMERIC(8, 4);
  v_min_deposit NUMERIC(18, 4) := 300.0000;
  v_raw_min TEXT;
  v_user RECORD;
  v_user_principal NUMERIC(18, 4) := 0.0000;
  v_user_dep_principal NUMERIC(18, 4) := 0.0000;
  v_user_withdrawn NUMERIC(18, 4) := 0.0000;
  v_yield_amount NUMERIC(18, 4) := 0.0000;
  v_market_condition TEXT := 'profit';
  v_applied_count INTEGER := 0;
  v_total_distributed NUMERIC(18, 4) := 0.0000;
  v_total_eligible_principal NUMERIC(18, 4) := 0.0000;
  v_user_available_balance NUMERIC(18, 4) := 0.0000;
  v_default_notes TEXT;
  v_earning_id INTEGER;
BEGIN
  -- 1. Validate inputs
  IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid date format. Expected YYYY-MM-DD.');
  END IF;

  IF p_applicable_rate IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Applicable rate cannot be null.');
  END IF;

  -- 2. Acquire Transaction Advisory Lock to serialize execution for this specific date
  PERFORM pg_advisory_xact_lock(hashtext('finexj_daily_perf_' || p_date));

  -- 3. Resolve system settings (minimum deposit threshold)
  SELECT value INTO v_raw_min FROM settings WHERE key = 'minimumDepositAmount' LIMIT 1;
  IF v_raw_min IS NOT NULL AND v_raw_min ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_min_deposit := v_raw_min::NUMERIC;
  END IF;

  v_rate_pct := ROUND(p_applicable_rate * 100.0, 4);

  IF p_applicable_rate > 0 THEN
    v_market_condition := 'profit';
  ELSIF p_applicable_rate < 0 THEN
    v_market_condition := 'loss';
  ELSE
    v_market_condition := 'neutral';
  END IF;

  v_default_notes := COALESCE(p_notes, format('Daily performance yield distribution (%s%%)', v_rate_pct));

  -- 4. Check for existing daily performance record
  SELECT * INTO v_existing_perf FROM daily_performance WHERE date = p_date LIMIT 1;

  IF FOUND THEN
    IF NOT p_overwrite_existing THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Daily performance for %s has already been distributed. Overwrite flag required to reprocess.', p_date)
      );
    END IF;

    -- Update existing record
    UPDATE daily_performance SET
      trading_profit_rate = p_applicable_rate,
      trading_profit_percentage = v_rate_pct,
      gold_reserves_rate = 0,
      gold_reserves_percentage = 0,
      total_yield_percentage = v_rate_pct,
      actual_fund_performance = v_rate_pct,
      notes = v_default_notes,
      distributed_by = COALESCE(p_admin_user_id, distributed_by),
      distributed_at = v_now,
      updated_at = v_now
    WHERE date = p_date
    RETURNING * INTO v_perf;
  ELSE
    -- Insert new daily performance record
    INSERT INTO daily_performance (
      date,
      rate,
      trading_profit_rate,
      trading_profit_percentage,
      gold_reserves_percentage,
      total_yield_percentage,
      is_yield_day,
      overall_fund_amount,
      actual_fund_performance,
      notes,
      distributed_by,
      created_by,
      distributed_at,
      created_at,
      updated_at
    ) VALUES (
      p_date,
      v_rate_pct,
      p_applicable_rate,
      v_rate_pct,
      0,
      v_rate_pct,
      TRUE,
      COALESCE(p_overall_fund_amount, 0),
      v_rate_pct,
      v_default_notes,
      COALESCE(p_admin_user_id, 'super_admin'),
      COALESCE(p_admin_user_id, 'super_admin'),
      v_now,
      v_now,
      v_now
    ) RETURNING * INTO v_perf;
  END IF;

  -- 5. Atomic Loop: Compute compounding principal and credit earnings per eligible user
  FOR v_user IN 
    SELECT id, email, status FROM users WHERE status != 'suspended' ORDER BY id ASC
  LOOP
    -- Calculate confirmed deposit principal eligible on or before p_date
    -- Strictly prioritizes eligibility_date when set, then confirmed_at, then created_at
    SELECT COALESCE(SUM(amount), 0) INTO v_user_dep_principal
    FROM deposits
    WHERE user_id = v_user.id
      AND status = 'confirmed'
      AND (
        CASE
          WHEN eligibility_date IS NOT NULL THEN (eligibility_date::date <= p_date::date)
          WHEN confirmed_at IS NOT NULL THEN (confirmed_at::date <= p_date::date)
          ELSE (created_at::date <= p_date::date)
        END
      );

    -- Calculate paid withdrawals (principal deduction)
    SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_user_withdrawn
    FROM withdrawals
    WHERE user_id = v_user.id AND status IN ('paid', 'completed');

    -- Eligible active compounding principal (referral income strictly excluded)
    v_user_principal := GREATEST(0.0000, v_user_dep_principal - v_user_withdrawn);

    -- Enforce minimum deposit qualification threshold ($300)
    IF v_user_principal >= v_min_deposit THEN
      v_yield_amount := ROUND(v_user_principal * p_applicable_rate, 4);

      -- Record user earning row (upsert/idempotent per user and date)
      INSERT INTO earnings (
        user_id,
        daily_performance_id,
        calculation_id,
        date,
        performance_date,
        active_principal,
        base_eligible_amount,
        rate_percentage,
        applicable_rate,
        payout_amount,
        earnings_amount,
        status,
        market_condition,
        note,
        created_at
      ) VALUES (
        v_user.id,
        v_perf.id,
        v_perf.id,
        p_date,
        p_date,
        v_user_principal,
        v_user_principal,
        v_rate_pct,
        p_applicable_rate,
        v_yield_amount,
        v_yield_amount,
        'credited',
        v_market_condition,
        v_default_notes,
        v_now
      )
      ON CONFLICT (user_id, performance_date) DO UPDATE SET
        active_principal = EXCLUDED.active_principal,
        base_eligible_amount = EXCLUDED.base_eligible_amount,
        rate_percentage = EXCLUDED.rate_percentage,
        applicable_rate = EXCLUDED.applicable_rate,
        payout_amount = EXCLUDED.payout_amount,
        earnings_amount = EXCLUDED.earnings_amount,
        status = 'credited',
        market_condition = EXCLUDED.market_condition,
        note = EXCLUDED.note,
        created_at = v_now
      RETURNING id INTO v_earning_id;

      -- Double-Entry Ledger Entry (Idempotent per user and performance date)
      IF NOT EXISTS (
        SELECT 1 FROM ledger 
        WHERE user_id = v_user.id 
          AND reference_id = v_perf.id::TEXT 
          AND type IN ('daily_earnings', 'daily_loss')
      ) THEN
        -- Compute new available balance
        SELECT (
          COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = v_user.id AND status = 'confirmed'), 0) +
          COALESCE((SELECT SUM(COALESCE(earnings_amount, payout_amount, 0)) FROM earnings WHERE user_id = v_user.id AND status = 'credited'), 0) +
          COALESCE((SELECT SUM(amount) FROM referral_rewards WHERE referrer_id = v_user.id AND status = 'credited'), 0) +
          COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id = v_user.id AND type = 'admin_adjustment'), 0) -
          COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_user.id AND status IN ('paid', 'completed')), 0) -
          COALESCE((SELECT SUM(COALESCE(requested_amount, amount, 0)) FROM withdrawals WHERE user_id = v_user.id AND status IN ('pending', 'approved', 'processing', 'under_review')), 0)
        ) INTO v_user_available_balance;

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
          v_user.id,
          CASE WHEN v_yield_amount >= 0 THEN 'daily_earnings' ELSE 'daily_loss' END,
          v_yield_amount,
          v_user_available_balance,
          v_perf.id::TEXT,
          format('Daily performance yield for %s @ %s%% on %s USDT', p_date, v_rate_pct, v_user_principal),
          COALESCE(p_admin_user_id, 'system'),
          v_now
        );
      END IF;

      v_applied_count := v_applied_count + 1;
      v_total_distributed := v_total_distributed + v_yield_amount;
      v_total_eligible_principal := v_total_eligible_principal + v_user_principal;
    END IF;
  END LOOP;

  -- 6. Update Daily Performance Header Aggregates
  UPDATE daily_performance SET
    applied_count = v_applied_count,
    total_distributed = v_total_distributed,
    overall_fund_amount = CASE 
      WHEN v_total_eligible_principal > 0 THEN v_total_eligible_principal 
      ELSE COALESCE(p_overall_fund_amount, overall_fund_amount, 0)
    END,
    updated_at = v_now
  WHERE id = v_perf.id
  RETURNING * INTO v_perf;

  -- 7. Audit Log
  INSERT INTO audit_logs (
    action, actor_id, actor_role, reason, reference_id, created_at
  ) VALUES (
    'DAILY_PERFORMANCE_APPLIED',
    COALESCE(p_admin_user_id, 'super_admin'),
    'admin',
    format('%s %s%% performance yield to %s accounts for %s',
      CASE WHEN p_overwrite_existing THEN 'Updated/Recalculated' ELSE 'Distributed' END,
      v_rate_pct, v_applied_count, p_date
    ),
    v_perf.id::TEXT,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'performance', to_jsonb(v_perf),
    'appliedCount', v_applied_count,
    'totalDistributed', v_total_distributed,
    'totalEligiblePrincipal', v_total_eligible_principal
  );
END;
$$;
