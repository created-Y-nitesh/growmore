const http = require('http');
const app = require('../server');
const pool = require('../db');

// Helper to perform HTTP request against the Express app instance
function request(server, options, bodyData) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = address.port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port: port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);

    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=====================================================');
  console.log('   GROWMORE BACKEND FOUNDATION AUTOMATED TEST SUITE  ');
  console.log('=====================================================\n');

  // Start test server on ephemeral port (0)
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[Test Server] Running on http://127.0.0.1:${port}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Health check endpoint
    console.log('--- TEST GROUP 1: Health & Connectivity ---');
    const healthRes = await request(server, { path: '/api/health' });
    assert(healthRes.status === 200, 'GET /api/health returns 200');
    assert(healthRes.data.database === 'connected', 'Database reported connected');
    assert(healthRes.data.api === 'healthy', 'API reported healthy');

    // 2. Plans endpoint
    console.log('\n--- TEST GROUP 2: Investment Plans ---');
    const plansRes = await request(server, { path: '/api/plans' });
    assert(plansRes.status === 200, 'GET /api/plans returns 200');
    assert(Array.isArray(plansRes.data.plans), 'Plans response is an array');

    // 3. Plan by ID endpoint (valid & invalid)
    const invalidIdRes = await request(server, { path: '/api/plans/abc' });
    assert(invalidIdRes.status === 400, 'GET /api/plans/abc returns 400 Bad Request');

    const notFoundRes = await request(server, { path: '/api/plans/999999' });
    assert(notFoundRes.status === 404, 'GET /api/plans/999999 returns 404 Not Found');

    if (plansRes.data.plans.length > 0) {
      const firstPlanId = plansRes.data.plans[0].id;
      const singlePlanRes = await request(server, { path: `/api/plans/${firstPlanId}` });
      assert(singlePlanRes.status === 200, `GET /api/plans/${firstPlanId} returns 200`);
      assert(singlePlanRes.data.plan.id === firstPlanId, 'Returned plan matches requested ID');
    }

    // 4. Registration validation & execution
    console.log('\n--- TEST GROUP 3: Authentication & Security ---');
    const invalidRegRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: 'A',
      email: 'invalid-email',
      password: '123'
    });
    assert(invalidRegRes.status === 400, 'Register with invalid input returns 400');

    // Generate unique test user
    const testTimestamp = Date.now();
    const testEmail = `investor_${testTimestamp}@example.com`;
    const testPassword = 'Password123!';
    const testName = 'Verification Tester';

    const validRegRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: testName,
      email: testEmail,
      password: testPassword,
      phone: `+91987${Math.floor(1000000 + Math.random() * 9000000)}`
    });

    assert(validRegRes.status === 201, 'POST /api/auth/register returns 201 Created');
    assert(!!validRegRes.data.token, 'Registration response includes JWT token');
    assert(validRegRes.data.user.email === testEmail, 'User profile returned with matching email');
    assert(!validRegRes.data.user.password_hash, 'Password hash is NEVER exposed in response');

    // Duplicate email registration should return 409
    const dupRegRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: testName,
      email: testEmail,
      password: testPassword
    });
    assert(dupRegRes.status === 409, 'Duplicate email registration returns 409 Conflict');

    // 5. Login
    const invalidLoginRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      email: testEmail,
      password: 'WrongPassword999!'
    });
    assert(invalidLoginRes.status === 401, 'Login with wrong password returns 401 Unauthorized');

    const validLoginRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      email: testEmail,
      password: testPassword
    });
    assert(validLoginRes.status === 200, 'POST /api/auth/login returns 200 OK');
    assert(!!validLoginRes.data.token, 'Login response includes valid JWT token');

    const authToken = validLoginRes.data.token;

    // 6. Protected route /api/auth/me
    const noAuthRes = await request(server, { path: '/api/auth/me' });
    assert(noAuthRes.status === 401, 'GET /api/auth/me without token returns 401');

    const invalidAuthRes = await request(server, {
      path: '/api/auth/me',
      headers: { 'Authorization': 'Bearer invalid_dummy_token_123' }
    });
    assert(invalidAuthRes.status === 403, 'GET /api/auth/me with invalid token returns 403');

    const authedRes = await request(server, {
      path: '/api/auth/me',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert(authedRes.status === 200, 'GET /api/auth/me with valid Bearer token returns 200');
    assert(authedRes.data.user.email === testEmail, 'Returned user matches authenticated profile');
    assert(authedRes.data.user.role === 'user', 'User has standard role');

  } catch (err) {
    console.error('[Test Execution Error]:', err);
    failed++;
  } finally {
    server.close();
    await pool.end();
  }

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('=====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
