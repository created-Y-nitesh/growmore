/**
 * Razorpay Test Mode Automated Verification Suite
 * Tests:
 * 1. Razorpay SDK initialization & Test Mode adapter
 * 2. GET /api/payments/config (public key exposed, secret protected)
 * 3. POST /api/payments/create-order (validation & PostgreSQL tracking)
 * 4. POST /api/payments/verify (forgery rejection, valid HMAC verification, atomic wallet crediting, idempotency)
 * 5. POST /api/payments/webhook (raw-body HMAC verification, duplicate event deduplication)
 * 6. Protection against unverified deposits and secret leakage
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('../server');
const pool = require('../db');
const paymentAdapter = require('../services/paymentProvider/paymentAdapter');
const jwt = require('jsonwebtoken');

let server;
let baseUrl;

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const isBuffer = Buffer.isBuffer(data);
    const bodyStr = isBuffer ? data : (data !== null ? JSON.stringify(data) : null);

    const reqHeaders = { ...headers };

    if (bodyStr && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.isBuffer(bodyStr) ? bodyStr.length : Buffer.byteLength(bodyStr);
    } else if (isBuffer && reqHeaders['Content-Length'] === undefined) {
      reqHeaders['Content-Length'] = bodyStr.length;
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

async function runRazorpayTests() {
  console.log('===============================================================');
  console.log('   GROWMORE RAZORPAY TEST MODE AUTOMATED TEST SUITE           ');
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

  // 1. Start ephemeral test server
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  try {
    // 2. Setup test user in database
    const testPhone = '9999900001';
    const testEmail = 'razorpay_test@growmore.app';

    const cleanUser = async () => {
      const existing = await pool.query("SELECT id FROM users WHERE phone = $1 OR email = $2", [testPhone, testEmail]);
      for (const row of existing.rows) {
        await pool.query("DELETE FROM wallet_ledger WHERE user_id = $1", [row.id]);
        await pool.query("DELETE FROM payments WHERE user_id = $1", [row.id]);
        await pool.query("DELETE FROM deposits WHERE user_id = $1", [row.id]);
        await pool.query("DELETE FROM users WHERE id = $1", [row.id]);
      }
    };

    await cleanUser();

    const userRes = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified)
       VALUES ('Razorpay Test User', $1, 'hashed_test_password', $2, 'USER', 'ACTIVE', TRUE)
       RETURNING id, full_name, email, phone, role`,
      [testEmail, testPhone]
    );
    const testUser = userRes.rows[0];
    const userToken = jwt.sign(
      { id: testUser.id, role: testUser.role, phone: testUser.phone },
      process.env.JWT_SECRET || 'test_jwt_secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${userToken}` };

    console.log('[TEST 1] Adapter & SDK Initialization');
    countAssert(() => {
      assert(paymentAdapter.provider === 'razorpay', 'Payment provider is set to razorpay');
      assert(paymentAdapter.isTestMode() === true, 'Adapter is locked in TEST MODE');
      assert(typeof paymentAdapter.createOrder === 'function', 'createOrder function available');
      assert(typeof paymentAdapter.verifyPaymentSignature === 'function', 'verifyPaymentSignature function available');
    }, 'Adapter initialization checks');

    console.log('\n[TEST 2] GET /api/payments/config Endpoint');
    const configRes = await makeRequest('GET', '/api/payments/config');
    countAssert(() => {
      assert(configRes.status === 200, 'Config endpoint responds with HTTP 200');
      assert(configRes.body.success === true, 'Config response success is true');
      assert(configRes.body.provider === 'razorpay', 'Config returns provider as razorpay');
      assert(configRes.body.isLiveEnabled === false, 'Real-money deposits disabled (safety invariant)');
      assert(configRes.body.isTestMode === true, 'Test mode indicator is true');
      assert(configRes.body.keyId !== undefined, 'Public keyId is returned');
      assert(configRes.body.keySecret === undefined, 'Key secret is NEVER exposed in config response');
      assert(!JSON.stringify(configRes.body).includes(process.env.RAZORPAY_KEY_SECRET || 'secret'), 'No secret leak in response payload');
    }, 'Public config safety checks');

    console.log('\n[TEST 3] POST /api/payments/create-order Endpoint');
    // 3a: Rejects unauthenticated request
    const unauthRes = await makeRequest('POST', '/api/payments/create-order', { amount: 1000 });
    countAssert(() => {
      assert(unauthRes.status === 401, 'Unauthenticated order creation rejected with HTTP 401');
    }, 'Auth guard on create-order');

    // 3b: Rejects invalid or sub-minimum amount
    const invalidAmtRes = await makeRequest('POST', '/api/payments/create-order', { amount: 50 }, authHeaders);
    countAssert(() => {
      assert(invalidAmtRes.status === 400, 'Sub-minimum deposit (< ₹100) rejected with HTTP 400');
    }, 'Minimum deposit server validation');

    // 3c: Creates order successfully
    const createRes = await makeRequest('POST', '/api/payments/create-order', { amount: 1500, purpose: 'wallet_topup' }, authHeaders);
    countAssert(() => {
      assert(createRes.status === 201, 'Order created with HTTP 201');
      assert(createRes.body.success === true, 'create-order body success is true');
      assert(createRes.body.orderId.startsWith('order_'), 'Returned valid order_id format');
      assert(createRes.body.amount === 150000, 'Amount returned in minor units (paise: 150000)');
      assert(createRes.body.amountInRupees === 1500, 'amountInRupees matches 1500');
      assert(createRes.body.currency === 'INR', 'Currency is INR');
      assert(createRes.body.depositId !== undefined, 'Deposit record created and linked');
    }, 'Valid order creation response');

    const createdOrderId = createRes.body.orderId;
    const createdDepositId = createRes.body.depositId;

    // 3d: Verify PostgreSQL record created in payments table
    const paymentRow = await pool.query('SELECT * FROM payments WHERE order_id = $1', [createdOrderId]);
    countAssert(() => {
      assert(paymentRow.rows.length === 1, 'Payment record stored in PostgreSQL payments table');
      assert(paymentRow.rows[0].status === 'created', 'Payment record initialized with status "created"');
      assert(Number(paymentRow.rows[0].amount) === 1500, 'Payment record amount is 1500');
      assert(paymentRow.rows[0].user_id === testUser.id, 'Payment record linked to correct user');
    }, 'PostgreSQL payments table persistence');

    console.log('\n[TEST 4] POST /api/payments/verify Cryptographic Signature Verification');
    const dummyPaymentId = `pay_test_${crypto.randomBytes(6).toString('hex')}`;

    // 4a: Rejects forged signature
    const forgedSignature = 'forged_deadbeef_signature_1234567890abcdef';
    const rejectRes = await makeRequest('POST', '/api/payments/verify', {
      razorpay_order_id: createdOrderId,
      razorpay_payment_id: dummyPaymentId,
      razorpay_signature: forgedSignature,
      depositId: createdDepositId
    }, authHeaders);

    countAssert(() => {
      assert(rejectRes.status === 400, 'Forged signature rejected with HTTP 400');
      assert(rejectRes.body.error === 'SIGNATURE_VERIFICATION_FAILED', 'Correct error code returned');
    }, 'Forged signature rejection');

    // 4b: Generates authentic HMAC SHA256 using key secret and verifies
    const secret = paymentAdapter.keySecret || 'mock_secret_for_tests';
    const validHmac = crypto.createHmac('sha256', secret)
      .update(`${createdOrderId}|${dummyPaymentId}`)
      .digest('hex');

    const verifyRes = await makeRequest('POST', '/api/payments/verify', {
      razorpay_order_id: createdOrderId,
      razorpay_payment_id: dummyPaymentId,
      razorpay_signature: validHmac,
      depositId: createdDepositId
    }, authHeaders);

    countAssert(() => {
      assert(verifyRes.status === 200, 'Authentic signature accepted with HTTP 200');
      assert(verifyRes.body.success === true, 'Verification success is true');
    }, 'Authentic signature acceptance');

    // 4c: Verify PostgreSQL state update and atomic ledger credit
    const updatedPayment = await pool.query('SELECT * FROM payments WHERE order_id = $1', [createdOrderId]);
    const updatedDeposit = await pool.query('SELECT * FROM deposits WHERE id = $1', [createdDepositId]);
    const ledgerRow = await pool.query("SELECT * FROM wallet_ledger WHERE user_id = $1 AND entry_type = 'DEPOSIT'", [testUser.id]);

    countAssert(() => {
      assert(updatedPayment.rows[0].status === 'captured', 'payments table status transitioned to "captured"');
      assert(updatedPayment.rows[0].payment_id === dummyPaymentId, 'payments table recorded payment_id');
      assert(updatedPayment.rows[0].verified_at !== null, 'verified_at timestamp recorded');
      assert(updatedDeposit.rows[0].status === 'SUCCESS', 'deposits table status transitioned to "SUCCESS"');
      assert(ledgerRow.rows.length === 1, 'Atomic ledger entry created in wallet_ledger');
      assert(Number(ledgerRow.rows[0].amount) === 1500, 'Ledger entry credited ₹1500');
    }, 'Atomic ledger and PostgreSQL state updates');

    // 4d: Verification Idempotency (prevent double crediting)
    const repeatVerify = await makeRequest('POST', '/api/payments/verify', {
      razorpay_order_id: createdOrderId,
      razorpay_payment_id: dummyPaymentId,
      razorpay_signature: validHmac,
      depositId: createdDepositId
    }, authHeaders);

    const ledgerAfterRepeat = await pool.query("SELECT * FROM wallet_ledger WHERE user_id = $1 AND entry_type = 'DEPOSIT'", [testUser.id]);
    countAssert(() => {
      assert(repeatVerify.status === 200, 'Repeat verification returns HTTP 200');
      assert(ledgerAfterRepeat.rows.length === 1, 'No duplicate wallet credit on repeated verification');
    }, 'Payment verification idempotency');

    console.log('\n[TEST 5] POST /api/payments/webhook Raw Body & Event Processing');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder_webhook_secret';
    const webhookEventId = `evt_test_${crypto.randomBytes(8).toString('hex')}`;
    const webhookPayload = JSON.stringify({
      id: webhookEventId,
      entity: 'event',
      account_id: 'acc_test_growmore',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_hook_${crypto.randomBytes(6).toString('hex')}`,
            order_id: createdOrderId,
            amount: 150000,
            currency: 'INR',
            status: 'captured'
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    });

    // 5a: Rejects webhook with invalid HMAC signature
    const badSigRes = await makeRequest('POST', '/api/payments/webhook', Buffer.from(webhookPayload), {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': 'invalid_signature_test',
      'X-Razorpay-Event-Id': webhookEventId
    });
    countAssert(() => {
      assert(badSigRes.status === 400, 'Invalid webhook signature rejected with HTTP 400');
    }, 'Webhook signature validation');

    // 5b: Accepts webhook with valid raw-body HMAC
    const validWebhookSig = crypto.createHmac('sha256', webhookSecret)
      .update(webhookPayload)
      .digest('hex');

    const goodHookRes = await makeRequest('POST', '/api/payments/webhook', Buffer.from(webhookPayload), {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': validWebhookSig,
      'X-Razorpay-Event-Id': webhookEventId
    });

    countAssert(() => {
      assert(goodHookRes.status === 200, 'Authentic webhook processed with HTTP 200');
      assert(goodHookRes.body.success === true, 'Webhook success is true');
    }, 'Webhook processing');

    // 5c: Deduplicates duplicate webhook delivery
    const dupHookRes = await makeRequest('POST', '/api/payments/webhook', Buffer.from(webhookPayload), {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': validWebhookSig,
      'X-Razorpay-Event-Id': webhookEventId
    });

    countAssert(() => {
      assert(dupHookRes.status === 200, 'Duplicate webhook returns HTTP 200');
      assert(dupHookRes.body.duplicate === true, 'Duplicate webhook identified and skipped safely');
    }, 'Webhook idempotency and deduplication');

    // Clean up test user
    await cleanUser();

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

runRazorpayTests();
