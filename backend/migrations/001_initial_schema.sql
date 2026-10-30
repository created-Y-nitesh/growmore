-- ============================================================================
-- GrowMore PostgreSQL Schema Migration: 001_initial_schema.sql
-- Repeatable and non-destructive schema initialization
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  account_status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely add columns if users already existed from earlier prototypes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
    ALTER TABLE users ADD COLUMN phone VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_status') THEN
    ALTER TABLE users ADD COLUMN account_status VARCHAR(50) NOT NULL DEFAULT 'active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Enforce case-insensitive unique email and optional unique phone
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (account_status);

-- 2. INVESTMENT PLANS TABLE
CREATE TABLE IF NOT EXISTS investment_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  tagline VARCHAR(255),
  description TEXT,
  minimum_amount NUMERIC(15, 2) NOT NULL CHECK (minimum_amount > 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  return_rate_percentage NUMERIC(6, 2) NOT NULL DEFAULT 10.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  terms JSONB DEFAULT '[]'::jsonb,
  perks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely add missing columns to investment_plans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'plan_code') THEN
    ALTER TABLE investment_plans ADD COLUMN plan_code VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'tagline') THEN
    ALTER TABLE investment_plans ADD COLUMN tagline VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'return_rate_percentage') THEN
    ALTER TABLE investment_plans ADD COLUMN return_rate_percentage NUMERIC(6, 2) NOT NULL DEFAULT 10.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'currency') THEN
    ALTER TABLE investment_plans ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'INR';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'terms') THEN
    ALTER TABLE investment_plans ADD COLUMN terms JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'perks') THEN
    ALTER TABLE investment_plans ADD COLUMN perks JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investment_plans' AND column_name = 'updated_at') THEN
    ALTER TABLE investment_plans ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_investment_plans_active ON investment_plans (is_active);

-- 3. INVESTMENTS TABLE (Lifecycle tracking)
CREATE TABLE IF NOT EXISTS investments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id BIGINT NOT NULL REFERENCES investment_plans(id) ON DELETE RESTRICT,
  principal_amount NUMERIC(15, 2) NOT NULL CHECK (principal_amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  expected_return_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  start_date TIMESTAMPTZ,
  maturity_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments (user_id);
CREATE INDEX IF NOT EXISTS idx_investments_plan_id ON investments (plan_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments (status);

-- 4. WALLET LEDGER TABLE (Append-only immutable financial log)
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transaction_reference VARCHAR(100) UNIQUE NOT NULL,
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('DEPOSIT', 'WITHDRAWAL', 'INVESTMENT_ALLOCATION', 'RETURN_CREDIT', 'ADJUSTMENT')),
  wallet_type VARCHAR(50) NOT NULL DEFAULT 'MAIN' CHECK (wallet_type IN ('MAIN', 'INVESTMENT', 'WITHDRAWAL')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(15, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref ON wallet_ledger (transaction_reference);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created ON wallet_ledger (created_at DESC);

-- 5. DEPOSITS TABLE
CREATE TABLE IF NOT EXISTS deposits (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payment_provider VARCHAR(100) NOT NULL,
  provider_reference VARCHAR(150) UNIQUE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits (user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_provider_ref ON deposits (provider_reference);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits (status);

-- 6. WITHDRAWALS TABLE
CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  payout_reference VARCHAR(150) UNIQUE,
  payout_method VARCHAR(100) NOT NULL,
  payout_details JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals (user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_ref ON withdrawals (payout_reference);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status);

-- 7. RETURN ENTRIES TABLE (Audit log of investment yield calculations)
CREATE TABLE IF NOT EXISTS return_entries (
  id BIGSERIAL PRIMARY KEY,
  investment_id BIGINT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  calculation_period VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED', 'CREDITED', 'VOIDED')),
  audit_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_entries_inv ON return_entries (investment_id);
CREATE INDEX IF NOT EXISTS idx_return_entries_user ON return_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_return_entries_status ON return_entries (status);

-- 8. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_entity VARCHAR(100) NOT NULL,
  target_id VARCHAR(100),
  ip_address VARCHAR(50),
  audit_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs (created_at DESC);
