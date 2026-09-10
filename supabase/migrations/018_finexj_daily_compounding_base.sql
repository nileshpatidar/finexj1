-- ==============================================================================
-- Migration 018: True Daily Compounding Base & Segregated Referral Accounting
-- ==============================================================================
-- BUSINESS RULES:
-- 1. Today's Base Eligible Amount = eligible active deposit principal (within independent 55-day maturity)
--    + previous credited compounding earnings (strictly before calculation date)
--    - amounts withdrawn from compounding capital (paid withdrawals).
-- 2. Referral rewards MUST NOT compound and are strictly segregated.
-- 3. Withdrawals permanently reduce the compounding base.
-- 4. Independent 55-day maturity and 30-day lock timelines per deposit are preserved.
-- 5. Store base_eligible_amount in earnings rows.
-- 6. Strictly prevent double-counting of current day's earnings.
-- ==============================================================================

CREATE OR REPLACE FUNCTION distribute_daily_performance_atomic(
  p_date TEXT,
  p_applicable_rate NUMERIC,
  p_overall_fund_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_admin_user_id TEXT DEFAULT 'super_admin',
  p_overwrite_existing BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_obtained BOOLEAN;
  v_rate_pct NUMERIC;
  v_market_condition TEXT;
  v_default_notes TEXT;
  v_min_deposit NUMERIC := 300.0000;
  v_perf RECORD;
  v_user RECORD;
  v_user_dep_principal NUMERIC;
  v_user_prev_earnings NUMERIC;
  v_user_withdrawn NUMERIC;
  v_user_principal NUMERIC;
  v_yield_amount NUMERIC;
  v_earning_id BIGINT;
  v_user_available_balance NUMERIC;
  v_total_distributed NUMERIC := 0.0000;
  v_applied_count INTEGER := 0;
  v_total_eligible_principal NUMERIC := 0.0000;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- 1. Concurrency Control: Acquire transaction-level advisory xact lock for the target date
  v_lock_obtained := pg_try_advisory_xact_lock(hashtext('finexj_daily_perf_' || p_date));
  IF NOT v_lock_obtained THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Concurrent daily performance distribution in progress for date ' || p_date || '. Lock unavailable.'
    );
  END IF;

  -- 2. Validate Performance Date Format (YYYY-MM-DD)
  IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Valid performance date is required in YYYY-MM-DD format (e.g. 2026-08-31).'
    );
  END IF;

  -- 3. Rate derivation and market condition
  v_rate_pct := ROUND(p_applicable_rate * 100, 4);
  IF p_applicable_rate > 0 THEN
    v_market_condition := 'profit';
  ELSIF p_applicable_rate < 0 THEN
    v_market_condition := 'loss';
  ELSE
    v_market_condition := 'neutral';
  END IF;

  v_default_notes := COALESCE(
    p_notes,
    format('Daily verified fund yield distribution (%s%s%%)', CASE WHEN v_rate_pct >= 0 THEN '+' ELSE '' END, v_rate_pct)
  );

  -- Fetch minimum deposit threshold from system_settings if configured
  BEGIN
    SELECT value::NUMERIC INTO v_min_deposit
    FROM system_settings
    WHERE key = 'minimumDepositAmount'
    LIMIT 1;
    IF v_min_deposit IS NULL OR v_min_deposit <= 0 THEN
      v_min_deposit := 300.0000;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_min_deposit := 300.0000;
  END;

  -- 4. Idempotency Check: Existing record for p_date
  SELECT * INTO v_perf FROM daily_performances WHERE date = p_date;
  IF v_perf.id IS NOT NULL AND NOT p_overwrite_existing THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', format('Performance yield for date %s has already been calculated and distributed (%s%%). Enable overwrite to update.', p_date, v_perf.total_yield_percentage)
    );
  END IF;

  -- If overwriting existing, clean previous earnings and ledger for this performance_date
  IF v_perf.id IS NOT NULL AND p_overwrite_existing THEN
    DELETE FROM ledger WHERE reference_id = v_perf.id::TEXT AND type IN ('daily_earnings', 'daily_loss');
    DELETE FROM earnings WHERE daily_performance_id = v_perf.id OR performance_date = p_date OR date = p_date;

    UPDATE daily_performances SET
      performance_percentage = v_rate_pct,
      applicable_rate = p_applicable_rate,
      trading_profit_percentage = v_rate_pct,
      total_yield_percentage = v_rate_pct,
      overall_fund_amount = COALESCE(p_overall_fund_amount, 0),
      actual_fund_performance = v_rate_pct,
      notes = v_default_notes,
      distributed_by = COALESCE(p_admin_user_id, 'super_admin'),
      distributed_at = v_now,
      updated_at = v_now
    WHERE id = v_perf.id
    RETURNING * INTO v_perf;
  ELSE
    INSERT INTO daily_performances (
      date,
      performance_percentage,
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

  -- 5. Atomic Loop: Compute compounding base and credit earnings per eligible user
  FOR v_user IN 
    SELECT id, email, status FROM users WHERE status != 'suspended' ORDER BY id ASC
  LOOP
    -- 1. Calculate active confirmed deposit principal eligible on or before p_date within 55 calendar days maturity
    -- Independent 55-day maturity window per deposit preserved
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
      )
      AND (
        p_date::date - (
          CASE
            WHEN eligibility_date IS NOT NULL THEN eligibility_date::date
            WHEN confirmed_at IS NOT NULL THEN confirmed_at::date
            ELSE created_at::date
          END
        ) < 55
      );

    -- 2. Calculate previous credited compounding earnings strictly before p_date (prevents double-counting)
    SELECT COALESCE(SUM(COALESCE(earnings_amount, payout_amount, 0)), 0) INTO v_user_prev_earnings
    FROM earnings
    WHERE user_id = v_user.id
      AND status = 'credited'
      AND (
        CASE
          WHEN performance_date IS NOT NULL THEN performance_date::date < p_date::date
          WHEN date IS NOT NULL THEN date::date < p_date::date
          ELSE created_at::date < p_date::date
        END
      );

    -- 3. Calculate paid withdrawals on or before p_date (amounts withdrawn permanently reduce compounding capital)
    SELECT COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0) INTO v_user_withdrawn
    FROM withdrawals
    WHERE user_id = v_user.id 
      AND status IN ('paid', 'completed')
      AND (
        CASE
          WHEN paid_at IS NOT NULL THEN paid_at::date <= p_date::date
          ELSE created_at::date <= p_date::date
        END
      );

    -- 4. True Daily Compounding Base: active deposit principal + previous credited earnings - amounts withdrawn
    -- Referral rewards are strictly segregated and NEVER included in compounding
    v_user_principal := GREATEST(0.0000, v_user_dep_principal + v_user_prev_earnings - v_user_withdrawn);

    -- Enforce minimum deposit qualification threshold ($300)
    IF v_user_principal >= v_min_deposit THEN
      v_yield_amount := ROUND(v_user_principal * p_applicable_rate, 4);

      -- Guarantee idempotency by cleaning any existing earnings for this user and date
      DELETE FROM earnings WHERE user_id = v_user.id AND (daily_performance_id = v_perf.id OR performance_date = p_date OR date = p_date);

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
        v_perf.id::TEXT,
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
          format('Daily performance yield for %s @ %s%% on %s USDT compounding base', p_date, v_rate_pct, v_user_principal),
          COALESCE(p_admin_user_id, 'super_admin'),
          v_now
        );
      END IF;

      v_applied_count := v_applied_count + 1;
      v_total_distributed := v_total_distributed + v_yield_amount;
      v_total_eligible_principal := v_total_eligible_principal + v_user_principal;
    END IF;
  END LOOP;

  -- 6. Update Daily Performance Aggregate Totals
  UPDATE daily_performances SET
    applied_count = v_applied_count,
    total_distributed = v_total_distributed,
    overall_fund_amount = CASE 
      WHEN v_total_eligible_principal > 0 THEN v_total_eligible_principal 
      WHEN COALESCE(p_overall_fund_amount, 0) > 0 THEN p_overall_fund_amount 
      ELSE 0 
    END,
    updated_at = v_now
  WHERE id = v_perf.id
  RETURNING * INTO v_perf;

  -- 7. Audit Log Entry
  INSERT INTO audit_logs (
    action,
    actor_id,
    actor_role,
    reason,
    created_at
  ) VALUES (
    'DAILY_PERFORMANCE_DISTRIBUTED_ATOMIC',
    COALESCE(p_admin_user_id, 'super_admin'),
    'admin',
    format('Distributed %s%% daily compounding yield to %s accounts for date %s (Total: %s USDT on %s USDT compounding base)',
      v_rate_pct, v_applied_count, p_date, v_total_distributed, v_total_eligible_principal),
    v_now
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'performance', row_to_json(v_perf),
    'appliedCount', v_applied_count,
    'totalDistributed', v_total_distributed,
    'totalEligiblePrincipal', v_total_eligible_principal
  );
END;
$$;
