-- ============================================================================
-- GrowMore PostgreSQL Schema Migration: 004_auth_otp_verification.sql
-- Real authentication: DOB, Phone verification, Referral, OTP table, Session invalidation
-- ============================================================================

DO $$ 
BEGIN
  -- Add Date of Birth column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'dob') THEN
    ALTER TABLE users ADD COLUMN dob VARCHAR(50);
  END IF;

  -- Add phone verification status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_phone_verified') THEN
    ALTER TABLE users ADD COLUMN is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Add user unique referral code
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referral_code') THEN
    ALTER TABLE users ADD COLUMN referral_code VARCHAR(100);
  END IF;

  -- Add referrer tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referred_by') THEN
    ALTER TABLE users ADD COLUMN referred_by VARCHAR(100);
  END IF;

  -- Add token version for session invalidation on password reset
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'token_version') THEN
    ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Enforce indexes on users
CREATE INDEX IF NOT EXISTS idx_users_dob ON users (dob);
CREATE INDEX IF NOT EXISTS idx_users_phone_verified ON users (is_phone_verified);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL;

-- 2. OTP VERIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS otp_verifications (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(50) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(50) NOT NULL, -- 'register' | 'forgot_password'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose ON otp_verifications (phone, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications (expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_used ON otp_verifications (is_used);
