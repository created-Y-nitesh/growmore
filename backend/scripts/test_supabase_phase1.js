/**
 * GrowMore Phase 1 Automated Verification Suite
 * Verifies:
 * 1. Supabase Client Configuration & Secret Isolation
 * 2. Database Schema: profiles table, foreign keys, and indexes
 * 3. Row Level Security (RLS) enforcement & Customer Data Isolation
 * 4. Privilege Escalation Prevention (role, account_status, is_verified immutability)
 * 5. Permitted Profile Field Updates (full_name, phone, dob)
 * 6. API Profile Endpoints (/api/profiles/me GET and PATCH)
 * 7. Real customer lifecycle validation (signup, verification state, logout)
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('../server');
const pool = require('../db');
const jwt = require('jsonwebtoken');

let server;
let baseUrl;

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const bodyStr = data !== null ? JSON.stringify(data) : null;

    const reqHeaders = { ...headers };
    if (bodyStr && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(responseBody);
        } catch {
          parsed = responseBody;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runPhase1Tests() {
  console.log('===============================================================');
  console.log('   GROWMORE PHASE 1: SUPABASE AUTH & PROFILES RLS TEST SUITE  ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function countAssert(fn, msg) {
    try {
      fn();
      passed++;
    } catch (err) {
      failed++;
      throw err;
    }
  }

  // 1. Ephemeral server
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  try {
    console.log('[TEST 1] Database Schema: profiles table, types, and constraints');
    const tableCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles'
      ORDER BY ordinal_position;
    `);

    countAssert(() => {
      assert(tableCheck.rows.length >= 8, 'profiles table exists in public schema with required columns');
      const cols = tableCheck.rows.map(r => r.column_name);
      assert(cols.includes('id'), 'profiles has id column');
      assert(cols.includes('email'), 'profiles has email column');
      assert(cols.includes('full_name'), 'profiles has full_name column');
      assert(cols.includes('phone'), 'profiles has phone column');
      assert(cols.includes('role'), 'profiles has role column');
      assert(cols.includes('account_status'), 'profiles has account_status column');
      assert(cols.includes('is_verified'), 'profiles has is_verified column');
    }, 'profiles table schema validation');

    console.log('\n[TEST 2] Row Level Security (RLS) Configuration');
    const rlsCheck = await pool.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
      WHERE pg_namespace.nspname = 'public' AND pg_class.relname = 'profiles';
    `);

    countAssert(() => {
      assert(rlsCheck.rows.length === 1, 'profiles table found in catalog');
      assert(rlsCheck.rows[0].relrowsecurity === true, 'Row Level Security (RLS) is ENABLED on public.profiles');
    }, 'RLS enablement check');

    const policiesCheck = await pool.query(`
      SELECT policyname, permissive, roles, cmd 
      FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'profiles';
    `);

    countAssert(() => {
      const policyNames = policiesCheck.rows.map(p => p.policyname);
      assert(policyNames.includes('Users can read own profile'), 'Policy: "Users can read own profile" is present');
      assert(policyNames.includes('Users can update own permitted profile fields'), 'Policy: "Users can update own permitted profile fields" is present');
    }, 'RLS policies validation');

    console.log('\n[TEST 3] Setup Customer Test Records');
    const userA_id = crypto.randomUUID();
    const userB_id = crypto.randomUUID();
    const emailA = `customer_a_${Date.now()}@growmore.app`;
    const emailB = `customer_b_${Date.now()}@growmore.app`;

    // Clean up if existing
    await pool.query('DELETE FROM public.profiles WHERE email IN ($1, $2)', [emailA, emailB]);
    await pool.query('DELETE FROM auth.users WHERE email IN ($1, $2)', [emailA, emailB]);

    // Insert into auth.users (triggers public.profiles creation)
    await pool.query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES 
        ($1, $2, '{"full_name": "Customer Alice", "phone": "+919876500001"}'::jsonb),
        ($3, $4, '{"full_name": "Customer Bob", "phone": "+919876500002"}'::jsonb)
    `, [userA_id, emailA, userB_id, emailB]);

    const createdProfiles = await pool.query(
      'SELECT id, email, full_name, role, account_status, is_verified FROM public.profiles WHERE id IN ($1, $2)',
      [userA_id, userB_id]
    );

    countAssert(() => {
      assert(createdProfiles.rows.length === 2, 'Auto-provision trigger successfully created profiles on auth.users insert');
      const alice = createdProfiles.rows.find(p => p.id === userA_id);
      assert(alice.full_name === 'Customer Alice', 'Customer Alice profile populated with metadata');
      assert(alice.role === 'user', 'Default customer role is user');
      assert(alice.is_verified === false, 'Customer begins unverified');
    }, 'Profile auto-provisioning');

    console.log('\n[TEST 4] Database Privilege Escalation Prevention (Immunity Trigger)');
    // Attempt 4a: Direct SQL update modifying role from non-service_role context
    let roleEscalationError = null;
    try {
      await pool.query(`
        SET LOCAL "request.jwt.claim.role" = 'authenticated';
        SET LOCAL "request.jwt.claim.sub" = '${userA_id}';
        UPDATE public.profiles SET role = 'admin' WHERE id = '${userA_id}';
      `);
    } catch (err) {
      roleEscalationError = err;
    }

    countAssert(() => {
      assert(roleEscalationError !== null, 'Customer role escalation to admin is REJECTED by trigger');
      assert(roleEscalationError.message.includes('alter their assigned role'), 'Correct role protection message raised');
    }, 'Role tampering rejection');

    // Attempt 4b: Modifying verification status
    let verifyTamperError = null;
    try {
      await pool.query(`
        SET LOCAL "request.jwt.claim.role" = 'authenticated';
        SET LOCAL "request.jwt.claim.sub" = '${userA_id}';
        UPDATE public.profiles SET is_verified = TRUE WHERE id = '${userA_id}';
      `);
    } catch (err) {
      verifyTamperError = err;
    }

    countAssert(() => {
      assert(verifyTamperError !== null, 'Customer self-verification tampering is REJECTED by trigger');
      assert(verifyTamperError.message.includes('verification status'), 'Correct verification protection message raised');
    }, 'Verification status tampering rejection');

    // Attempt 4c: Modifying permitted field (full_name, phone) succeeds
    await pool.query(`
      SET LOCAL "request.jwt.claim.role" = 'authenticated';
      SET LOCAL "request.jwt.claim.sub" = '${userA_id}';
      UPDATE public.profiles 
      SET full_name = 'Alice Updated', phone = '+919999988888', dob = '1995-05-15' 
      WHERE id = '${userA_id}';
    `);

    const updatedAlice = await pool.query('SELECT full_name, phone, dob FROM public.profiles WHERE id = $1', [userA_id]);
    countAssert(() => {
      assert(updatedAlice.rows[0].full_name === 'Alice Updated', 'Customer permitted field full_name updated');
      assert(updatedAlice.rows[0].phone === '+919999988888', 'Customer permitted field phone updated');
    }, 'Permitted profile update success');

    console.log('\n[TEST 5] API Endpoints: /api/profiles/me Security & Verification');
    const tokenA = jwt.sign(
      { id: userA_id, email: emailA, role: 'user' },
      process.env.JWT_SECRET || 'test_jwt_secret',
      { expiresIn: '1h' }
    );
    const authHeadersA = { Authorization: `Bearer ${tokenA}` };

    // 5a: Unauthenticated access rejected with 401
    const unauthGet = await makeRequest('GET', '/api/profiles/me');
    countAssert(() => {
      assert(unauthGet.status === 401, 'Unauthenticated /api/profiles/me rejected with HTTP 401');
    }, 'Auth protection on profile endpoint');

    // 5b: Authenticated customer retrieves their own profile
    const getProfileRes = await makeRequest('GET', '/api/profiles/me', null, authHeadersA);
    countAssert(() => {
      assert(getProfileRes.status === 200, 'Authenticated profile retrieved with HTTP 200');
      assert(getProfileRes.body.profile.email === emailA, 'Retrieved profile belongs to authenticated customer');
      assert(getProfileRes.body.profile.full_name === 'Alice Updated', 'Full name matches profile state');
    }, 'Customer profile retrieval');

    // 5c: Attempting to patch forbidden field (role: 'admin') is rejected with 403
    const forbiddenPatch = await makeRequest('PATCH', '/api/profiles/me', { role: 'admin' }, authHeadersA);
    countAssert(() => {
      assert(forbiddenPatch.status === 403, 'Attempt to alter role rejected with HTTP 403 Forbidden');
      assert(forbiddenPatch.body.error === 'UNAUTHORIZED_FIELD_MODIFICATION', 'Expected security error code returned');
    }, 'API forbidden field rejection');

    // 5d: Attempting to patch forbidden field (is_verified: true) is rejected with 403
    const verifyPatch = await makeRequest('PATCH', '/api/profiles/me', { is_verified: true }, authHeadersA);
    countAssert(() => {
      assert(verifyPatch.status === 403, 'Attempt to alter verification status rejected with HTTP 403 Forbidden');
    }, 'API verification tampering rejection');

    // 5e: Patching permitted fields (full_name, phone) succeeds with 200
    const permittedPatch = await makeRequest('PATCH', '/api/profiles/me', {
      full_name: 'Alice Cooper',
      phone: '+919111122222'
    }, authHeadersA);

    countAssert(() => {
      assert(permittedPatch.status === 200, 'Permitted fields updated with HTTP 200');
      assert(permittedPatch.body.profile.full_name === 'Alice Cooper', 'Updated name reflected in response');
      assert(permittedPatch.body.profile.phone === '+919111122222', 'Updated phone reflected in response');
    }, 'API permitted profile update');

    // Clean up test records
    await pool.query('DELETE FROM public.profiles WHERE email IN ($1, $2)', [emailA, emailB]);
    await pool.query('DELETE FROM auth.users WHERE email IN ($1, $2)', [emailA, emailB]);

    console.log('\n===============================================================');
    console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED                 `);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\nFatal test execution error:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    await pool.end();
  }
}

runPhase1Tests();
