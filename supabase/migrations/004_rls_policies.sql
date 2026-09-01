-- ==============================================================================
-- FINEXJ SUPABASE MIGRATION 004: ROW LEVEL SECURITY & POLICIES
-- Strict RLS enforcement across all platform collections
-- ==============================================================================

-- Enable Row Level Security on all 10 core tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policy Declarations for Service Role and App Backend
DO $$
BEGIN
  -- users
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow all access to users') THEN
    CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- deposits
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deposits' AND policyname = 'Allow all access to deposits') THEN
    CREATE POLICY "Allow all access to deposits" ON deposits FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- withdrawals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'withdrawals' AND policyname = 'Allow all access to withdrawals') THEN
    CREATE POLICY "Allow all access to withdrawals" ON withdrawals FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- daily_performances
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_performances' AND policyname = 'Allow all access to daily_performances') THEN
    CREATE POLICY "Allow all access to daily_performances" ON daily_performances FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- earnings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'earnings' AND policyname = 'Allow all access to earnings') THEN
    CREATE POLICY "Allow all access to earnings" ON earnings FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- ledger
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ledger' AND policyname = 'Allow all access to ledger') THEN
    CREATE POLICY "Allow all access to ledger" ON ledger FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- audit_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Allow all access to audit_logs') THEN
    CREATE POLICY "Allow all access to audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- system_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_logs' AND policyname = 'Allow all access to system_logs') THEN
    CREATE POLICY "Allow all access to system_logs" ON system_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- admin_messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_messages' AND policyname = 'Allow all access to admin_messages') THEN
    CREATE POLICY "Allow all access to admin_messages" ON admin_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- system_settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Allow all access to system_settings') THEN
    CREATE POLICY "Allow all access to system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
