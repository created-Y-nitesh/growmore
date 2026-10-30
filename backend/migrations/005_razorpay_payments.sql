-- ============================================================================
-- GrowMore PostgreSQL Schema Migration: 005_razorpay_payments.sql
-- Dedicated payments table with uniqueness constraints and audit lifecycle
-- ============================================================================

-- 1. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  deposit_id BIGINT REFERENCES deposits(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
  order_id VARCHAR(150) UNIQUE NOT NULL,
  payment_id VARCHAR(150) UNIQUE,
  signature VARCHAR(255),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'attempted', 'captured', 'failed', 'cancelled', 'refunded')),
  purpose VARCHAR(100) NOT NULL DEFAULT 'deposit',
  receipt VARCHAR(150),
  is_test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  notes JSONB DEFAULT '{}'::jsonb,
  error_code VARCHAR(100),
  error_description TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance and uniqueness
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- 2. Ensure deposits table has unique constraints on provider references
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_provider_order_unique 
  ON deposits (provider_order_id) WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_provider_payment_unique 
  ON deposits (provider_payment_id) WHERE provider_payment_id IS NOT NULL;
