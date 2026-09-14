-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 023: STEP 48 PERFORMANCE & CONCURRENCY COMPOSITE INDEXES
-- ==============================================================================
-- Targeted composite indexes to support high-throughput financial query patterns:
-- 1. Deposits: User-filtered chronological pagination & admin status queries
-- 2. Withdrawals: User-filtered chronological pagination & status queue scanning
-- 3. Earnings: User-filtered performance date descending pagination
-- 4. Referral Rewards: Referrer-filtered status-qualified earnings pagination
-- 5. Ledger: User-filtered transaction type chronological queries & admin aggregations
-- 6. Audit Logs: Security action classification & chronological filtering
-- ==============================================================================

-- 1. Deposits High-Concurrency Composite Indexes
CREATE INDEX IF NOT EXISTS idx_deposits_user_created 
  ON deposits(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposits_status_created 
  ON deposits(status, created_at DESC);

-- 2. Withdrawals High-Concurrency Composite Indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created 
  ON withdrawals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created 
  ON withdrawals(status, created_at DESC);

-- 3. Earnings High-Concurrency Composite Indexes
CREATE INDEX IF NOT EXISTS idx_earnings_user_perf_date 
  ON earnings(user_id, performance_date DESC);

CREATE INDEX IF NOT EXISTS idx_earnings_status_created 
  ON earnings(status, created_at DESC);

-- 4. Referral Rewards High-Concurrency Composite Indexes
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_status 
  ON referral_rewards(referrer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_status_created 
  ON referral_rewards(status, created_at DESC);

-- 5. Ledger High-Concurrency Composite Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_user_type_created 
  ON ledger(user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_type_created 
  ON ledger(type, created_at DESC);

-- 6. Audit Logs High-Concurrency Composite Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
  ON audit_logs(action, created_at DESC);
