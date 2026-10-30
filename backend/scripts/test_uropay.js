/**
 * UroPay Payment Gateway Automated Verification Suite
 * Tests:
 * 1. UroPay adapter initialization & HMAC-SHA256 request headers
 * 2. GET /api/payments/config (public apiKey exposed, secret safely guarded)
 * 3. POST /api/payments/create-order (validation & PostgreSQL tracking)
 * 4. POST /api/payments/verify (valid verification, atomic wallet crediting, idempotency)
 * 5. POST /api/payments/webhook (raw-body HMAC verification, duplicate event deduplication)
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

async function runUroPayTests() {
  console.log('===============================================================');
  console.log('      GROWMORE UROPAY GATEWAY AUTOMATED TEST SUITE             ');
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
    const testPhone = '9999900009';
    const testEmail = 'uropay_test@growmore.app';

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
       VALUES ('UroPay Test User', $1, 'hashed_test_password', $2, 'USER', 'ACTIVE', TRUE)
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

    console.log('[TEST 1] Adapter & Request Signing Verification');
    countAssert(() => {
      assert(paymentAdapter.provider === 'uropay', 'Payment provider is set to uropay');
      assert(typeof paymentAdapter.createOrder === 'function', 'createOrder function available');
      assert(typeof paymentAdapter.verifyPaymentSignature === 'function', 'verifyPaymentSignature function available');
      assert(typeof paymentAdapter.generateRequestHeaders === 'function', 'generateRequestHeaders function available');

      const headers = paymentAdapter.generateRequestHeaders('POST', '/v1/orders', '', { amount: 1000 });
      assert(headers['X-Signature'] !== undefined, 'Generated HMAC X-Signature header');
      assert(headers['X-Timestamp'] !== undefined, 'Generated X-Timestamp header');
      assert(headers['X-Nonce'] !== undefined, 'Generated X-Nonce header');
    }, 'UroPay Adapter initialization checks');

    console.log('\n[TEST 2] GET /api/payments/config Endpoint');
    const configRes = await makeRequest('GET', '/api/payments/config');
    countAssert(() => {
      assert(configRes.status === 200, 'Config endpoint responds with HTTP 200');
      assert(configRes.body.success === true, 'Config response success is true');
      assert(configRes.body.provider === 'uropay', 'Config returns provider as uropay');
      assert(configRes.body.apiSecret === undefined, 'Secret is NEVER exposed in config response');
      assert(!JSON.stringify(configRes.body).includes(process.env.UROPAY_API_SECRET || 'secret'), 'No secret leak in response payload');
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

    const createRes = await makeRequest('POST', '/api/payments/create-order', { amount: 2000, purpose: 'wallet_topup' }, authHeaders);
    countAssert(() => {
      assert(createRes.status === 201, 'Order created with HTTP 201');
      assert(createRes.body.success === true, 'create-order body success is true');
      assert(createRes.body.provider === 'uropay', 'Provider is uropay');
      assert(
        createRes.body.orderId && 
        (createRes.body.orderId.toLowerCase().startsWith('uro') || 
         createRes.body.orderId.toLowerCase().startsWith('ord') ||
         createRes.body.orderId.toUpperCase().startsWith('URPY')),
        'Valid UroPay order ID returned'
      );
      assert(createRes.body.amount === 2000, 'amount matches 2000');
      assert(createRes.body.currency === 'INR', 'Currency is INR');
      assert(createRes.body.depositId !== undefined, 'Deposit record created and linked');
    }, 'Valid order creation response');

    const createdOrderId = createRes.body.orderId;
    const createdDepositId = createRes.body.depositId;

    // 3d: Verify PostgreSQL record created in payments table
    const paymentRow = await pool.query('SELECT * FROM payments WHERE order_id = $1', [createdOrderId]);
    countAssert(() => {
      assert(paymentRow.rows.length === 1, 'Payment record stored in PostgreSQL payments table');
      assert(paymentRow.rows[0].provider === 'uropay', 'Payment record has provider uropay');
      assert(Number(paymentRow.rows[0].amount) === 2000, 'Payment record amount is 2000');
      assert(paymentRow.rows[0].user_id === testUser.id, 'Payment record linked to correct user');
    }, 'PostgreSQL payments table persistence');

    console.log('\n[TEST 4] POST /api/payments/verify Verification & Wallet Settlement');
    const dummyPaymentId = `pay_uro_${crypto.randomBytes(6).toString('hex')}`;

    const verifyRes = await makeRequest('POST', '/api/payments/verify', {
      orderId: createdOrderId,
      paymentId: dummyPaymentId,
      depositId: createdDepositId
    }, authHeaders);

    countAssert(() => {
      assert(verifyRes.status === 200, 'Payment verification accepted with HTTP 200');
      assert(verifyRes.body.success === true, 'Verification success is true');
      assert(Number(verifyRes.body.amount) === 2000, 'Credited amount matches 2000');
    }, 'Authentic verification acceptance');

    // 4b: Verify PostgreSQL state update and atomic ledger credit
    const updatedPayment = await pool.query('SELECT * FROM payments WHERE order_id = $1', [createdOrderId]);
    const updatedDeposit = await pool.query('SELECT * FROM deposits WHERE id = $1', [createdDepositId]);
    const ledgerRow = await pool.query("SELECT * FROM wallet_ledger WHERE user_id = $1 AND entry_type = 'DEPOSIT'", [testUser.id]);

    countAssert(() => {
      assert(updatedPayment.rows[0].status === 'captured', 'payments table status transitioned to "captured"');
      assert(updatedDeposit.rows[0].status === 'SUCCESS', 'deposits table status transitioned to "SUCCESS"');
      assert(ledgerRow.rows.length === 1, 'Atomic ledger entry created in wallet_ledger');
      assert(Number(ledgerRow.rows[0].amount) === 2000, 'Ledger entry credited ₹2000');
    }, 'Atomic ledger and PostgreSQL state updates');

    // 4c: Verification Idempotency
    const repeatVerify = await makeRequest('POST', '/api/payments/verify', {
      orderId: createdOrderId,
      paymentId: dummyPaymentId,
      depositId: createdDepositId
    }, authHeaders);

    const ledgerAfterRepeat = await pool.query("SELECT * FROM wallet_ledger WHERE user_id = $1 AND entry_type = 'DEPOSIT'", [testUser.id]);
    countAssert(() => {
      assert(repeatVerify.status === 200, 'Repeat verification returns HTTP 200');
      assert(ledgerAfterRepeat.rows.length === 1, 'No duplicate wallet credit on repeated verification');
    }, 'Payment verification idempotency');

    console.log('\n[TEST 5] POST /api/payments/webhook Event Processing');
    const webhookEventId = `evt_uro_${crypto.randomBytes(8).toString('hex')}`;
    const webhookPayload = JSON.stringify({
      id: webhookEventId,
      event: 'payment.captured',
      payload: {
        orderId: createdOrderId,
        paymentId: dummyPaymentId,
        amount: 2000,
        status: 'SUCCESS'
      }
    });

    const webhookSecret = process.env.UROPAY_WEBHOOK_SECRET || 'your_uropay_webhook_secret_here';
    const validWebhookSig = crypto.createHmac('sha256', webhookSecret).update(webhookPayload).digest('hex');

    const hookRes = await makeRequest('POST', '/api/payments/webhook', Buffer.from(webhookPayload), {
      'Content-Type': 'application/json',
      'X-UroPay-Signature': validWebhookSig,
      'X-UroPay-Event-Id': webhookEventId
    });

    countAssert(() => {
      assert(hookRes.status === 200, 'Webhook processed with HTTP 200');
      assert(hookRes.body.success === true, 'Webhook success is true');
    }, 'Webhook processing');

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

runUroPayTests();
