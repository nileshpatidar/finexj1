-- ==============================================================================
-- Migration 025: FINEXJ Step 57 - Financial Communication & Notes Hardening
-- ==============================================================================
-- Establishes a dedicated, secure financial messages & communication structure
-- for DEPOSITS and WITHDRAWALS, strictly segregating:
-- 1. User-Visible Messages (Accessible by transaction owner & admins)
-- 2. Admin-Internal Notes (Strictly restricted to administrators; NEVER leaked to users)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS financial_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_id INTEGER REFERENCES deposits(id) ON DELETE CASCADE,
  withdrawal_id INTEGER REFERENCES withdrawals(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin', 'system')),
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT chk_financial_record_target CHECK (deposit_id IS NOT NULL OR withdrawal_id IS NOT NULL)
);

-- Performance & Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_financial_messages_deposit_id ON financial_messages(deposit_id, created_at);
CREATE INDEX IF NOT EXISTS idx_financial_messages_withdrawal_id ON financial_messages(withdrawal_id, created_at);
CREATE INDEX IF NOT EXISTS idx_financial_messages_user_id ON financial_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_financial_messages_is_internal ON financial_messages(is_internal);

-- Row Level Security
ALTER TABLE financial_messages ENABLE ROW LEVEL SECURITY;

-- Service role full access policy
DROP POLICY IF EXISTS "service_role_all_financial_messages" ON financial_messages;
CREATE POLICY "service_role_all_financial_messages" ON financial_messages 
  FOR ALL TO service_role USING (true) WITH CHECK (true);
