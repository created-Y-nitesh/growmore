const http = require('http');
const app = require('../server');
const pool = require('../db');
const { calculateEstimatedReturn, isLiveCreditingEnabled } = require('../services/returnCalculatorService');

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

async function runPrompt2Tests() {
  console.log('===============================================================');
  console.log('   GROWMORE PROMPT 2 TEST SUITE: INVESTMENT, WALLET & LEDGER   ');
  console.log('===============================================================\n');

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
    // 1. Setup Test User
    const testTimestamp = Date.now();
    const regRes = await request(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      fullName: 'Financial Auditor',
      email: `auditor_${testTimestamp}@growmore.test`,
      password: 'AuditPassword2026!'
    });

    assert(regRes.status === 201, 'Test user registered');
    const token = regRes.data.token;
    const userId = regRes.data.user.id;
    const authHeaders = { 'Authorization': `Bearer ${token}` };

    // 2. Authentication Protection
    console.log('\n--- GROUP 1: Auth Protection on Financial Routes ---');
    const noAuthWallet = await request(server, { path: '/api/wallet' });
    assert(noAuthWallet.status === 401, 'GET /api/wallet requires auth');

    const noAuthInv = await request(server, { path: '/api/investments/my' });
    assert(noAuthInv.status === 401, 'GET /api/investments/my requires auth');

    const noAuthDep = await request(server, { path: '/api/deposits/my' });
    assert(noAuthDep.status === 401, 'GET /api/deposits/my requires auth');

    const noAuthWdr = await request(server, { path: '/api/withdrawals/my' });
    assert(noAuthWdr.status === 401, 'GET /api/withdrawals/my requires auth');

    // 3. Initial Empty Wallet Check
    console.log('\n--- GROUP 2: Wallet & Ledger Verification ---');
    const initialWallet = await request(server, { path: '/api/wallet', headers: authHeaders });
    assert(initialWallet.status === 200, 'GET /api/wallet returns 200');
    assert(initialWallet.data.wallet.availableBalance === 0, 'New user has exactly ₹0.00 available balance');
    assert(initialWallet.data.wallet.totalPortfolio === 0, 'New user has ₹0.00 total portfolio');

    // 4. Deposit Request Lifecycle (No fake money crediting!)
    console.log('\n--- GROUP 3: Deposit Request Creation & Pending Status ---');
    const depRes = await request(server, {
      path: '/api/deposits',
      method: 'POST',
      headers: authHeaders
    }, {
      amount: 10000,
      paymentProvider: 'UPI Instant Gateway',
      providerReference: `UPI-UTR-${testTimestamp}`
    });

    assert(depRes.status === 201, 'POST /api/deposits creates pending deposit');
    assert(depRes.data.deposit.status === 'PENDING', 'Deposit status is PENDING');
    assert(depRes.data.gatewayNotice.status === 'AWAITING_PROVIDER_WEBHOOK', 'Provider webhook notice included');

    // Verify wallet balance is STILL zero (unverified deposit does NOT grant funds)
    const walletAfterDep = await request(server, { path: '/api/wallet', headers: authHeaders });
    assert(walletAfterDep.data.wallet.availableBalance === 0, 'Unverified deposit did NOT credit available balance');
    assert(walletAfterDep.data.wallet.pendingDeposits === 10000, 'Pending deposit tracked in wallet breakdown');

    // 5. Authorized Ledger Crediting (Simulating Verified Settlement)
    console.log('\n--- GROUP 4: Authoritative Ledger Settlement ---');
    await pool.query(`
      INSERT INTO wallet_ledger 
        (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status)
      VALUES 
        ($1, $2, 'DEPOSIT', 'MAIN', 10000.00, 10000.00, 'INR', 'COMPLETED');
    `, [userId, `SETTLED-DEP-${testTimestamp}`]);

    const walletAfterCredit = await request(server, { path: '/api/wallet', headers: authHeaders });
    assert(walletAfterCredit.data.wallet.availableBalance === 10000, 'Available balance is now ₹10,000.00');

    // 6. Investment Creation & Term Snapshotting
    console.log('\n--- GROUP 5: Investment Contracts & Allocation ---');
    // Fetch active plan
    const plansRes = await request(server, { path: '/api/plans' });
    const starterPlan = plansRes.data.plans[0];

    const invRes = await request(server, {
      path: '/api/investments',
      method: 'POST',
      headers: authHeaders
    }, {
      planId: starterPlan.id,
      principalAmount: 2000
    });

    assert(invRes.status === 201, 'POST /api/investments returns 201');
    assert(invRes.data.investment.status === 'active', 'Investment funded and marked active');
    assert(invRes.data.investment.principalAmount === 2000, 'Principal recorded as 2000');
    assert(invRes.data.investment.termsSnapshot.planId === starterPlan.id, 'Terms snapshot preserved');
    assert(invRes.data.wallet.availableBalance === 8000, 'Wallet debited from 10,000 to 8,000');

    // Check my investments endpoint
    const myInvs = await request(server, { path: '/api/investments/my', headers: authHeaders });
    assert(myInvs.status === 200, 'GET /api/investments/my returns 200');
    assert(myInvs.data.investments.length === 1, 'My investments includes created plan');

    // Check single investment endpoint
    const invId = invRes.data.investment.id;
    const singleInv = await request(server, { path: `/api/investments/${invId}`, headers: authHeaders });
    assert(singleInv.status === 200, `GET /api/investments/${invId} returns 200`);

    // 7. Withdrawal Request & Fund Reservation
    console.log('\n--- GROUP 6: Withdrawal Fund Reservation & Concurrency ---');
    // Test insufficient funds
    const excessWdr = await request(server, {
      path: '/api/withdrawals',
      method: 'POST',
      headers: authHeaders
    }, {
      amount: 50000
    });
    assert(excessWdr.status === 400, 'Withdrawal exceeding available funds rejected with 400');

    // Valid withdrawal: available is 8000, request 3000
    const validWdr = await request(server, {
      path: '/api/withdrawals',
      method: 'POST',
      headers: authHeaders
    }, {
      amount: 3000,
      payoutMethod: 'HDFC IMPS',
      payoutDetails: { accountNumber: '1234567890', ifsc: 'HDFC0001234' }
    });

    assert(validWdr.status === 201, 'POST /api/withdrawals reserves funds');
    assert(validWdr.data.wallet.availableBalance === 5000, 'Available balance debited to 5,000');
    assert(validWdr.data.wallet.reservedInWithdrawal === 3000, 'Reserved amount tracked');

    // Concurrent double-spend attempt:
    // Available is 5000. Try two simultaneous requests for 4000 each (total 8000).
    // Exactly ONE must succeed and ONE must fail.
    console.log('\n--- GROUP 7: Concurrency & Double-Spend Protection ---');
    const [wdrA, wdrB] = await Promise.all([
      request(server, { path: '/api/withdrawals', method: 'POST', headers: authHeaders }, { amount: 4000 }),
      request(server, { path: '/api/withdrawals', method: 'POST', headers: authHeaders }, { amount: 4000 })
    ]);

    const oneSucceeded = (wdrA.status === 201 && wdrB.status === 400) || (wdrA.status === 400 && wdrB.status === 201);
    assert(oneSucceeded, 'Row-lock prevented concurrent double-spend: only one 4,000 withdrawal succeeded');

    const walletAfterRace = await request(server, { path: '/api/wallet', headers: authHeaders });
    assert(walletAfterRace.data.wallet.availableBalance === 1000, 'Remaining balance is exactly ₹1,000.00 (never negative)');

    // 8. Return Calculation Engine
    console.log('\n--- GROUP 8: Mathematical Return Precision ---');
    const calcReturn = calculateEstimatedReturn({ principalAmount: 1000, returnRatePercentage: 10, durationDays: 30 });
    assert(calcReturn === 100.00, 'Starter 30-day return on 1000 at 10% is exactly 100.00');

    const annualReturn = calculateEstimatedReturn({ principalAmount: 10000, returnRatePercentage: 10, durationDays: 365 });
    // 10000 * 0.10 * (365 / 30) = 12166.67
    assert(calcReturn > 0 && annualReturn === 12166.67, 'Annual 365-day return uses exact half-up rounding: 12,166.67');
    assert(!isLiveCreditingEnabled(), 'Live return crediting is safely DISABLED by default');

    // 9. Unified Transaction History
    console.log('\n--- GROUP 9: Unified Transaction History ---');
    const txnsRes = await request(server, { path: '/api/transactions', headers: authHeaders });
    assert(txnsRes.status === 200, 'GET /api/transactions returns 200');
    assert(Array.isArray(txnsRes.data.transactions), 'Transactions is an array');
    assert(txnsRes.data.transactions.length >= 3, 'Recorded transactions include deposit, investment, and withdrawal holds');

  } catch (err) {
    console.error('[Prompt 2 Test Execution Error]:', err);
    failed++;
  } finally {
    server.close();
    await pool.end();
  }

  console.log('\n===============================================================');
  console.log(`PROMPT 2 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runPrompt2Tests();
