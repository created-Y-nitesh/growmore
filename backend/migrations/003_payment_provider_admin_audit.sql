-- ============================================================================
-- GrowMore PostgreSQL Schema Migration: 003_payment_provider_admin_audit.sql
-- Repeatable and non-destructive schema additions for Prompt 3
-- ============================================================================

-- 1. PAYMENT WEBHOOK EVENTS (Idempotency and deduplication)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(100) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_provider_event 
  ON payment_webhook_events (provider, event_id);

-- 2. ENHANCE DEPOSITS TABLE FOR PROVIDER INTEGRATIONS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'provider_order_id') THEN
    ALTER TABLE deposits ADD COLUMN provider_order_id VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'provider_payment_id') THEN
    ALTER TABLE deposits ADD COLUMN provider_payment_id VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'provider_signature') THEN
    ALTER TABLE deposits ADD COLUMN provider_signature VARCHAR(255);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deposits_provider_order ON deposits (provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_provider_payment ON deposits (provider_payment_id) WHERE provider_payment_id IS NOT NULL;

-- 3. PAYOUT TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS payout_transactions (
  id BIGSERIAL PRIMARY KEY,
  withdrawal_id BIGINT NOT NULL REFERENCES withdrawals(id) ON DELETE RESTRICT,
  provider VARCHAR(100) NOT NULL,
  payout_reference VARCHAR(150) UNIQUE NOT NULL,
  idempotency_key VARCHAR(150) UNIQUE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED')),
  error_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_transactions_withdrawal ON payout_transactions (withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_status ON payout_transactions (status);

-- 4. ENHANCE WITHDRAWALS TABLE FOR SETTLEMENT LIFECYCLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'processed_at') THEN
    ALTER TABLE withdrawals ADD COLUMN processed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'settled_at') THEN
    ALTER TABLE withdrawals ADD COLUMN settled_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawals' AND column_name = 'rejected_at') THEN
    ALTER TABLE withdrawals ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
END $$;

-- 5. ENHANCE ADMIN AUDIT LOGS TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'actor_email') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN actor_email VARCHAR(255);
  END IF;
END $$;
