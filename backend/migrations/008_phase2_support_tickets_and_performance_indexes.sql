-- =============================================================================
-- Migration 008: Phase 2 Support Tickets System & Admin Performance Indexes
-- =============================================================================

-- 1. Persistent Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_mobile VARCHAR(50),
  user_email VARCHAR(255),
  account_id VARCHAR(100),
  category VARCHAR(100) NOT NULL DEFAULT 'General Support',
  subject VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  priority VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
  admin_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets (priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets (ticket_number);

-- 2. Performance Composite Indexes for Admin User Listing & Balance Aggregation
-- Eliminates table scans during LATERAL joins or aggregations across users
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_status ON wallet_ledger (user_id, status);
CREATE INDEX IF NOT EXISTS idx_investments_user_status ON investments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON withdrawals (user_id, status);
