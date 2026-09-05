-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 014: ADMIN ACCOUNTING COMPLETE DATABASE-SIDE AGGREGATION
-- Eliminates pagination limits (10000 / N records) for financial totals.
-- Executes 100% database-side SUM, COUNT, and GROUP BY with NUMERIC(24, 4) exactness.
-- ==============================================================================

-- 1. Complete Admin Accounting & Financial Reconciliation Summary RPC
CREATE OR REPLACE FUNCTION get_admin_accounting_summary(
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_today_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_today_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_min_deposit NUMERIC DEFAULT 300.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMP WITH TIME ZONE;
  v_today_end TIMESTAMP WITH TIME ZONE;

  -- Period / Filtered Totals
  v_period_deposited NUMERIC(24, 4) := 0;
  v_period_deposits_count BIGINT := 0;

  v_period_withdrawn_gross NUMERIC(24, 4) := 0;
  v_period_withdrawn_net NUMERIC(24, 4) := 0;
  v_period_withdrawal_fees NUMERIC(24, 4) := 0;
  v_period_withdrawals_count BIGINT := 0;

  v_period_earnings NUMERIC(24, 4) := 0;
  v_period_earnings_count BIGINT := 0;

  v_period_rewards_l1 NUMERIC(24, 4) := 0;
  v_period_rewards_l2 NUMERIC(24, 4) := 0;
  v_period_rewards_total NUMERIC(24, 4) := 0;
  v_period_rewards_count BIGINT := 0;

  -- Historical / All-Time Authoritative Totals
  v_all_time_deposited NUMERIC(24, 4) := 0;
  v_all_time_deposits_count BIGINT := 0;

  v_all_time_withdrawn_gross NUMERIC(24, 4) := 0;
  v_all_time_withdrawn_net NUMERIC(24, 4) := 0;
  v_all_time_withdrawal_fees NUMERIC(24, 4) := 0;
  v_all_time_withdrawals_count BIGINT := 0;

  -- Active Compounding Principal
  v_active_compounding_principal NUMERIC(24, 4) := 0;
  v_qualifying_users_count BIGINT := 0;
  v_qualifying_referrals_count BIGINT := 0;

  -- Liabilities & Operational Fund
  v_total_user_available_balances NUMERIC(24, 4) := 0;
  v_op_fund_balance NUMERIC(24, 4) := 0;
  v_op_fund_inflow NUMERIC(24, 4) := 0;
  v_op_fund_outflow NUMERIC(24, 4) := 0;
  v_op_fund_fee_income NUMERIC(24, 4) := 0;

  -- Today Breakdown
  v_today_deposits NUMERIC(24, 4) := 0;
  v_today_earnings NUMERIC(24, 4) := 0;
  v_today_rewards_l1 NUMERIC(24, 4) := 0;
  v_today_rewards_l2 NUMERIC(24, 4) := 0;
  v_today_rewards_total NUMERIC(24, 4) := 0;
  v_today_withdrawn_gross NUMERIC(24, 4) := 0;
  v_today_withdrawal_fees NUMERIC(24, 4) := 0;
  v_today_op_adjustments NUMERIC(24, 4) := 0;

  -- Reconciliation Variables
  v_net_system_capital NUMERIC(24, 4) := 0;
  v_recorded_liabilities_and_equity NUMERIC(24, 4) := 0;
  v_reconciliation_difference NUMERIC(24, 4) := 0;
  v_reconciliation_status TEXT;

  v_is_filtered BOOLEAN;
BEGIN
  -- Compute UTC bounds for today if not provided
  IF p_today_start IS NULL THEN
    v_today_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC');
  ELSE
    v_today_start := p_today_start;
  END IF;

  IF p_today_end IS NULL THEN
    v_today_end := v_today_start + INTERVAL '1 day' - INTERVAL '1 millisecond';
  ELSE
    v_today_end := p_today_end;
  END IF;

  v_is_filtered := (p_start_date IS NOT NULL OR p_end_date IS NOT NULL);

  -- 1. All-Time Confirmed Deposits Aggregation (100% of matching records)
  SELECT
    COALESCE(SUM(COALESCE(actual_amount, amount, 0)), 0)::NUMERIC(24, 4),
    COUNT(*)::BIGINT
  INTO v_all_time_deposited, v_all_time_deposits_count
  FROM deposits
  WHERE status = 'confirmed';

  -- 2. Filtered Period Confirmed Deposits
  IF v_is_filtered THEN
    SELECT
      COALESCE(SUM(COALESCE(actual_amount, amount, 0)), 0)::NUMERIC(24, 4),
      COUNT(*)::BIGINT
    INTO v_period_deposited, v_period_deposits_count
    FROM deposits
    WHERE status = 'confirmed'
      AND (p_start_date IS NULL OR COALESCE(confirmed_at, created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(confirmed_at, created_at) <= p_end_date);
  ELSE
    v_period_deposited := v_all_time_deposited;
    v_period_deposits_count := v_all_time_deposits_count;
  END IF;

  -- 3. All-Time Paid Withdrawals Aggregation
  SELECT
    COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0)::NUMERIC(24, 4),
    COALESCE(SUM(COALESCE(fee_amount, 0)), 0)::NUMERIC(24, 4),
    COALESCE(SUM(COALESCE(net_amount, (COALESCE(requested_amount, amount, 0) - COALESCE(fee_amount, 0)))), 0)::NUMERIC(24, 4),
    COUNT(*)::BIGINT
  INTO v_all_time_withdrawn_gross, v_all_time_withdrawal_fees, v_all_time_withdrawn_net, v_all_time_withdrawals_count
  FROM withdrawals
  WHERE status IN ('paid', 'completed');

  -- 4. Filtered Period Paid Withdrawals
  IF v_is_filtered THEN
    SELECT
      COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0)::NUMERIC(24, 4),
      COALESCE(SUM(COALESCE(fee_amount, 0)), 0)::NUMERIC(24, 4),
      COALESCE(SUM(COALESCE(net_amount, (COALESCE(requested_amount, amount, 0) - COALESCE(fee_amount, 0)))), 0)::NUMERIC(24, 4),
      COUNT(*)::BIGINT
    INTO v_period_withdrawn_gross, v_period_withdrawal_fees, v_period_withdrawn_net, v_period_withdrawals_count
    FROM withdrawals
    WHERE status IN ('paid', 'completed')
      AND (p_start_date IS NULL OR COALESCE(paid_at, created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(paid_at, created_at) <= p_end_date);
  ELSE
    v_period_withdrawn_gross := v_all_time_withdrawn_gross;
    v_period_withdrawal_fees := v_all_time_withdrawal_fees;
    v_period_withdrawn_net := v_all_time_withdrawn_net;
    v_period_withdrawals_count := v_all_time_withdrawals_count;
  END IF;

  -- 5. Daily Earnings Aggregation
  SELECT
    COALESCE(SUM(COALESCE(earnings_amount, 0)), 0)::NUMERIC(24, 4),
    COUNT(*)::BIGINT
  INTO v_period_earnings, v_period_earnings_count
  FROM earnings
  WHERE status = 'credited'
    AND (NOT v_is_filtered OR (
      (p_start_date IS NULL OR created_at >= p_start_date) AND
      (p_end_date IS NULL OR created_at <= p_end_date)
    ));

  -- 6. Referral Rewards Aggregation (L1, L2, Total)
  SELECT
    COALESCE(SUM(CASE WHEN reward_level = 1 OR (reward_level IS NULL AND (reference IS NULL OR reference NOT LIKE '%L2%')) THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN reward_level = 2 OR reference LIKE '%L2%' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(amount), 0)::NUMERIC(24, 4),
    COUNT(*)::BIGINT
  INTO v_period_rewards_l1, v_period_rewards_l2, v_period_rewards_total, v_period_rewards_count
  FROM referral_rewards
  WHERE status = 'credited'
    AND (NOT v_is_filtered OR (
      (p_start_date IS NULL OR created_at >= p_start_date) AND
      (p_end_date IS NULL OR created_at <= p_end_date)
    ));

  -- 7. Authoritative Active Compounding Principal (FINEXJ Eligibility & Principal Rules)
  -- Evaluated per user: only active users (status NOT IN ('suspended', 'banned')) whose principal >= p_min_deposit
  WITH user_deposits_agg AS (
    SELECT user_id, SUM(COALESCE(actual_amount, amount, 0)::NUMERIC(24, 4)) AS total_dep
    FROM deposits
    WHERE status = 'confirmed'
    GROUP BY user_id
  ),
  user_withdrawals_agg AS (
    SELECT user_id, SUM(COALESCE(requested_amount, amount, 0)::NUMERIC(24, 4)) AS total_wd
    FROM withdrawals
    WHERE status IN ('paid', 'completed')
    GROUP BY user_id
  ),
  user_principals AS (
    SELECT
      u.id AS user_id,
      GREATEST(0, COALESCE(ud.total_dep, 0) - COALESCE(uw.total_wd, 0))::NUMERIC(24, 4) AS principal
    FROM users u
    LEFT JOIN user_deposits_agg ud ON ud.user_id = u.id
    LEFT JOIN user_withdrawals_agg uw ON uw.user_id = u.id
    WHERE u.status NOT IN ('suspended', 'banned')
  )
  SELECT
    COALESCE(SUM(principal), 0)::NUMERIC(24, 4),
    COUNT(CASE WHEN principal >= p_min_deposit THEN 1 END)::BIGINT
  INTO v_active_compounding_principal, v_qualifying_users_count
  FROM user_principals
  WHERE principal >= p_min_deposit;

  -- 8. Qualifying Referrals Count: Unique users who made confirmed deposit >= minimumDepositAmount
  SELECT COUNT(DISTINCT user_id)::BIGINT
  INTO v_qualifying_referrals_count
  FROM deposits
  WHERE status = 'confirmed' AND COALESCE(actual_amount, amount, 0) >= p_min_deposit;

  -- 9. Complete Ledger Liability: Total User Available Balances
  SELECT COALESCE(SUM(amount), 0)::NUMERIC(24, 4)
  INTO v_total_user_available_balances
  FROM ledger;

  -- 10. FINEXJ Operational Fund
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN direction = 'outflow' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN direction = 'inflow' AND (LOWER(reason) LIKE '%fee%' OR reference LIKE 'FEE-%') THEN amount ELSE 0 END), 0)::NUMERIC(24, 4)
  INTO v_op_fund_inflow, v_op_fund_outflow, v_op_fund_fee_income
  FROM finexj_operational_ledger;

  -- Latest operational balance
  SELECT COALESCE(after_balance, 0)::NUMERIC(24, 4)
  INTO v_op_fund_balance
  FROM finexj_operational_ledger
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_op_fund_balance IS NULL THEN
    v_op_fund_balance := v_op_fund_inflow - v_op_fund_outflow;
  END IF;

  -- 11. Today's Financial Metrics Breakdown
  -- Confirmed deposits today
  SELECT COALESCE(SUM(COALESCE(actual_amount, amount, 0)), 0)::NUMERIC(24, 4)
  INTO v_today_deposits
  FROM deposits
  WHERE status = 'confirmed'
    AND COALESCE(confirmed_at, created_at) >= v_today_start
    AND COALESCE(confirmed_at, created_at) <= v_today_end;

  -- Credited earnings today
  SELECT COALESCE(SUM(COALESCE(earnings_amount, 0)), 0)::NUMERIC(24, 4)
  INTO v_today_earnings
  FROM earnings
  WHERE status = 'credited'
    AND created_at >= v_today_start
    AND created_at <= v_today_end;

  -- Referral rewards today
  SELECT
    COALESCE(SUM(CASE WHEN reward_level = 1 OR (reward_level IS NULL AND (reference IS NULL OR reference NOT LIKE '%L2%')) THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN reward_level = 2 OR reference LIKE '%L2%' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(amount), 0)::NUMERIC(24, 4)
  INTO v_today_rewards_l1, v_today_rewards_l2, v_today_rewards_total
  FROM referral_rewards
  WHERE status = 'credited'
    AND created_at >= v_today_start
    AND created_at <= v_today_end;

  -- Paid withdrawals today
  SELECT
    COALESCE(SUM(COALESCE(requested_amount, amount, 0)), 0)::NUMERIC(24, 4),
    COALESCE(SUM(COALESCE(fee_amount, 0)), 0)::NUMERIC(24, 4)
  INTO v_today_withdrawn_gross, v_today_withdrawal_fees
  FROM withdrawals
  WHERE status IN ('paid', 'completed')
    AND COALESCE(paid_at, created_at) >= v_today_start
    AND COALESCE(paid_at, created_at) <= v_today_end;

  -- Operational adjustments today
  SELECT COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE -amount END), 0)::NUMERIC(24, 4)
  INTO v_today_op_adjustments
  FROM finexj_operational_ledger
  WHERE created_at >= v_today_start
    AND created_at <= v_today_end;

  -- 12. Complete Reconciliation Difference
  -- Net System Liquid Capital = All-time Confirmed Deposits + Op Inflow - All-time Net Payouts - Op Outflow
  v_net_system_capital := (v_all_time_deposited + v_op_fund_inflow) - v_all_time_withdrawn_net - v_op_fund_outflow;
  -- Recorded Liabilities & Equity = Total User Available Balances (user-owned funds) + Operational Fund Balance
  v_recorded_liabilities_and_equity := v_total_user_available_balances + v_op_fund_balance;
  -- Reconciliation Difference: exact difference preserved (never silently forced to 0)
  v_reconciliation_difference := v_net_system_capital - v_recorded_liabilities_and_equity;

  IF ABS(v_reconciliation_difference) <= 0.0001 THEN
    v_reconciliation_status := 'BALANCED';
  ELSE
    v_reconciliation_status := 'REQUIRES_REVIEW';
  END IF;

  RETURN jsonb_build_object(
    'total_deposited', v_period_deposited,
    'total_deposits_count', v_period_deposits_count,
    'active_compounding_principal', v_active_compounding_principal,
    'qualifying_users_count', v_qualifying_users_count,
    'total_daily_earnings_distributed', v_period_earnings,
    'total_daily_earnings_count', v_period_earnings_count,
    'total_referral_rewards_paid', v_period_rewards_total,
    'total_referral_rewards_l1', v_period_rewards_l1,
    'total_referral_rewards_l2', v_period_rewards_l2,
    'total_referral_rewards_count', v_period_rewards_count,
    'qualifying_referrals_count', v_qualifying_referrals_count,
    'total_withdrawn', v_period_withdrawn_gross,
    'total_net_payout', v_period_withdrawn_net,
    'total_fees_collected', v_period_withdrawal_fees,
    'finexj_retained_fees', v_period_withdrawal_fees,
    'total_paid_withdrawals_count', v_period_withdrawals_count,
    'operational_fund_balance', v_op_fund_balance,
    'operational_fund_inflow', v_op_fund_inflow,
    'operational_fund_outflow', v_op_fund_outflow,
    'operational_fund_fee_income', v_op_fund_fee_income,
    'total_user_available_balances', v_total_user_available_balances,
    'expected_accounting_position', v_net_system_capital,
    'reconciliation_difference', v_reconciliation_difference,
    'reconciliation_status', v_reconciliation_status,
    'today_breakdown', jsonb_build_object(
      'deposits', v_today_deposits,
      'daily_earnings', v_today_earnings,
      'referral_rewards_l1', v_today_rewards_l1,
      'referral_rewards_l2', v_today_rewards_l2,
      'total_referral_rewards', v_today_rewards_total,
      'withdrawals', v_today_withdrawn_gross,
      'withdrawal_fees', v_today_withdrawal_fees,
      'finexj_retained_fees', v_today_withdrawal_fees,
      'operational_adjustments', v_today_op_adjustments
    )
  );
END;
$$;

-- 2. Referral Accounting Summary RPC (Zero record truncation, pure DB aggregation)
CREATE OR REPLACE FUNCTION get_referral_accounting_summary(
  p_today_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_min_deposit NUMERIC DEFAULT 300.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMP WITH TIME ZONE;
  v_total_rewards_count BIGINT := 0;
  v_total_rewards_amount NUMERIC(24, 4) := 0;
  v_l1_amount NUMERIC(24, 4) := 0;
  v_l2_amount NUMERIC(24, 4) := 0;
  v_unique_referrers BIGINT := 0;
  v_today_rewards_amount NUMERIC(24, 4) := 0;
  v_total_referrals_count BIGINT := 0;
  v_qualifying_referrals_count BIGINT := 0;
BEGIN
  IF p_today_start IS NULL THEN
    v_today_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC');
  ELSE
    v_today_start := p_today_start;
  END IF;

  -- 1. All-time referral rewards aggregation
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'credited' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN status = 'credited' AND (reward_level = 1 OR (reward_level IS NULL AND (reference IS NULL OR reference NOT LIKE '%L2%'))) THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN status = 'credited' AND (reward_level = 2 OR reference LIKE '%L2%') THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COUNT(DISTINCT CASE WHEN status = 'credited' THEN referrer_id END)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'credited' AND created_at >= v_today_start THEN amount ELSE 0 END), 0)::NUMERIC(24, 4)
  INTO
    v_total_rewards_count,
    v_total_rewards_amount,
    v_l1_amount,
    v_l2_amount,
    v_unique_referrers,
    v_today_rewards_amount
  FROM referral_rewards;

  -- 2. Total referrals count
  SELECT COUNT(*)::BIGINT
  INTO v_total_referrals_count
  FROM referrals;

  -- 3. Qualifying referrals count
  SELECT COUNT(DISTINCT user_id)::BIGINT
  INTO v_qualifying_referrals_count
  FROM deposits
  WHERE status = 'confirmed' AND COALESCE(actual_amount, amount, 0) >= p_min_deposit;

  RETURN jsonb_build_object(
    'total_rewards_count', v_total_rewards_count,
    'total_rewards_amount', v_total_rewards_amount,
    'level1_rewards_amount', v_l1_amount,
    'level2_rewards_amount', v_l2_amount,
    'unique_referrers_count', v_unique_referrers,
    'total_referrals_count', v_total_referrals_count,
    'qualifying_referrals_count', v_qualifying_referrals_count,
    'today_rewards_amount', v_today_rewards_amount
  );
END;
$$;

-- 3. Operational Fund Aggregation RPC
CREATE OR REPLACE FUNCTION get_operational_fund_summary_aggregate()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance NUMERIC(24, 4) := 0;
  v_total_inflow NUMERIC(24, 4) := 0;
  v_total_outflow NUMERIC(24, 4) := 0;
  v_total_fee_income NUMERIC(24, 4) := 0;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN direction = 'outflow' THEN amount ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN direction = 'inflow' AND (LOWER(reason) LIKE '%fee%' OR reference LIKE 'FEE-%') THEN amount ELSE 0 END), 0)::NUMERIC(24, 4)
  INTO v_total_inflow, v_total_outflow, v_total_fee_income
  FROM finexj_operational_ledger;

  SELECT COALESCE(after_balance, 0)::NUMERIC(24, 4)
  INTO v_current_balance
  FROM finexj_operational_ledger
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_current_balance IS NULL THEN
    v_current_balance := v_total_inflow - v_total_outflow;
  END IF;

  RETURN jsonb_build_object(
    'current_balance', v_current_balance,
    'total_inflow', v_total_inflow,
    'total_outflow', v_total_outflow,
    'total_fee_income', v_total_fee_income
  );
END;
$$;

-- 4. Admin Dashboard Stats Aggregation RPC (Zero pagination truncation)
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats_aggregate()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users BIGINT := 0;
  v_active_users BIGINT := 0;
  v_confirmed_dep_sum NUMERIC(24, 4) := 0;
  v_confirmed_dep_count BIGINT := 0;
  v_pending_dep_sum NUMERIC(24, 4) := 0;
  v_pending_dep_count BIGINT := 0;
  v_paid_wd_gross NUMERIC(24, 4) := 0;
  v_paid_wd_net NUMERIC(24, 4) := 0;
  v_paid_wd_fees NUMERIC(24, 4) := 0;
  v_paid_wd_count BIGINT := 0;
  v_pending_wd_sum NUMERIC(24, 4) := 0;
  v_pending_wd_count BIGINT := 0;
  v_earnings_allocated NUMERIC(24, 4) := 0;
  v_vault_liquidity NUMERIC(24, 4) := 0;
BEGIN
  -- Users
  SELECT
    COUNT(CASE WHEN role = 'user' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN role = 'user' AND status = 'active' THEN 1 END)::BIGINT
  INTO v_total_users, v_active_users
  FROM users;

  -- Deposits
  SELECT
    COALESCE(SUM(CASE WHEN status = 'confirmed' THEN COALESCE(actual_amount, amount, 0) ELSE 0 END), 0)::NUMERIC(24, 4),
    COUNT(CASE WHEN status = 'confirmed' THEN 1 END)::BIGINT,
    COALESCE(SUM(CASE WHEN status IN ('pending', 'confirming') THEN COALESCE(actual_amount, amount, 0) ELSE 0 END), 0)::NUMERIC(24, 4),
    COUNT(CASE WHEN status IN ('pending', 'confirming') THEN 1 END)::BIGINT
  INTO v_confirmed_dep_sum, v_confirmed_dep_count, v_pending_dep_sum, v_pending_dep_count
  FROM deposits;

  -- Withdrawals
  SELECT
    COALESCE(SUM(CASE WHEN status IN ('paid', 'completed') THEN COALESCE(requested_amount, amount, 0) ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN status IN ('paid', 'completed') THEN COALESCE(net_amount, (COALESCE(requested_amount, amount, 0) - COALESCE(fee_amount, 0))) ELSE 0 END), 0)::NUMERIC(24, 4),
    COALESCE(SUM(CASE WHEN status IN ('paid', 'completed') THEN COALESCE(fee_amount, 0) ELSE 0 END), 0)::NUMERIC(24, 4),
    COUNT(CASE WHEN status IN ('paid', 'completed') THEN 1 END)::BIGINT,
    COALESCE(SUM(CASE WHEN status IN ('pending', 'under_review') THEN COALESCE(requested_amount, amount, 0) ELSE 0 END), 0)::NUMERIC(24, 4),
    COUNT(CASE WHEN status IN ('pending', 'under_review') THEN 1 END)::BIGINT
  INTO v_paid_wd_gross, v_paid_wd_net, v_paid_wd_fees, v_paid_wd_count, v_pending_wd_sum, v_pending_wd_count
  FROM withdrawals;

  -- Earnings
  SELECT COALESCE(SUM(COALESCE(earnings_amount, 0)), 0)::NUMERIC(24, 4)
  INTO v_earnings_allocated
  FROM earnings
  WHERE status = 'credited';

  v_vault_liquidity := (v_confirmed_dep_sum + v_earnings_allocated) - v_paid_wd_gross;

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'active_users', v_active_users,
    'total_confirmed_deposits', v_confirmed_dep_sum,
    'total_confirmed_deposits_count', v_confirmed_dep_count,
    'total_paid_withdrawals', v_paid_wd_gross,
    'total_paid_withdrawals_net', v_paid_wd_net,
    'total_paid_withdrawals_count', v_paid_wd_count,
    'total_withdrawal_fees', v_paid_wd_fees,
    'pending_withdrawals_count', v_pending_wd_count,
    'total_pending_withdrawals_amount', v_pending_wd_sum,
    'pending_deposits_count', v_pending_dep_count,
    'total_pending_deposits_amount', v_pending_dep_sum,
    'total_earnings_allocated', v_earnings_allocated,
    'vault_retained_liquidity', v_vault_liquidity
  );
END;
$$;
