-- =============================================================================
-- Migration 010: Phase 4 Supabase Storage, Avatar Management & KYC Module
-- =============================================================================

-- 1. Ensure avatar_path and kyc_status exist on users and profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_path'
  ) THEN
    ALTER TABLE public.users ADD COLUMN avatar_path VARCHAR(500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'kyc_status'
  ) THEN
    ALTER TABLE public.users ADD COLUMN kyc_status VARCHAR(50) NOT NULL DEFAULT 'NOT_SUBMITTED';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_path'
    ) THEN
      ALTER TABLE public.profiles ADD COLUMN avatar_path VARCHAR(500);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'kyc_status'
    ) THEN
      ALTER TABLE public.profiles ADD COLUMN kyc_status VARCHAR(50) NOT NULL DEFAULT 'NOT_SUBMITTED';
    END IF;
  END IF;
END $$;

-- 2. AVATAR METADATA TABLE
CREATE TABLE IF NOT EXISTS public.avatar_metadata (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500),
  file_name VARCHAR(255) NOT NULL,
  file_size INT NOT NULL CHECK (file_size > 0),
  mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  dimensions JSONB NOT NULL DEFAULT '{"width": 0, "height": 0}'::jsonb,
  file_hash VARCHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avatar_user_active ON public.avatar_metadata (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_avatar_file_hash ON public.avatar_metadata (file_hash);

-- 3. KYC DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('aadhaar', 'pan', 'selfie', 'address_proof')),
  document_number VARCHAR(100),
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INT NOT NULL CHECK (file_size > 0),
  mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_hash VARCHAR(64) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  reviewed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure a user can only have one active/pending review submission per document type
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_active_doc 
  ON public.kyc_documents (user_id, document_type) 
  WHERE status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_kyc_user ON public.kyc_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON public.kyc_documents (status);
CREATE INDEX IF NOT EXISTS idx_kyc_type ON public.kyc_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_kyc_file_hash ON public.kyc_documents (file_hash);

-- 4. STORAGE AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.storage_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  actor_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50) NOT NULL DEFAULT 'user',
  action VARCHAR(100) NOT NULL,
  bucket VARCHAR(100) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_audit_user ON public.storage_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_storage_audit_actor ON public.storage_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_storage_audit_bucket ON public.storage_audit_logs (bucket);
CREATE INDEX IF NOT EXISTS idx_storage_audit_created ON public.storage_audit_logs (created_at DESC);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.avatar_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_audit_logs ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for idempotency
DROP POLICY IF EXISTS "Users can view own avatar metadata" ON public.avatar_metadata;
DROP POLICY IF EXISTS "Users can manage own avatar metadata" ON public.avatar_metadata;
DROP POLICY IF EXISTS "Service role full access on avatar_metadata" ON public.avatar_metadata;
DROP POLICY IF EXISTS "Postgres full access on avatar_metadata" ON public.avatar_metadata;

DROP POLICY IF EXISTS "Users can view own kyc documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Users can insert own kyc documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Service role full access on kyc_documents" ON public.kyc_documents;
DROP POLICY IF EXISTS "Postgres full access on kyc_documents" ON public.kyc_documents;

DROP POLICY IF EXISTS "Users can view own storage audit logs" ON public.storage_audit_logs;
DROP POLICY IF EXISTS "Service role full access on storage_audit_logs" ON public.storage_audit_logs;
DROP POLICY IF EXISTS "Postgres full access on storage_audit_logs" ON public.storage_audit_logs;

-- Avatar Policies
CREATE POLICY "Users can view own avatar metadata" ON public.avatar_metadata
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on avatar_metadata" ON public.avatar_metadata
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on avatar_metadata" ON public.avatar_metadata
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- KYC Documents Policies
CREATE POLICY "Users can view own kyc documents" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Users can insert own kyc documents" ON public.kyc_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on kyc_documents" ON public.kyc_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on kyc_documents" ON public.kyc_documents
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- Storage Audit Logs Policies
CREATE POLICY "Users can view own storage audit logs" ON public.storage_audit_logs
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE supabase_uid = auth.uid()));

CREATE POLICY "Service role full access on storage_audit_logs" ON public.storage_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Postgres full access on storage_audit_logs" ON public.storage_audit_logs
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- Revoke anon access explicitly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.avatar_metadata FROM anon;
    REVOKE ALL ON TABLE public.kyc_documents FROM anon;
    REVOKE ALL ON TABLE public.storage_audit_logs FROM anon;
  END IF;
END $$;
