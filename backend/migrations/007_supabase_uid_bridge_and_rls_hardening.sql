-- ============================================================================
-- GrowMore PostgreSQL Schema Migration: 007_supabase_uid_bridge_and_rls_hardening.sql
-- 1. Bridge Supabase Auth UUID to internal BIGINT users table
-- 2. Apply Row Level Security (RLS) across all public tables
-- 3. Enforce least-privilege permissions and revoke anonymous access
-- Fully idempotent and safe for both hosted Supabase and standalone PostgreSQL.
-- ============================================================================

-- Ensure roles and auth helpers exist for portable execution
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- 1. SUPABASE_UID BRIDGE COLUMN ON USERS TABLE
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'supabase_uid'
  ) THEN
    ALTER TABLE public.users ADD COLUMN supabase_uid UUID UNIQUE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_uid 
  ON public.users (supabase_uid) WHERE supabase_uid IS NOT NULL;

-- Automatically link existing users by case-insensitive email if present in auth.users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    UPDATE public.users u
    SET supabase_uid = a.id
    FROM auth.users a
    WHERE LOWER(u.email) = LOWER(a.email)
      AND u.supabase_uid IS NULL
      AND a.email IS NOT NULL AND a.email <> '';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) ACTIVATION ON ALL PUBLIC TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_plans ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. CLEAN EXISTING POLICIES FOR IDEMPOTENT RE-APPLICATION
-- ----------------------------------------------------------------------------
-- users
DROP POLICY IF EXISTS "Users can read own user record" ON public.users;
DROP POLICY IF EXISTS "Service role full access on users" ON public.users;
DROP POLICY IF EXISTS "Postgres full access on users" ON public.users;

-- wallet_ledger
DROP POLICY IF EXISTS "Users can view own ledger entries" ON public.wallet_ledger;
DROP POLICY IF EXISTS "Service role full access on wallet_ledger" ON public.wallet_ledger;
DROP POLICY IF EXISTS "Postgres full access on wallet_ledger" ON public.wallet_ledger;

-- investments
DROP POLICY IF EXISTS "Users can view own investments" ON public.investments;
DROP POLICY IF EXISTS "Service role full access on investments" ON public.investments;
DROP POLICY IF EXISTS "Postgres full access on investments" ON public.investments;

-- deposits
DROP POLICY IF EXISTS "Users can view own deposits" ON public.deposits;
DROP POLICY IF EXISTS "Service role full access on deposits" ON public.deposits;
DROP POLICY IF EXISTS "Postgres full access on deposits" ON public.deposits;

-- withdrawals
DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Service role full access on withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Postgres full access on withdrawals" ON public.withdrawals;

-- otp_verifications (completely restricted from browser clients)
DROP POLICY IF EXISTS "Service role full access on otp_verifications" ON public.otp_verifications;
DROP POLICY IF EXISTS "Postgres full access on otp_verifications" ON public.otp_verifications;

-- payments
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Service role full access on payments" ON public.payments;
DROP POLICY IF EXISTS "Postgres full access on payments" ON public.payments;

-- payout_transactions
DROP POLICY IF EXISTS "Service role full access on payout_transactions" ON public.payout_transactions;
DROP POLICY IF EXISTS "Postgres full access on payout_transactions" ON public.payout_transactions;

-- return_entries
DROP POLICY IF EXISTS "Users can view own returns" ON public.return_entries;
DROP POLICY IF EXISTS "Service role full access on return_entries" ON public.return_entries;
DROP POLICY IF EXISTS "Postgres full access on return_entries" ON public.return_entries;

-- admin_audit_logs
DROP POLICY IF EXISTS "Service role full access on admin_audit_logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Postgres full access on admin_audit_logs" ON public.admin_audit_logs;

-- payment_webhook_events
DROP POLICY IF EXISTS "Service role full access on payment_webhook_events" ON public.payment_webhook_events;
DROP POLICY IF EXISTS "Postgres full access on payment_webhook_events" ON public.payment_webhook_events;

-- investment_plans
DROP POLICY IF EXISTS "Public can view active investment plans" ON public.investment_plans;
DROP POLICY IF EXISTS "Service role full access on investment_plans" ON public.investment_plans;
DROP POLICY IF EXISTS "Postgres full access on investment_plans" ON public.investment_plans;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- USERS: Customers can only select their own row mapped via supabase_uid
CREATE POLICY "Users can read own user record" 
  ON public.users 
  FOR SELECT 
  TO authenticated 
  USING (supabase_uid = auth.uid());

CREATE POLICY "Service role full access on users" 
  ON public.users 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on users" 
  ON public.users 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- WALLET_LEDGER: Customers can only view their own ledger rows
CREATE POLICY "Users can view own ledger entries" 
  ON public.wallet_ledger 
  FOR SELECT 
  TO authenticated 
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on wallet_ledger" 
  ON public.wallet_ledger 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on wallet_ledger" 
  ON public.wallet_ledger 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- INVESTMENTS: Customers can only view their own investments
CREATE POLICY "Users can view own investments" 
  ON public.investments 
  FOR SELECT 
  TO authenticated 
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on investments" 
  ON public.investments 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on investments" 
  ON public.investments 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- DEPOSITS: Customers can only view their own deposit history
CREATE POLICY "Users can view own deposits" 
  ON public.deposits 
  FOR SELECT 
  TO authenticated 
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on deposits" 
  ON public.deposits 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on deposits" 
  ON public.deposits 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- WITHDRAWALS: Customers can only view their own withdrawal history
CREATE POLICY "Users can view own withdrawals" 
  ON public.withdrawals 
  FOR SELECT 
  TO authenticated 
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on withdrawals" 
  ON public.withdrawals 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on withdrawals" 
  ON public.withdrawals 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- OTP_VERIFICATIONS: Never accessible from browser clients
CREATE POLICY "Service role full access on otp_verifications" 
  ON public.otp_verifications 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on otp_verifications" 
  ON public.otp_verifications 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- PAYMENTS: Customers can view their own payment logs
CREATE POLICY "Users can view own payments" 
  ON public.payments 
  FOR SELECT 
  TO authenticated 
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on payments" 
  ON public.payments 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on payments" 
  ON public.payments 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- PAYOUT_TRANSACTIONS: Internal administrative only
CREATE POLICY "Service role full access on payout_transactions" 
  ON public.payout_transactions 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on payout_transactions" 
  ON public.payout_transactions 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- RETURN_ENTRIES: Customers can view their own returns
CREATE POLICY "Users can view own returns" 
  ON public.return_entries 
  FOR SELECT 
  TO authenticated 
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on return_entries" 
  ON public.return_entries 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on return_entries" 
  ON public.return_entries 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- ADMIN_AUDIT_LOGS: Administrative only
CREATE POLICY "Service role full access on admin_audit_logs" 
  ON public.admin_audit_logs 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on admin_audit_logs" 
  ON public.admin_audit_logs 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- PAYMENT_WEBHOOK_EVENTS: Administrative only
CREATE POLICY "Service role full access on payment_webhook_events" 
  ON public.payment_webhook_events 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on payment_webhook_events" 
  ON public.payment_webhook_events 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- INVESTMENT_PLANS: Anyone can view active plans
CREATE POLICY "Public can view active investment plans" 
  ON public.investment_plans 
  FOR SELECT 
  TO authenticated, anon 
  USING (is_active = true);

CREATE POLICY "Service role full access on investment_plans" 
  ON public.investment_plans 
  FOR ALL 
  TO service_role 
  USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on investment_plans" 
  ON public.investment_plans 
  FOR ALL 
  TO postgres 
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. LEAST-PRIVILEGE PERMISSIONS & ROLE GRANTS
-- ----------------------------------------------------------------------------
-- Revoke all privileges from anon role on private tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.users FROM anon;
    REVOKE ALL ON TABLE public.wallet_ledger FROM anon;
    REVOKE ALL ON TABLE public.investments FROM anon;
    REVOKE ALL ON TABLE public.deposits FROM anon;
    REVOKE ALL ON TABLE public.withdrawals FROM anon;
    REVOKE ALL ON TABLE public.otp_verifications FROM anon;
    REVOKE ALL ON TABLE public.payments FROM anon;
    REVOKE ALL ON TABLE public.payout_transactions FROM anon;
    REVOKE ALL ON TABLE public.return_entries FROM anon;
    REVOKE ALL ON TABLE public.admin_audit_logs FROM anon;
    REVOKE ALL ON TABLE public.payment_webhook_events FROM anon;

    -- Anon is granted SELECT strictly on active investment plans
    GRANT SELECT ON TABLE public.investment_plans TO anon;
  END IF;
END $$;

-- Revoke sensitive tables from authenticated client role (server handles writes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.otp_verifications FROM authenticated;
    REVOKE ALL ON TABLE public.admin_audit_logs FROM authenticated;
    REVOKE ALL ON TABLE public.payment_webhook_events FROM authenticated;
    REVOKE ALL ON TABLE public.payout_transactions FROM authenticated;

    -- Authenticated can only SELECT their own records governed by RLS
    GRANT SELECT ON TABLE public.users TO authenticated;
    GRANT SELECT ON TABLE public.wallet_ledger TO authenticated;
    GRANT SELECT ON TABLE public.investments TO authenticated;
    GRANT SELECT ON TABLE public.deposits TO authenticated;
    GRANT SELECT ON TABLE public.withdrawals TO authenticated;
    GRANT SELECT ON TABLE public.payments TO authenticated;
    GRANT SELECT ON TABLE public.return_entries TO authenticated;
    GRANT SELECT ON TABLE public.investment_plans TO authenticated;
  END IF;
END $$;

-- Superuser and service role retain full management
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  END IF;
END $$;
