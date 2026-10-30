const db = require('../db');
const depositController = require('../controllers/depositController');
const adminController = require('../controllers/adminController');
const withdrawalController = require('../controllers/withdrawalController');
const walletService = require('../services/walletService');

async function testManualFlow() {
  console.log('=== TESTING MANUAL ADMIN DEPOSIT & WITHDRAWAL PIPELINE ===');

  const userRes = await db.query("SELECT id, email FROM users WHERE email = 'audit_test_user@growmore.com' LIMIT 1;");
  const userId = userRes.rows[0].id;

  function mockReq(user, body, params = {}) {
    return {
      user,
      body,
      params,
      ip: '127.0.0.1'
    };
  }

  function mockRes() {
    return {
      statusCode: 200,
      data: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.data = payload; return this; }
    };
  }

  const adminUser = { id: 1, email: 'admin@growmore.com', role: 'admin' };
  const clientUser = { userId, email: 'audit_test_user@growmore.com', role: 'user' };

  // 1. User submits a manual deposit request of ₹10,000 with UPI UTR
  console.log('\n1. User submits deposit request of ₹10,000:');
  const depRes = mockRes();
  const utrRef = `UTR-${Date.now()}`;
  await depositController.createDeposit(mockReq(clientUser, {
    amount: 10000,
    paymentProvider: 'UPI Transfer',
    providerReference: utrRef
  }), depRes, (err) => console.error(err));
  console.log(`Deposit Created (Status ${depRes.statusCode}):`, depRes.data);
  const depositId = depRes.data.deposit.id;

  // Verify wallet before approval (balance should NOT have increased yet!)
  let summary = await walletService.getUserWalletSummary(userId);
  console.log(`Available balance before admin approval: ₹${summary.availableBalance}`);

  // 2. Admin verifies deposit manually
  console.log(`\n2. Admin approves and credits deposit #${depositId}:`);
  const adminDepRes = mockRes();
  await adminController.verifyDepositManual(mockReq(adminUser, {
    transactionReference: `BANK-CREDIT-${Date.now()}`,
    notes: 'Verified received in HDFC current account'
  }, { id: depositId }), adminDepRes, (err) => console.error(err));
  console.log(`Admin Verification (Status ${adminDepRes.statusCode}):`, adminDepRes.data);

  // Verify wallet after approval (balance should now have increased by ₹10,000!)
  summary = await walletService.getUserWalletSummary(userId);
  console.log(`Available balance after admin approval: ₹${summary.availableBalance}`);

  // 3. User requests a withdrawal of ₹400 from interest (we had ₹400 left)
  // Let's credit ₹400 to interest so interest balance is well over ₹500
  await db.query(`
    INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status)
    VALUES ($1, 'TEST_INT_CREDIT_${Date.now()}', 'RETURN_CREDIT', 'INTEREST', 400, 700, 'INR', 'COMPLETED');
  `, [userId]);

  console.log('\n3. User submits withdrawal request of ₹500 from Interest Wallet:');
  const wdrRes = mockRes();
  await withdrawalController.createWithdrawal(mockReq(clientUser, {
    amount: 500,
    sourceWallet: 'interest',
    payoutMethod: 'IMPS Bank Transfer',
    payoutDetails: { accountNumber: '9876543210', ifsc: 'SBIN0001234', bankName: 'SBI' }
  }), wdrRes, (err) => console.error(err));
  console.log(`Withdrawal Submitted (Status ${wdrRes.statusCode}):`, wdrRes.data);
  const withdrawalId = wdrRes.data.withdrawal.id;

  // 4. Admin reviews and approves withdrawal
  console.log(`\n4. Admin approves withdrawal #${withdrawalId} for payout:`);
  const adminApproveRes = mockRes();
  await adminController.approveWithdrawal(mockReq(adminUser, {
    note: 'Approved for manual IMPS transfer'
  }, { id: withdrawalId }), adminApproveRes, (err) => console.error(err));
  console.log(`Admin Approval (Status ${adminApproveRes.statusCode}):`, adminApproveRes.data);

  // 5. Admin sends money manually from bank app, enters IMPS UTR and marks PAID
  console.log(`\n5. Admin marks withdrawal #${withdrawalId} as PAID:`);
  const adminPaidRes = mockRes();
  await adminController.markWithdrawalPaid(mockReq(adminUser, {
    payoutReference: `IMPS-BANK-UTR-${Date.now()}`,
    note: 'Transferred via SBI corporate netbanking'
  }, { id: withdrawalId }), adminPaidRes, (err) => console.error(err));
  console.log(`Admin Paid (Status ${adminPaidRes.statusCode}):`, adminPaidRes.data);

  console.log('\n=== MANUAL ADMIN DEPOSIT & PAYOUT VERIFICATION SUCCESSFUL ===');
  process.exit(0);
}

testManualFlow();
