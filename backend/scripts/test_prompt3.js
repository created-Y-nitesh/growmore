/**
 * GrowMore Backend Automated Test Suite — PROMPT 3
 * Verifies:
 *   - Liveness and Readiness probes (/api/health/ready)
 *   - Administrative RBAC security (Standard User vs Admin)
 *   - Payment Provider Adapter & Webhook HMAC Verification
 *   - Webhook idempotency and deduplication
 *   - Webhook amount mismatch rejection
 *   - Withdrawal approval & rejection with fund hold release
 *   - Return calculation batch idempotency
 *   - Platform financial invariant reconciliation
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('../server');
const pool = require('../db');

let server;
let baseUrl;

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const bodyStr = data ? JSON.stringify(data) : null;

    const reqHeaders = {
      ...headers
    };

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

async function runPrompt3Tests() {
  console.log('===============================================================');
  console.log('   GROWMORE PROMPT 3 TEST SUITE: SECURITY, PAYMENTS & ADMIN   ');
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

  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // GROUP 1: Health & Readiness Probes
    // -------------------------------------------------------------------------
    console.log('--- GROUP 1: Health & Readiness Probes ---');
    const healthRes = await makeRequest('GET', '/api/health');
    countAssert(() => assert(healthRes.status === 200, 'GET /api/health returns 200 OK'), 'Liveness probe operational');
    countAssert(() => assert(healthRes.body.database === 'connected', 'Database reported connected'), 'Database live check');
    countAssert(() => assert(!healthRes.body.databaseName, 'Database internal name is safely hidden (no leak)'), 'No info disclosure');

    const readyRes = await makeRequest('GET', '/api/health/ready');
    countAssert(() => assert(readyRes.status === 200 && readyRes.body.ready === true, 'GET /api/health/ready returns 200 Ready'), 'Readiness probe passed');

    // -------------------------------------------------------------------------
    // GROUP 2: Authentication & RBAC Access Control
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 2: RBAC Security (Admin vs Standard User) ---');
    // 1. Unauthenticated request to /api/admin
    const unauthAdmin = await makeRequest('GET', '/api/admin/reconciliation');
    countAssert(() => assert(unauthAdmin.status === 401, 'Unauthenticated access to /api/admin rejected with 401'), '401 on missing token');

    // 2. Register standard user
    const userTimestamp = Date.now();
    const standardEmail = `user_p3_${userTimestamp}@growmore.test`;
    const regRes = await makeRequest('POST', '/api/auth/register', {
      fullName: 'Standard User P3',
      email: standardEmail,
      password: 'UserStrongPass123!'
    });
    const standardToken = regRes.body.token;
    const standardUserId = regRes.body.user.id;

    // 3. Standard user attempting admin endpoint
    const forbiddenRes = await makeRequest('GET', '/api/admin/reconciliation', null, {
      'Authorization': `Bearer ${standardToken}`
    });
    countAssert(() => assert(forbiddenRes.status === 403, 'Standard user attempting admin endpoint rejected with 403 Forbidden'), 'Standard user RBAC block');

    // 4. Authenticate as Admin
    // Using admin created via create_admin.js
    const adminLoginRes = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@growmore.internal',
      password: 'AdminStrongPassword!2026'
    });
    countAssert(() => assert(adminLoginRes.status === 200, 'Admin login succeeded with 200'), 'Admin login');
    const adminToken = adminLoginRes.body.token;

    // 5. Admin access to /api/admin/reconciliation
    const adminAccessRes = await makeRequest('GET', '/api/admin/reconciliation', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(adminAccessRes.status === 200, 'Admin successfully accessed /api/admin/reconciliation with 200'), 'Admin access granted');

    // -------------------------------------------------------------------------
    // GROUP 3: Administrative User Operations & Audit Trail
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 3: User Management & Audit Logging ---');
    const listUsers = await makeRequest('GET', '/api/admin/users?limit=5', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(listUsers.status === 200 && Array.isArray(listUsers.body.users), 'Admin can list users with pagination'), 'User listing');

    // Suspend user
    const suspendRes = await makeRequest('PATCH', `/api/admin/users/${standardUserId}/status`, {
      status: 'suspended',
      reason: 'Automated compliance test flag'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(suspendRes.status === 200 && suspendRes.body.accountStatus === 'suspended', 'Admin suspended user account'), 'User suspended');

    // Reactivate user
    const reactivateRes = await makeRequest('PATCH', `/api/admin/users/${standardUserId}/status`, {
      status: 'active',
      reason: 'Compliance review completed'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(reactivateRes.status === 200 && reactivateRes.body.accountStatus === 'active', 'Admin reactivated user account'), 'User reactivated');

    // Check audit logs
    const auditRes = await makeRequest('GET', '/api/admin/audit-logs?limit=5', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(auditRes.status === 200 && auditRes.body.auditLogs.length > 0, 'Audit logs recorded administrative status change'), 'Audit log verification');

    // -------------------------------------------------------------------------
    // GROUP 4: Payment Provider Adapter & Webhook Cryptography
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 4: Payment Adapter & Webhook Security ---');
    // Config check
    const configRes = await makeRequest('GET', '/api/payments/config');
    countAssert(() => assert(configRes.status === 200, 'GET /api/payments/config returns provider status'), 'Config status');

    // 1. Create a deposit record for webhook testing
    const depCreate = await makeRequest('POST', '/api/deposits', {
      amount: 1500,
      paymentMethod: 'razorpay'
    }, {
      'Authorization': `Bearer ${standardToken}`
    });
    const depositId = depCreate.body.deposit.id;

    // Simulate provider order association
    const testOrderId = `order_test_${Date.now()}`;
    await pool.query('UPDATE deposits SET provider_order_id = $1 WHERE id = $2', [testOrderId, depositId]);

    // 2. Webhook call with invalid/forged signature
    const testSecret = 'test_webhook_signing_secret_998877';
    process.env.PAYMENT_WEBHOOK_SECRET = testSecret;

    const webhookPayload = {
      event_id: `evt_${Date.now()}`,
      event: 'payment.captured',
      order_id: testOrderId,
      payment_id: `pay_${Date.now()}`,
      amount: 150000, // 1500 INR in paise
      currency: 'INR',
      status: 'captured'
    };

    const forgedWebhook = await makeRequest('POST', '/api/payments/webhook', webhookPayload, {
      'x-razorpay-signature': 'forged_fake_signature_abc123'
    });
    countAssert(() => assert(forgedWebhook.status === 400 && forgedWebhook.body.error === 'INVALID_SIGNATURE', 'Forged webhook signature rejected with 400 Bad Request'), 'Signature check enforcement');

    // 3. Webhook call with VALID HMAC signature but AMOUNT MISMATCH
    const rawBodyForMismatch = JSON.stringify({
      ...webhookPayload,
      event_id: `evt_mismatch_${Date.now()}`,
      amount: 9999900 // 99,999 INR instead of 1,500
    });
    const hmacMismatch = crypto.createHmac('sha256', testSecret).update(rawBodyForMismatch).digest('hex');

    const mismatchRes = await makeRequest('POST', '/api/payments/webhook', JSON.parse(rawBodyForMismatch), {
      'x-razorpay-signature': hmacMismatch
    });
    if (mismatchRes.status !== 400 || !mismatchRes.body.message || !mismatchRes.body.message.includes('Amount mismatch')) {
      console.log('mismatchRes returned:', mismatchRes.status, mismatchRes.body);
    }
    countAssert(() => assert(mismatchRes.status === 400 && mismatchRes.body.message && mismatchRes.body.message.includes('Amount mismatch'), 'Amount mismatch between webhook and deposit rejected with 400'), 'Amount mismatch protection');

    // 4. Webhook call with VALID HMAC signature and EXACT MATCH
    const validRawBody = JSON.stringify(webhookPayload);
    const validHmac = crypto.createHmac('sha256', testSecret).update(validRawBody).digest('hex');

    const validWebhookRes = await makeRequest('POST', '/api/payments/webhook', webhookPayload, {
      'x-razorpay-signature': validHmac
    });
    countAssert(() => assert(validWebhookRes.status === 200 && validWebhookRes.body.success === true, 'Valid webhook processed with 200 and ledger credited'), 'Valid webhook settlement');

    // Verify user's available balance in database is now 1,500
    const userWalletRes = await makeRequest('GET', '/api/wallet', null, {
      'Authorization': `Bearer ${standardToken}`
    });
    console.log('userWalletRes.body:', userWalletRes.body);
    countAssert(() => assert(Number(userWalletRes.body.wallet.availableBalance) === 1500, 'Authoritative wallet balance accurately credited to ₹1,500.00'), 'Authoritative ledger balance verified');

    // 5. DUPLICATE DELIVERY IDEMPOTENCY TEST: Send the exact same webhook event again
    const duplicateWebhookRes = await makeRequest('POST', '/api/payments/webhook', webhookPayload, {
      'x-razorpay-signature': validHmac
    });
    countAssert(() => assert(duplicateWebhookRes.status === 200 && duplicateWebhookRes.body.message.includes('safely ignored'), 'Duplicate webhook event safely deduplicated (idempotent)'), 'Webhook deduplication');

    // Verify balance is STILL 1,500 (not 3,000)
    const walletAfterDup = await makeRequest('GET', '/api/wallet', null, {
      'Authorization': `Bearer ${standardToken}`
    });
    countAssert(() => assert(Number(walletAfterDup.body.wallet.availableBalance) === 1500, 'Duplicate webhook did NOT credit wallet twice'), 'Zero double-crediting');

    // -------------------------------------------------------------------------
    // GROUP 5: Withdrawal Request & Fund Hold Release
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 5: Withdrawal Pipeline & Fund Hold Release ---');
    // User requests 500 withdrawal
    const wthReq = await makeRequest('POST', '/api/withdrawals', {
      amount: 500,
      payoutMethod: 'bank_transfer',
      accountNumber: '998877665544',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'Standard User P3'
    }, {
      'Authorization': `Bearer ${standardToken}`
    });
    countAssert(() => assert(wthReq.status === 201, 'Withdrawal request created'), 'Withdrawal submission');
    const wthId = wthReq.body.withdrawal.id;

    // Available balance should now be 1,000 (1,500 - 500 hold)
    const walletDuringHold = await makeRequest('GET', '/api/wallet', null, {
      'Authorization': `Bearer ${standardToken}`
    });
    countAssert(() => assert(Number(walletDuringHold.body.wallet.availableBalance) === 1000 && Number(walletDuringHold.body.wallet.pendingWithdrawals) === 500, 'Funds placed in WITHDRAWAL_HOLD: Available ₹1,000, Hold ₹500'), 'Withdrawal hold reservation');

    // Admin approves
    const appWth = await makeRequest('POST', `/api/admin/withdrawals/${wthId}/approve`, {
      note: 'Verified KYC and account match'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(appWth.status === 200 && appWth.body.status === 'APPROVED', 'Admin approved withdrawal'), 'Withdrawal approval');

    // Admin rejects with reason (should release the 500 hold back to available balance)
    const rejWth = await makeRequest('POST', `/api/admin/withdrawals/${wthId}/reject`, {
      reason: 'Name on bank account does not match KYC documents'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(rejWth.status === 200 && rejWth.body.status === 'REJECTED', 'Admin rejected withdrawal'), 'Withdrawal rejection');

    // Verify balance is restored back to 1,500
    const walletAfterRelease = await makeRequest('GET', '/api/wallet', null, {
      'Authorization': `Bearer ${standardToken}`
    });
    countAssert(() => assert(Number(walletAfterRelease.body.wallet.availableBalance) === 1500 && Number(walletAfterRelease.body.wallet.pendingWithdrawals) === 0, 'Rejected withdrawal released hold: Available balance restored to ₹1,500.00'), 'Fund hold release verified');

    // -------------------------------------------------------------------------
    // GROUP 6: Return Batch Execution & Idempotency
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 6: Return Engine & Idempotency ---');
    // Admin triggers batch return run
    const testPeriod = `TEST_PERIOD_${Date.now()}`;
    const batchRun1 = await makeRequest('POST', '/api/admin/returns/run-batch', {
      periodKey: testPeriod
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(batchRun1.status === 200 && batchRun1.body.success === true, 'Return batch calculation executed successfully'), 'Return batch run');

    // Immediate second run for the same period
    const batchRun2 = await makeRequest('POST', '/api/admin/returns/run-batch', {
      periodKey: testPeriod
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(batchRun2.status === 200 && batchRun2.body.summary.totalCalculated === 0 && batchRun2.body.summary.totalSkippedDuplicate >= batchRun1.body.summary.totalCalculated, 'Second batch run skipped existing period entries (idempotent)'), 'Return batch idempotency');

    // -------------------------------------------------------------------------
    // GROUP 7: Platform Financial Invariant Reconciliation
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 7: Platform Invariant Reconciliation ---');
    const reconFinal = await makeRequest('GET', '/api/admin/reconciliation', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    countAssert(() => assert(reconFinal.status === 200 && reconFinal.body.report.isHealthy === true, 'Reconciliation audit reports system 100% healthy'), 'Reconciliation health');
    countAssert(() => assert(reconFinal.body.report.invariants.noNegativeBalances === true, 'Invariant 1 holds: Zero negative balances on platform'), 'Invariant: No negative balances');
    countAssert(() => assert(reconFinal.body.report.invariants.noDuplicateTransactionReferences === true, 'Invariant 2 holds: Zero duplicate transaction references in ledger'), 'Invariant: Unique ledger references');
    countAssert(() => assert(reconFinal.body.report.invariants.liveReturnCreditingDisabled === true, 'Safety policy confirmed: Live return crediting is disabled'), 'Safety policy verified');

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
  }

  console.log('\n===============================================================');
  console.log(`PROMPT 3 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPrompt3Tests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = runPrompt3Tests;
