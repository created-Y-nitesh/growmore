/**
 * Automated Test Suite: Real Registration, SMS OTP, Login & Password Reset
 */

const http = require('http');
const app = require('../server');
const pool = require('../db');

function request(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[Auth Test Server] Running on http://127.0.0.1:${port}\n`);

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
    const ts = Date.now();
    const testPhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testEmail = `investor_${ts}@growmore.test`;
    const testPassword = 'SecurePassword@2026';
    const testName = 'Priya Patel';
    const testDob = '1996-05-12';
    const testReferral = 'GM-VIP100';

    console.log('--- TEST GROUP 1: Real Registration Flow ---');
    // 1. Missing required field
    const emptyRegRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {});
    assert(emptyRegRes.status === 400, 'Empty registration rejected with 400');

    // 2. Valid full registration
    const regRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: testName,
      phone: testPhone,
      email: testEmail,
      dob: testDob,
      password: testPassword,
      referralCode: testReferral
    });

    assert(regRes.status === 201, 'POST /api/auth/register returns 201 Created');
    assert(regRes.data.success === true, 'Registration reported success');
    assert(regRes.data.user.phone === testPhone, 'User mobile saved correctly');
    assert(regRes.data.user.dob === testDob, 'Date of birth saved in PostgreSQL');
    assert(regRes.data.user.isPhoneVerified === false, 'Account starts as unverified before OTP');
    assert(!regRes.data.user.password_hash, 'Password hash is NOT exposed');
    assert(!!regRes.data.user.referralCode, 'Unique referral code generated for user');

    // Retrieve active OTP from PostgreSQL
    const otpQuery = await pool.query(
      `SELECT id, otp_hash FROM otp_verifications WHERE phone = $1 AND purpose = 'register' AND is_used = FALSE ORDER BY created_at DESC LIMIT 1;`,
      [testPhone]
    );
    assert(otpQuery.rows.length === 1, 'OTP record saved in PostgreSQL otp_verifications');

    // 3. Duplicate phone registration rejected
    console.log('\n--- TEST GROUP 2: Duplicate Account Handling ---');
    // First, verify the user so they are marked verified
    const devOtp = regRes.data.devOtp;
    assert(!!devOtp, 'Development/test OTP available for verification');

    // Test invalid OTP
    const wrongOtpRes = await request(server, {
      path: '/api/auth/verify-otp',
      method: 'POST'
    }, {
      phone: testPhone,
      otp: '000000',
      purpose: 'register'
    });
    assert(wrongOtpRes.status === 400, 'Invalid OTP rejected with 400');

    // Test unverified account login attempt
    const unverifiedLoginRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      phone: testPhone,
      password: testPassword
    });
    assert(unverifiedLoginRes.status === 403, 'Login on unverified mobile account rejected with 403');
    assert(unverifiedLoginRes.data.code === 'UNVERIFIED_ACCOUNT', 'Returns UNVERIFIED_ACCOUNT error code');

    // Test valid OTP verification
    console.log('\n--- TEST GROUP 3: Mobile Number OTP Verification ---');
    const validOtpRes = await request(server, {
      path: '/api/auth/verify-otp',
      method: 'POST'
    }, {
      phone: testPhone,
      otp: devOtp,
      purpose: 'register'
    });
    assert(validOtpRes.status === 200, 'Valid OTP verifies successfully with 200');
    assert(validOtpRes.data.user.isPhoneVerified === true, 'User is marked verified in PostgreSQL');
    assert(!!validOtpRes.data.token, 'Verified user receives valid session JWT');

    // Now attempt duplicate phone registration
    const dupPhoneRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: 'Another Name',
      phone: testPhone,
      email: `other_${ts}@growmore.test`,
      password: testPassword
    });
    assert(dupPhoneRes.status === 409, 'Duplicate mobile number rejected with 409 Conflict');

    // Duplicate email rejected
    const dupEmailRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: 'Another Name',
      phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      email: testEmail,
      password: testPassword
    });
    assert(dupEmailRes.status === 409, 'Duplicate email address rejected with 409 Conflict');

    // 4. Real Login
    console.log('\n--- TEST GROUP 4: Real Login via Mobile & Email ---');
    // Login with wrong password
    const wrongPassRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      phone: testPhone,
      password: 'WrongPassword@123'
    });
    assert(wrongPassRes.status === 401, 'Wrong password returns 401 Unauthorized');
    assert(wrongPassRes.data.message.includes('Invalid mobile number or password'), 'Generic auth error returned');

    // Unregistered mobile number returns 401 generic error
    const unregLoginRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      phone: '+919999999999',
      password: 'AnyPassword@123'
    });
    assert(unregLoginRes.status === 401, 'Unregistered mobile login returns 401');
    assert(unregLoginRes.data.message.includes('Invalid mobile number or password'), 'Generic auth error for unregistered user');

    // Login with registered mobile and rememberMe: true
    const mobileLoginRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      phone: testPhone,
      password: testPassword,
      rememberMe: true
    });
    assert(mobileLoginRes.status === 200, 'Login with mobile number returns 200 OK');
    assert(!!mobileLoginRes.data.token, 'Mobile login returns valid JWT token');
    assert(mobileLoginRes.data.user.phone === testPhone, 'Mobile login returns matching profile');
    assert(!!mobileLoginRes.headers['set-cookie'], 'HttpOnly session cookie set on login');

    // Login with registered email
    const emailLoginRes = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      email: testEmail,
      password: testPassword
    });
    assert(emailLoginRes.status === 200, 'Login with email returns 200 OK');

    // 5. Password Recovery with OTP Flow
    console.log('\n--- TEST GROUP 5: Forgot Password with Real OTP ---');
    const forgotRes = await request(server, {
      path: '/api/auth/forgot-password',
      method: 'POST'
    }, {
      phone: testPhone
    });
    assert(forgotRes.status === 200, 'POST /api/auth/forgot-password returns 200');
    assert(!!forgotRes.data.devOtp, 'Recovery OTP generated and dispatched');

    const recoveryOtp = forgotRes.data.devOtp;

    // Verify recovery OTP
    const verifyRecoveryRes = await request(server, {
      path: '/api/auth/verify-otp',
      method: 'POST'
    }, {
      phone: testPhone,
      otp: recoveryOtp,
      purpose: 'forgot_password'
    });
    assert(verifyRecoveryRes.status === 200, 'Recovery OTP verified with 200');
    assert(!!verifyRecoveryRes.data.resetToken, 'Single-use resetToken issued');

    const resetToken = verifyRecoveryRes.data.resetToken;

    // Reset password with new password
    const newPassword = 'BrandNewPassword@2027';
    const resetPassRes = await request(server, {
      path: '/api/auth/reset-password',
      method: 'POST'
    }, {
      resetToken,
      newPassword
    });
    assert(resetPassRes.status === 200, 'Password reset succeeded with 200');

    // Old password fails
    const oldLoginAttempt = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      phone: testPhone,
      password: testPassword
    });
    assert(oldLoginAttempt.status === 401, 'Login with old password now rejected');

    // New password succeeds
    const newLoginAttempt = await request(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      phone: testPhone,
      password: newPassword
    });
    assert(newLoginAttempt.status === 200, 'Login with new password succeeded with 200');

    // 6. Protected /api/auth/me and Session Check
    console.log('\n--- TEST GROUP 6: Session Management & Protected Routes ---');
    const activeToken = newLoginAttempt.data.token;
    const meRes = await request(server, {
      path: '/api/auth/me',
      headers: { 'Authorization': `Bearer ${activeToken}` }
    });
    assert(meRes.status === 200, 'GET /api/auth/me with valid Bearer token returns 200');
    assert(meRes.data.user.phone === testPhone, 'Profile matches authenticated user');

    // 7. Logout Endpoint
    const logoutRes = await request(server, {
      path: '/api/auth/logout',
      method: 'POST'
    });
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200');

    console.log('\n===============================================================');
    console.log(`REAL AUTH & OTP TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal test execution error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await pool.end();
  }
}

runTests();
