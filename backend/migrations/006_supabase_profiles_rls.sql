-- ============================================================================
-- GrowMore Supabase Production Migration: 006_supabase_profiles_rls.sql
-- Production Migration for Profiles Table, Row Level Security, and Triggers
-- Execute in Supabase Dashboard SQL Editor (Project sovrqqlnnavqmzrqjtdq)
-- ============================================================================

-- Ensure Supabase auth schema, mock auth helpers, and standard roles exist if running in standalone Postgres
CREATE SCHEMA IF NOT EXISTS auth;

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

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  phone VARCHAR(50),
  email_confirmed_at TIMESTAMPTZ,
  phone_confirmed_at TIMESTAMPTZ,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone') THEN
      ALTER TABLE auth.users ADD COLUMN phone VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at') THEN
      ALTER TABLE auth.users ADD COLUMN email_confirmed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_confirmed_at') THEN
      ALTER TABLE auth.users ADD COLUMN phone_confirmed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'raw_user_meta_data') THEN
      ALTER TABLE auth.users ADD COLUMN raw_user_meta_data JSONB DEFAULT '{}'::jsonb;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- 1. PROFILES TABLE (Linked to Supabase Auth User ID)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  full_name VARCHAR(255),
  phone VARCHAR(50),
  dob DATE,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  account_status VARCHAR(50) NOT NULL DEFAULT 'active',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe conditional column additions if profiles table already partially existed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
    ALTER TABLE public.profiles ADD COLUMN email VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone') THEN
    ALTER TABLE public.profiles ADD COLUMN phone VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'dob') THEN
    ALTER TABLE public.profiles ADD COLUMN dob DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE public.profiles ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_status') THEN
    ALTER TABLE public.profiles ADD COLUMN account_status VARCHAR(50) NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_verified') THEN
    ALTER TABLE public.profiles ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- Indexes for performant lookups and foreign queries
-- Drop restrictive legacy unique email index if present to avoid breaking phone/OAuth/duplicate signups
DROP INDEX IF EXISTS public.idx_profiles_email_unique;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (LOWER(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles (phone) WHERE phone IS NOT NULL AND phone <> '';

-- 2. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Clean drop of existing policies for idempotent re-runs
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own permitted profile fields" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;
DROP POLICY IF EXISTS "Postgres full access" ON public.profiles;

-- Policy 1: Customers can view only their own profile row
CREATE POLICY "Users can read own profile" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id);

-- Policy 2: Customers can update only their own profile row
CREATE POLICY "Users can update own permitted profile fields" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 3: Customers can insert their own profile row (fallback for client-side registration sync)
CREATE POLICY "Users can insert own profile" 
  ON public.profiles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy 4: Service role full management for administrative and webhook tasks
CREATE POLICY "Service role full access" 
  ON public.profiles 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy 5: Direct database superuser access
CREATE POLICY "Postgres full access" 
  ON public.profiles 
  FOR ALL 
  TO postgres
  USING (true)
  WITH CHECK (true);

-- 3. PRIVILEGE ESCALATION PREVENTION TRIGGER
CREATE OR REPLACE FUNCTION public.enforce_profile_immutability()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Determine caller role from request JWT claim, GUC role, or connection user
  caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('role', true), ''),
    CURRENT_USER,
    'authenticated'
  );

  -- Privileged administrative callers bypass checks unless executing under authenticated JWT context
  IF caller_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- 1. On INSERT by non-privileged client: force immutable defaults
  IF TG_OP = 'INSERT' THEN
    NEW.id := COALESCE(NEW.id, auth.uid());
    IF NEW.id IS NULL THEN
      RAISE EXCEPTION 'Cannot create profile without valid identifier.';
    END IF;
    NEW.role := 'user';
    NEW.account_status := 'active';
    NEW.is_verified := FALSE;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- 2. On UPDATE by non-privileged client: prevent privilege escalation
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Unauthorized: customers cannot alter their assigned role.';
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION 'Unauthorized: customers cannot alter their account status.';
    END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Unauthorized: customers cannot alter their verification status.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Unauthorized: customer ID cannot be altered.';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Unauthorized: email must be updated via authentication service.';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_immutability ON public.profiles;
CREATE TRIGGER trg_enforce_profile_immutability
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_immutability();

-- 4. FAULT-TOLERANT AUTO-PROVISIONING TRIGGER
-- Supports email/password, phone OTP, OAuth, and email-less accounts safely
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
DECLARE
  extracted_phone TEXT;
  extracted_name TEXT;
  is_verified_status BOOLEAN;
BEGIN
  -- Extract phone from metadata or root auth.users phone column
  extracted_phone := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
    NULLIF(TRIM(NEW.phone), ''),
    ''
  );

  -- Extract full name from raw_user_meta_data (supports full_name or name)
  extracted_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    ''
  );

  -- Verified if either email or phone is already confirmed
  is_verified_status := (NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL);

  BEGIN
    INSERT INTO public.profiles (
      id, 
      email, 
      full_name, 
      phone, 
      role, 
      account_status, 
      is_verified
    )
    VALUES (
      NEW.id,
      NULLIF(TRIM(NEW.email), ''),
      extracted_name,
      extracted_phone,
      'user',
      'active',
      is_verified_status
    )
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''), public.profiles.email),
      full_name = CASE 
        WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' 
        THEN EXCLUDED.full_name 
        ELSE public.profiles.full_name 
      END,
      phone = CASE 
        WHEN public.profiles.phone IS NULL OR public.profiles.phone = '' 
        THEN EXCLUDED.phone 
        ELSE public.profiles.phone 
      END,
      is_verified = (public.profiles.is_verified OR EXCLUDED.is_verified),
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Profile auto-provisioning failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- 5. AUTH USER UPDATES SYNC TRIGGER
-- Automatically updates profile email, verification status, and phone when auth.users updates
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    UPDATE public.profiles
    SET 
      email = COALESCE(NULLIF(TRIM(NEW.email), ''), public.profiles.email),
      is_verified = CASE 
        WHEN NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL THEN TRUE 
        ELSE public.profiles.is_verified 
      END,
      phone = CASE 
        WHEN (public.profiles.phone IS NULL OR public.profiles.phone = '') 
             AND COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), NULLIF(TRIM(NEW.phone), '')) IS NOT NULL
        THEN COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), NULLIF(TRIM(NEW.phone), ''))
        ELSE public.profiles.phone 
      END,
      updated_at = NOW()
    WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Profile sync on auth update failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Attach triggers to auth.users if auth schema is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_auth_user();

    DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
    CREATE TRIGGER on_auth_user_updated
      AFTER UPDATE OF email, email_confirmed_at, phone, phone_confirmed_at, raw_user_meta_data ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_auth_user_updated();
  END IF;
END $$;

-- 6. IDEMPOTENT BACKFILL FOR EXISTING AUTH USERS
-- Provisions profiles for any pre-existing auth.users safely without data loss
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      phone,
      role,
      account_status,
      is_verified
    )
    SELECT 
      u.id,
      NULLIF(TRIM(u.email), ''),
      COALESCE(
        NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
        ''
      ),
      COALESCE(
        NULLIF(TRIM(u.raw_user_meta_data->>'phone'), ''),
        NULLIF(TRIM(u.phone), ''),
        ''
      ),
      'user',
      'active',
      COALESCE(u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL, FALSE)
    FROM auth.users u
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''), public.profiles.email),
      full_name = CASE 
        WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' 
        THEN EXCLUDED.full_name 
        ELSE public.profiles.full_name 
      END,
      phone = CASE 
        WHEN public.profiles.phone IS NULL OR public.profiles.phone = '' 
        THEN EXCLUDED.phone 
        ELSE public.profiles.phone 
      END,
      is_verified = (public.profiles.is_verified OR EXCLUDED.is_verified),
      updated_at = NOW();
  END IF;
END $$;

-- 7. PERMISSIONS & ROLES
-- Revoke all permissions from anon role to ensure strict privacy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.profiles FROM anon;
  END IF;
END $$;

-- Grant access strictly to trusted and authenticated roles
GRANT ALL ON TABLE public.profiles TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.profiles TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, UPDATE, INSERT ON TABLE public.profiles TO authenticated;
  END IF;
END $$;

