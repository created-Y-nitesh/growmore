const db = require('../db');
const withdrawalController = require('../controllers/withdrawalController');
const walletService = require('../services/walletService');

async function testWithdrawals() {
  console.log('\n=== TESTING WITHDRAWAL RULES ENFORCEMENT ===');
  const userRes = await db.query("SELECT id, email FROM users WHERE email = 'audit_test_user@growmore.com' LIMIT 1;");
  const userId = userRes.rows[0].id;

  function mockReq(body) {
    return {
      user: { userId },
      body
    };
  }

  function mockRes() {
    const res = {
      statusCode: 200,
      data: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.data = payload;
        return this;
      }
    };
    return res;
  }

  // TEST 1: Attempt to withdraw from principal (Should FAIL with 400)
  console.log('\nTest 1: Withdraw from Principal (Locked 365 days):');
  const res1 = mockRes();
  await withdrawalController.createWithdrawal(mockReq({
    amount: 5000,
    sourceWallet: 'principal',
    payoutMethod: 'IMPS Bank Transfer'
  }), res1, (err) => console.error(err));
  console.log(`Status: ${res1.statusCode}`, res1.data);

  // TEST 2: Attempt to withdraw daily earnings before ₹1,000 threshold (Should FAIL with 400)
  console.log('\nTest 2: Withdraw Daily Earnings when balance is ₹99 (Min threshold ₹1,000):');
  const res2 = mockRes();
  await withdrawalController.createWithdrawal(mockReq({
    amount: 99,
    sourceWallet: 'daily_earning',
    payoutMethod: 'UPI'
  }), res2, (err) => console.error(err));
  console.log(`Status: ${res2.statusCode}`, res2.data);

  // TEST 3: Attempt to withdraw interest < ₹500 (Should FAIL with 400)
  console.log('\nTest 3: Withdraw Interest ₹300 (Min threshold ₹500):');
  const res3 = mockRes();
  await withdrawalController.createWithdrawal(mockReq({
    amount: 300,
    sourceWallet: 'interest',
    payoutMethod: 'IMPS Bank Transfer'
  }), res3, (err) => console.error(err));
  console.log(`Status: ${res3.statusCode}`, res3.data);

  // TEST 4: Withdraw Interest ₹500 when interest balance is ₹900 (Should SUCCEED with 201)
  console.log('\nTest 4: Withdraw Interest ₹500:');
  const res4 = mockRes();
  await withdrawalController.createWithdrawal(mockReq({
    amount: 500,
    sourceWallet: 'interest',
    payoutMethod: 'IMPS Bank Transfer',
    payoutDetails: { accountNumber: '1234567890', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' }
  }), res4, (err) => console.error(err));
  console.log(`Status: ${res4.statusCode}`, res4.data);

  // Verify wallet balance after interest withdrawal
  const summary = await walletService.getUserWalletSummary(userId);
  console.log('\nWallet summary after ₹500 interest withdrawal:');
  console.log({
    interestBalance: summary.interestBalance, // Should be 900 - 500 = 400
    pendingWithdrawals: summary.pendingWithdrawals, // 500
    canWithdrawInterest: summary.canWithdrawInterest // false (400 < 500)
  });

  process.exit(0);
}

testWithdrawals();
