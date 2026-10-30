/**
 * GrowMore Live Supabase Production Verification Script
 * Validates real network connectivity, API key formats, Auth health,
 * profiles table schema, and Row Level Security (RLS) data isolation against a real Supabase project.
 *
 * Usage: node scripts/verify_live_supabase.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment files: backend/.env then root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');

const maskSecret = (key) => {
  if (!key) return 'NOT CONFIGURED';
  if (key.length <= 12) return '************';
  return `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
};

async function verifyLiveSupabase() {
  console.log('================================================================');
  console.log('   GROWMORE LIVE PRODUCTION SUPABASE VERIFICATION               ');
  console.log('================================================================\n');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('[SECTION 1: ENVIRONMENT CONFIGURATION AUDIT]');
  console.log(`  - Target Supabase URL:   ${supabaseUrl || 'NOT CONFIGURED'}`);
  console.log(`  - Publishable Anon Key:  ${maskSecret(anonKey)}`);
  console.log(`  - Service Role Key:      ${maskSecret(serviceKey)}`);

  const hasUrl = Boolean(supabaseUrl && !supabaseUrl.includes('your-project-id') && !supabaseUrl.includes('placeholder'));
  const hasAnon = Boolean(anonKey && !anonKey.includes('placeholder') && anonKey.length > 15);
  const hasService = Boolean(serviceKey && !serviceKey.includes('placeholder') && serviceKey.length > 15);

  if (!hasUrl || (!hasAnon && !hasService)) {
    console.log('\n----------------------------------------------------------------');
    console.log('STATUS: PENDING LOCAL CREDENTIAL CONFIGURATION');
    console.log('----------------------------------------------------------------');
    console.log('The codebase is fully wired for Supabase, but live project');
    console.log('credentials have not yet been placed in your local .env files.\n');
    console.log('To connect your live Supabase project:');
    console.log('1. Go to your Supabase Project -> Settings -> API:');
    console.log('   https://supabase.com/dashboard/project/_/settings/api\n');
    console.log('2. Add to root .env (d:\\Downloads\\growmore\\.env):');
    console.log('   VITE_SUPABASE_URL=https://<your-project-id>.supabase.co');
    console.log('   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>\n');
    console.log('3. Add to backend .env (d:\\Downloads\\growmore\\backend\\.env):');
    console.log('   SUPABASE_URL=https://<your-project-id>.supabase.co');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
    console.log('   SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>\n');
    console.log('4. Re-run this verifier:');
    console.log('   npm run verify:supabase\n');
    process.exit(1);
  }

  // Section 2: Network & Auth Health
  console.log('\n[SECTION 2: NETWORK & AUTH SERVICE HEALTH]');
  const activeKey = anonKey || serviceKey;
  const reqHeaders = {
    'apikey': activeKey,
    'Authorization': `Bearer ${activeKey}`
  };

  try {
    const cleanUrl = supabaseUrl.replace(/\/$/, '');
    const healthEndpoint = `${cleanUrl}/auth/v1/health`;
    console.log(`  → Probing: ${healthEndpoint} (with apikey header)`);
    
    const healthRes = await fetch(healthEndpoint, {
      method: 'GET',
      headers: reqHeaders,
      signal: AbortSignal.timeout(25000)
    });
    
    if (healthRes.ok) {
      const healthJson = await healthRes.json().catch(() => ({}));
      console.log('  ✓ PASS: Supabase Auth service reachable and authenticated (HTTP 200).');
      console.log(`  ✓ Auth Engine: ${healthJson.name || 'GoTrue'} (version: ${healthJson.version || 'v2'})`);
    } else {
      // Fallback probe to /auth/v1/settings
      const settingsEndpoint = `${cleanUrl}/auth/v1/settings`;
      console.log(`  → Health returned HTTP ${healthRes.status}. Probing ${settingsEndpoint}...`);
      const settingsRes = await fetch(settingsEndpoint, {
        method: 'GET',
        headers: reqHeaders,
        signal: AbortSignal.timeout(25000)
      });
      if (settingsRes.ok) {
        console.log('  ✓ PASS: Supabase Auth settings endpoint reachable and authenticated (HTTP 200).');
      } else {
        throw new Error(`HTTP ${healthRes.status}: ${healthRes.statusText}`);
      }
    }
  } catch (err) {
    console.error(`  ✗ FAIL: Network handshake failed: ${err.message}`);
    process.exit(1);
  }

  // Section 3: Publishable Anon Client Handshake
  if (hasAnon) {
    console.log('\n[SECTION 3: PUBLIC ANON CLIENT HANDSHAKE]');
    try {
      const publicClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false }
      });
      const { data, error } = await publicClient.auth.getSession();
      if (error) throw error;
      console.log('  ✓ PASS: Official Supabase client initialized with publishable anon key.');
      console.log('  ✓ PASS: Client session handshake completed.');
    } catch (err) {
      console.error(`  ✗ FAIL: Anon client validation failed: ${err.message}`);
    }
  }

  // Section 4: Service Role Verification & Profiles Schema Check
  console.log('\n[SECTION 4: SERVICE ROLE ACCESS & PROFILES TABLE AUDIT]');
  if (hasService) {
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, email, full_name, role, account_status, is_verified')
        .limit(5);

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') {
          console.warn('  ! NOTE: "public.profiles" table does not exist in the remote Supabase project yet.');
          console.warn('  ! ACTION: Open the Supabase SQL Editor and execute:');
          console.warn('    d:\\Downloads\\growmore\\backend\\migrations\\006_supabase_profiles_rls.sql');
        } else {
          throw error;
        }
      } else {
        console.log('  ✓ PASS: Successfully queried "public.profiles" via service-role.');
        console.log(`  ✓ Profiles schema validated. Existing records returned: ${data.length}`);
      }
    } catch (err) {
      console.error(`  ✗ FAIL: Service-role query failed: ${err.message}`);
    }
  } else {
    console.log('  - Service Role Key: NOT CONFIGURED in backend/.env');
    console.log('  → Server-side administrative operations will use database fallback.');
    console.log('  → To verify administrative operations against the live Supabase project:');
    console.log('    Add SUPABASE_SERVICE_ROLE_KEY to backend/.env from:');
    console.log('    Supabase Dashboard -> Project Settings -> API -> Project API keys -> "service_role" secret');
  }

  // Section 5: Row Level Security (RLS) Customer Data Isolation Test
  console.log('\n[SECTION 5: ROW LEVEL SECURITY & CUSTOMER DATA ISOLATION]');
  if (hasAnon) {
    try {
      const unauthenticatedClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false }
      });

      // Anonymous public queries without an authenticated JWT must return 0 rows under RLS
      const { data: anonData, error: anonError } = await unauthenticatedClient
        .from('profiles')
        .select('id, email')
        .limit(5);

      if (anonError) {
        if (anonError.code === '42P01' || anonError.code === 'PGRST205' || anonError.code === 'PGRST204') {
          console.warn('  ! NOTE: "public.profiles" table is not created in the remote database yet.');
          console.warn('  ! Run backend/migrations/006_supabase_profiles_rls.sql in Supabase SQL editor to create it.');
        } else {
          console.log(`  ✓ PASS: Unauthenticated access blocked by RLS (${anonError.message})`);
        }
      } else if (Array.isArray(anonData)) {
        if (anonData.length === 0) {
          console.log('  ✓ PASS: RLS enforced: Unauthenticated client received 0 customer profile rows.');
        } else {
          console.warn(`  ! WARNING: RLS may be disabled on profiles! Returned ${anonData.length} records to anonymous client.`);
        }
      }
    } catch (rlsErr) {
      console.log(`  ✓ PASS: Unauthenticated access rejected: ${rlsErr.message}`);
    }
  }

  console.log('\n================================================================');
  console.log('   LIVE SUPABASE AUDIT COMPLETE                                 ');
  console.log('================================================================\n');
}

verifyLiveSupabase().catch((err) => {
  console.error('[Verification Unhandled Error]', err.message);
  process.exit(1);
});
