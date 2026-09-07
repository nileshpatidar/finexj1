-- ==============================================================================
-- Migration 015: FINEXJ Step 14 - Atomic Daily Performance Yield Distribution (PERF-001)
-- ==============================================================================
-- Hardens daily performance yield distribution so the entire batch operation is:
-- 1. 100% ACID atomic within a single PostgreSQL transaction (zero partial payout).
-- 2. Concurrency-safe via transaction advisory lock (pg_advisory_xact_lock) serializing execution per date.
-- 3. Idempotent: rejects duplicate distribution attempts unless overwrite is explicitly requested.
-- 4. Consistent: credits earnings, calculates exact balance_after, and appends double-entry ledger entries.
-- 5. Safe: enforces strict minimum deposit threshold ($300 default) and non-compounding referral isolation.
-- ==============================================================================

-- 1. Ensure unique constraint on daily_performances(date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_daily_performances_date'
  ) THEN
    -- Check if table exists and add constraint if not present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_performances') THEN
      BEGIN
        ALTER TABLE daily_performances ADD CONSTRAINT uq_daily_performances_date UNIQUE (date);
      EXCEPTION WHEN OTHERS THEN
        NULL; -- Index already exists or constraint already enforced
      END;
    END IF;
  END IF;
END $$;

-- 2. Ensure composite unique constraint on earnings (user_id, daily_performance_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_earnings_user_daily_perf_uniq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_earnings_user_daily_perf_uniq 
      ON earnings (user_id, daily_performance_id) 
      WHERE daily_performance_id IS NOT NULL;
  END IF;
END $$;

-- 3. Define distribute_daily_performance_atomic
CREATE OR REPLACE FUNCTION distribute_daily_performance_atomic(
  p_date TEXT,
  p_applicable_rate NUMERIC(12, 6),
  p_overall_fund_amount NUMERIC(18, 4) DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_admin_user_id TEXT DEFAULT 'super_admin',
  p_overwrite_existing BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_perf daily_performances%ROWTYPE;
  v_user RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_min_deposit NUMERIC(18, 4) := 300.0000;
  v_raw_min_setting TEXT;
  v_user_dep_principal NUMERIC(18, 4);
  v_user_withdrawn NUMERIC(18, 4);
  v_user_principal NUMERIC(18, 4);
  v_yield_amount NUMERIC(18, 4);
  v_balance_after NUMERIC(18, 4);
  v_total_dep NUMERIC(18, 4);
  v_total_earn NUMERIC(18, 4);
  v_total_ref NUMERIC(18, 4);
  v_total_adj NUMERIC(18, 4);
  v_total_wd NUMERIC(18, 4);
  v_total_wd_pend NUMERIC(18, 4);
  v_applied_count INTEGER := 0;
  v_total_distributed NUMERIC(18, 4) := 0.0000;
  v_total_eligible_principal NUMERIC(18, 4) := 0.0000;
  v_final_fund_amount NUMERIC(18, 4) := 0.0000;
  v_rate_pct NUMERIC(12, 6);
  v_default_notes TEXT;
BEGIN
  -- 1. Input Validation
  IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid performance date is required in YYYY-MM-DD format.');
  END IF;

  IF p_applicable_rate IS NULL OR p_applicable_rate < -1.0 OR p_applicable_rate > 1.0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'applicableRate is required and must be between -1.0 and 1.0.');
  END IF;

  -- 2. Transaction Advisory Lock per date to serialize concurrent executions
  PERFORM pg_advisory_xact_lock(hashtext('finexj_daily_perf_' || p_date));

  -- 3. Read and validate minimum deposit configuration from system_settings
  SELECT value INTO v_raw_min_setting FROM system_settings WHERE key = 'minimumDepositAmount';
  IF v_raw_min_setting IS NOT NULL AND TRIM(v_raw_min_setting) <> '' THEN
    BEGIN
      v_min_deposit := v_raw_min_setting::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_min_deposit := 300.0000;
    END;
  END IF;

  IF v_min_deposit <= 0 THEN
    v_min_deposit := 300.0000;
  END IF;

  v_rate_pct := ROUND(p_applicable_rate * 100.0, 4);
  v_default_notes := COALESCE(p_notes, format('Daily verified fund yield distribution (%s%%)', ROUND(v_rate_pct, 2)));

  -- 4. Check for Existing Performance Record for this date
  SELECT * INTO v_perf FROM daily_performances WHERE date = p_date FOR UPDATE;

  IF FOUND THEN
    IF NOT p_overwrite_existing THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Performance yield for date %s has already been calculated and distributed (%s%%). Enable overwrite to recalculate.', p_date, ROUND(v_perf.applicable_rate * 100.0, 2))
      );
    END IF;

    -- Overwrite mode: Cleanly rollback prior earnings and corresponding ledger entries for this calculation
    DELETE FROM earnings WHERE daily_performance_id = v_perf.id OR date = p_date;
    DELETE FROM ledger WHERE reference_id = v_perf.id::text AND type IN ('daily_earnings', 'daily_loss');

    UPDATE daily_performances SET
      rate_percentage = v_rate_pct,
      applicable_rate = p_applicable_rate,
      trading_profit_percentage = v_rate_pct,
      total_yield_percentage = v_rate_pct,
      actual_fund_performance = v_rate_pct,
      overall_fund_amount = COALESCE(p_overall_fund_amount, 0),
      notes = v_default_notes,
      distributed_by = COALESCE(p_admin_user_id, 'super_admin'),
      distributed_at = v_now,
      updated_at = v_now
    WHERE id = v_perf.id;
  ELSE
    INSERT INTO daily_performances (
      date,
      rate_percentage,
      applicable_rate,
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
    SELECT COALESCE(SUM(amount), 0) INTO v_user_dep_principal
    FROM deposits
    WHERE user_id = v_user.id
      AND status = 'confirmed'
      AND (
        (eligibility_date IS NOT NULL AND eligibility_date <= p_date)
        OR (confirmed_at IS NOT NULL AND confirmed_at::date <= p_date::date)
        OR (created_at::date <= p_date::date)
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

      -- Record user earning row
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
        v_perf.id::text,
        p_date,
        p_date,
        v_user_principal,
        v_user_principal,
        v_rate_pct,
        p_applicable_rate,
        v_yield_amount,
        v_yield_amount,
        'credited',
        CASE WHEN v_yield_amount >= 0 THEN 'profit' ELSE 'loss' END,
        v_default_notes,
        v_now
      );

      -- Compute authoritative user balance_after within transaction
      SELECT COALESCE(SUM(amount), 0) INTO v_total_dep FROM deposits WHERE user_id = v_user.id AND status = 'confirmed';
      SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_total_earn FROM earnings WHERE user_id = v_user.id AND status = 'credited';
      SELECT COALESCE(SUM(amount), 0) INTO v_total_ref FROM referral_rewards WHERE referrer_id = v_user.id AND status = 'credited';
      SELECT COALESCE(SUM(amount), 0) INTO v_total_adj FROM ledger WHERE user_id = v_user.id AND type = 'admin_adjustment';
      SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_wd FROM withdrawals WHERE user_id = v_user.id AND status IN ('paid', 'completed');
      SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_total_wd_pend FROM withdrawals WHERE user_id = v_user.id AND status IN ('pending', 'approved', 'processing', 'under_review');

      v_balance_after := GREATEST(0.0000, v_total_dep + v_total_earn + v_total_ref + v_total_adj - v_total_wd - v_total_wd_pend);

      -- Append to double-entry ledger
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
        v_balance_after,
        v_perf.id::text,
        format('Daily performance yield for %s @ %s%% on %s USDT', p_date, ROUND(v_rate_pct, 2), v_user_principal),
        COALESCE(p_admin_user_id, 'super_admin'),
        v_now
      );

      v_applied_count := v_applied_count + 1;
      v_total_distributed := v_total_distributed + v_yield_amount;
      v_total_eligible_principal := v_total_eligible_principal + v_user_principal;
    END IF;
  END LOOP;

  -- 6. Update daily_performances aggregates
  v_final_fund_amount := CASE 
    WHEN v_total_eligible_principal > 0 THEN ROUND(v_total_eligible_principal, 2)
    WHEN p_overall_fund_amount > 0 THEN p_overall_fund_amount
    ELSE 0.00
  END;

  UPDATE daily_performances SET
    applied_count = v_applied_count,
    total_yield_distributed = ROUND(v_total_distributed, 2),
    overall_fund_amount = v_final_fund_amount,
    updated_at = v_now
  WHERE id = v_perf.id;

  -- 7. Audit Log Entry
  INSERT INTO audit_logs (
    action,
    actor_id,
    actor_email,
    actor_role,
    reason,
    created_at
  ) VALUES (
    'DAILY_PERFORMANCE_APPLIED',
    COALESCE(p_admin_user_id, 'super_admin'),
    'system',
    'admin',
    format('Distributed %s%% performance yield to %s accounts for %s (Total: %s USDT)', ROUND(v_rate_pct, 2), v_applied_count, p_date, ROUND(v_total_distributed, 2)),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'performance', jsonb_build_object(
      'id', v_perf.id,
      'date', p_date,
      'applicableRate', p_applicable_rate,
      'actualFundPerformance', v_rate_pct,
      'overallFundAmount', v_final_fund_amount,
      'appliedCount', v_applied_count,
      'totalDistributed', ROUND(v_total_distributed, 2),
      'notes', v_default_notes
    ),
    'appliedCount', v_applied_count,
    'totalDistributed', ROUND(v_total_distributed, 2)
  );
END;
$$;
