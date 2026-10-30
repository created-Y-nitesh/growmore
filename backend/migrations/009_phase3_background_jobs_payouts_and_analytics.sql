-- =============================================================================
-- Migration 009: Phase 3 Background Jobs, Scheduled Tasks, Payouts & Analytics
-- =============================================================================

-- 1. Background Jobs Queue (PostgreSQL transactional queue with SKIP LOCKED)
CREATE TABLE IF NOT EXISTS background_jobs (
  id BIGSERIAL PRIMARY KEY,
  queue_name VARCHAR(100) NOT NULL DEFAULT 'default',
  job_type VARCHAR(100) NOT NULL,
  job_key VARCHAR(150) UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  backoff_seconds INT NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  last_error TEXT,
  result JSONB,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_dequeue ON background_jobs (status, next_run_at ASC) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs (job_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created ON background_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs (status);

-- 2. Scheduled Job Runs Tracking (Cron execution idempotency & audit)
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  run_key VARCHAR(150) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_name ON scheduled_job_runs (job_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_started ON scheduled_job_runs (started_at DESC);

-- 3. Account Statements Storage
CREATE TABLE IF NOT EXISTS account_statements (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement_period VARCHAR(50) NOT NULL,
  statement_date DATE NOT NULL,
  opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_deposits NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_withdrawals NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_returns NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  closing_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_portfolio NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  active_investments_count INT NOT NULL DEFAULT 0,
  statement_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, statement_date)
);

CREATE INDEX IF NOT EXISTS idx_account_statements_user_date ON account_statements (user_id, statement_date DESC);

-- 4. Reconciliation Reports Storage
CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id BIGSERIAL PRIMARY KEY,
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_healthy BOOLEAN NOT NULL DEFAULT TRUE,
  total_users INT NOT NULL DEFAULT 0,
  total_system_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  negative_balances_found INT NOT NULL DEFAULT 0,
  duplicate_references_found INT NOT NULL DEFAULT 0,
  report_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_timestamp ON reconciliation_reports (audit_timestamp DESC);

-- 5. Expand Withdrawals and Payout Transactions Status Constraints
ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_status_check 
  CHECK (status IN ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'SUCCESS', 'REJECTED', 'FAILED'));

ALTER TABLE payout_transactions DROP CONSTRAINT IF EXISTS payout_transactions_status_check;
ALTER TABLE payout_transactions ADD CONSTRAINT payout_transactions_status_check 
  CHECK (status IN ('INITIATED', 'PROCESSING', 'PAID', 'SUCCESS', 'REJECTED', 'FAILED'));

-- 6. Add Audit Columns to admin_audit_logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'actor_email') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN actor_email VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'endpoint') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN endpoint VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'http_method') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN http_method VARCHAR(20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'before_state') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN before_state JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'after_state') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN after_state JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_audit_logs' AND column_name = 'request_id') THEN
    ALTER TABLE admin_audit_logs ADD COLUMN request_id VARCHAR(100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_audit_request_id ON admin_audit_logs (request_id) WHERE request_id IS NOT NULL;
