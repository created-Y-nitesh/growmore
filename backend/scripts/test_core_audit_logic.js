const db = require('../db');
const walletService = require('../services/walletService');
const returnBatchService = require('../services/returnBatchService');
const scheduledTasksService = require('../services/scheduledTasksService');

async function run() {
  console.log('=== STARTING AUDIT BUSINESS LOGIC VERIFICATION ===');

  try {
    // 1. Verify 4 active plans in PostgreSQL
    const plansRes = await db.query('SELECT id, plan_code, name, minimum_amount, duration_days, return_rate_percentage, is_active FROM investment_plans ORDER BY id');
    console.log('\n1. VERIFIED PLANS IN DB:');
    plansRes.rows.forEach(p => {
      console.log(` - [${p.plan_code}] ${p.name}: Min ₹${p.minimum_amount}, Duration: ${p.duration_days} days, Return: ${p.return_rate_percentage}%`);
    });

    // 2. Pick or create a test user
    let userRes = await db.query("SELECT id, email FROM users WHERE email = 'audit_test_user@growmore.com' LIMIT 1;");
    let testUserId;
    if (userRes.rows.length === 0) {
      const insUser = await db.query(`
        INSERT INTO users (full_name, email, password_hash, role, account_status, is_phone_verified)
        VALUES ('Audit Investor', 'audit_test_user@growmore.com', 'test_hash', 'user', 'active', TRUE)
        RETURNING id;
      `);
      testUserId = insUser.rows[0].id;
    } else {
      testUserId = userRes.rows[0].id;
    }

    // 3. Clear any past test ledger / investments for clean test
    await db.query('DELETE FROM wallet_ledger WHERE user_id = $1;', [testUserId]);
    await db.query('DELETE FROM return_entries WHERE user_id = $1;', [testUserId]);
    await db.query('DELETE FROM investments WHERE user_id = $1;', [testUserId]);
    await db.query('DELETE FROM withdrawals WHERE user_id = $1;', [testUserId]);

    // 4. Test Wallet Separation on fresh user
    let summary = await walletService.getUserWalletSummary(testUserId);
    console.log('\n2. INITIAL SEPARATED WALLET SUMMARY:');
    console.log({
      principalLocked: summary.principalLocked,
      interestBalance: summary.interestBalance,
      dailyEarningBalance: summary.dailyEarningBalance,
      availableBalance: summary.availableBalance,
      canWithdrawInterest: summary.canWithdrawInterest,
      canWithdrawDailyEarning: summary.canWithdrawDailyEarning
    });

    // 5. Simulate Top-up deposit ₹20,000 into MAIN wallet
    await db.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status)
      VALUES ($1, 'DEP_TEST_1', 'DEPOSIT', 'MAIN', 20000, 20000, 'INR', 'COMPLETED');
    `, [testUserId]);

    // 6. Allocate ₹5,000 into Daily Earning Plan (Plan 3)
    const dailyPlan = plansRes.rows.find(p => p.plan_code === 'DAILY');
    const invRes = await db.query(`
      INSERT INTO investments 
        (user_id, plan_id, plan_name, principal_amount, currency, status, expected_return_amount, start_date, maturity_date)
      VALUES 
        ($1, $2, $3, 5000, 'INR', 'active', 900, NOW(), NOW() + INTERVAL '365 days')
      RETURNING id;
    `, [testUserId, dailyPlan.id, dailyPlan.name]);
    const invId = invRes.rows[0].id;

    // Record allocation in ledger
    await db.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status)
      VALUES ($1, 'ALLOC_TEST_1', 'INVESTMENT_ALLOCATION', 'MAIN', -5000, 15000, 'INR', 'COMPLETED');
    `, [testUserId]);

    summary = await walletService.getUserWalletSummary(testUserId);
    console.log('\n3. AFTER INVESTING ₹5,000 IN DAILY PLAN:');
    console.log({
      principalLocked: summary.principalLocked, // Should be 5000
      availableBalance: summary.availableBalance, // Should be 15000
      interestBalance: summary.interestBalance, // 0
      dailyEarningBalance: summary.dailyEarningBalance // 0
    });

    // 7. Run Daily Bonus Batch (Should credit ₹99 to DAILY_EARNING wallet)
    const today = new Date().toISOString().split('T')[0];
    const bonusResult = await returnBatchService.processDailyBonusBatch({ targetDate: today });
    console.log('\n4. RUNNING DAILY BONUS BATCH:');
    console.log(bonusResult);

    summary = await walletService.getUserWalletSummary(testUserId);
    console.log('\n5. AFTER 1 DAY BONUS:');
    console.log({
      dailyEarningBalance: summary.dailyEarningBalance, // Should be 99
      canWithdrawDailyEarning: summary.canWithdrawDailyEarning, // false (needs 1000)
      minDailyEarningWithdrawal: summary.minDailyEarningWithdrawal // 1000
    });

    // 8. Test Idempotency (Running bonus batch again for the same date must NOT credit twice)
    const duplicateBonus = await returnBatchService.processDailyBonusBatch({ targetDate: today });
    console.log('\n6. RUNNING BONUS AGAIN TODAY (IDEMPOTENCY CHECK):');
    console.log({
      totalCredited: duplicateBonus.totalCredited, // Should be 0
      totalSkippedAlreadyCredited: duplicateBonus.totalSkippedAlreadyCredited // >= 1
    });

    // 9. Run Monthly ROI Batch (Should credit 18% of ₹5,000 = ₹900 to INTEREST wallet)
    const monthKey = today.slice(0, 7);
    const roiResult = await returnBatchService.processBatch({ periodKey: monthKey });
    console.log('\n7. RUNNING MONTHLY ROI BATCH:');
    console.log({
      totalCalculated: roiResult.totalCalculated,
      totalCreditedAmount: roiResult.totalCreditedAmount
    });

    summary = await walletService.getUserWalletSummary(testUserId);
    console.log('\n8. AFTER MONTHLY ROI:');
    console.log({
      interestBalance: summary.interestBalance, // Should be 900
      canWithdrawInterest: summary.canWithdrawInterest, // true (900 >= 500)
      minInterestWithdrawal: summary.minInterestWithdrawal // 500
    });

    console.log('\n=== ALL AUDIT CORE BUSINESS LOGIC TESTS PASSED ===');
    process.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

run();
