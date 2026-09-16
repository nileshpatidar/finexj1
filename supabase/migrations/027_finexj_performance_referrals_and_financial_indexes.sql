-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 027: PERFORMANCE COMPOSITE INDEXES FOR REFERRALS & FINANCIAL DATA
-- ==============================================================================
-- Targeted composite indexes to support high-throughput financial query patterns:
-- 1. Referrals: Chronological pagination by referrer_id (Level 1 & Level 2 pagination)
-- 2. Referrals: Authorization verification (check if referred_id belongs to referrer_id)
-- 3. Referral Rewards: Direct rewards sum by referrer, referred user, and status
-- 4. Deposits: Fast qualification status checks by user_id and status
-- ==============================================================================

-- 1. Referrals Chronological Pagination Composite Index
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created 
  ON referrals(referrer_id, created_at DESC);

-- 2. Referrals Direct Tree Authorization & Relationship Index
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_referred 
  ON referrals(referrer_id, referred_id);

-- 3. Referral Rewards Direct Lookups by Referrer & Referred User
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_referred_status 
  ON referral_rewards(referrer_id, referred_id, status);

-- 4. Deposits User & Status Composite Index
CREATE INDEX IF NOT EXISTS idx_deposits_user_status 
  ON deposits(user_id, status);
