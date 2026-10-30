-- ============================================================================
-- GrowMore PostgreSQL Schema Migration: 002_investments_wallet_lifecycle.sql
-- Repeatable and non-destructive enhancements for investment, wallet & returns
-- ============================================================================

-- 1. ENHANCE INVESTMENTS TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'terms_snapshot') THEN
    ALTER TABLE investments ADD COLUMN terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'plan_name') THEN
    ALTER TABLE investments ADD COLUMN plan_name VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'idempotency_key') THEN
    ALTER TABLE investments ADD COLUMN idempotency_key VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'rejection_reason') THEN
    ALTER TABLE investments ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

-- Update status constraint on investments
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_status_check;
ALTER TABLE investments ADD CONSTRAINT investments_status_check 
  CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_idempotency ON investments (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. ENHANCE WALLET LEDGER TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallet_ledger' AND column_name = 'reference_id') THEN
    ALTER TABLE wallet_ledger ADD COLUMN reference_id VARCHAR(100);
  END IF;
END $$;

-- Update entry_type constraint on wallet_ledger
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_entry_type_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_entry_type_check 
  CHECK (entry_type IN (
    'DEPOSIT', 
    'WITHDRAWAL', 
    'WITHDRAWAL_HOLD', 
    'WITHDRAWAL_RELEASE', 
    'WITHDRAWAL_SETTLED', 
    'INVESTMENT_ALLOCATION', 
    'RETURN_CREDIT', 
    'INVESTMENT_MATURITY', 
    'ADJUSTMENT'
  ));

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref_id ON wallet_ledger (reference_id) WHERE reference_id IS NOT NULL;

-- 3. ENHANCE WITHDRAWALS TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'idempotency_key') THEN
    ALTER TABLE withdrawals ADD COLUMN idempotency_key VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'admin_note') THEN
    ALTER TABLE withdrawals ADD COLUMN admin_note TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'rejection_reason') THEN
    ALTER TABLE withdrawals ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

-- Update status constraint on withdrawals
ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_status_check 
  CHECK (status IN ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency ON withdrawals (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. ENHANCE DEPOSITS TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'idempotency_key') THEN
    ALTER TABLE deposits ADD COLUMN idempotency_key VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'admin_note') THEN
    ALTER TABLE deposits ADD COLUMN admin_note TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'verification_data') THEN
    ALTER TABLE deposits ADD COLUMN verification_data JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'verified_at') THEN
    ALTER TABLE deposits ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_idempotency ON deposits (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 5. ENHANCE RETURN ENTRIES TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'return_entries' AND column_name = 'idempotency_key') THEN
    ALTER TABLE return_entries ADD COLUMN idempotency_key VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'return_entries' AND column_name = 'rate_applied') THEN
    ALTER TABLE return_entries ADD COLUMN rate_applied NUMERIC(6, 2) NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'return_entries' AND column_name = 'principal_base') THEN
    ALTER TABLE return_entries ADD COLUMN principal_base NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'return_entries' AND column_name = 'period_start') THEN
    ALTER TABLE return_entries ADD COLUMN period_start TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'return_entries' AND column_name = 'period_end') THEN
    ALTER TABLE return_entries ADD COLUMN period_end TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'return_entries' AND column_name = 'is_estimate') THEN
    ALTER TABLE return_entries ADD COLUMN is_estimate BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_return_entries_idempotency ON return_entries (idempotency_key) WHERE idempotency_key IS NOT NULL;
