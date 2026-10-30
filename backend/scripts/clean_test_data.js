require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');

async function cleanTestData() {
  try {
    console.log('Cleaning test/mock financial transactions and resetting to fresh state...');
    
    await db.query(`DELETE FROM return_entries;`);
    await db.query(`DELETE FROM scheduled_job_runs;`);
    await db.query(`DELETE FROM payout_transactions WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin'));`);
    await db.query(`DELETE FROM wallet_ledger WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin');`);
    await db.query(`DELETE FROM withdrawals WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin');`);
    await db.query(`DELETE FROM deposits WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin');`);
    await db.query(`DELETE FROM investments WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin');`);
    
    // Delete test users and their related foreign rows
    const testUserIdsQuery = await db.query(`
      SELECT id FROM users 
      WHERE email LIKE '%@growmore.test' 
         OR email LIKE 'investor_%@example.com' 
         OR email LIKE 'auditor_%';
    `);
    const testUserIds = testUserIdsQuery.rows.map(r => r.id);

    if (testUserIds.length > 0) {
      await db.query(`DELETE FROM otp_verifications WHERE email IN (SELECT email FROM users WHERE id = ANY($1));`, [testUserIds]);
      await db.query(`DELETE FROM kyc_documents WHERE user_id = ANY($1);`, [testUserIds]);
      await db.query(`DELETE FROM support_tickets WHERE user_id = ANY($1);`, [testUserIds]);
      await db.query(`DELETE FROM wallet_ledger WHERE user_id = ANY($1);`, [testUserIds]);
      await db.query(`DELETE FROM users WHERE id = ANY($1);`, [testUserIds]);
      console.log(`Deleted ${testUserIds.length} dummy test user accounts.`);
    }

    const remainingUsers = await db.query(`SELECT count(*) FROM users;`);
    console.log(`Remaining verified users: ${remainingUsers.rows[0].count}`);

    const remainingPlans = await db.query(`SELECT count(*) FROM investment_plans WHERE is_active = TRUE;`);
    console.log(`Active investment tiers: ${remainingPlans.rows[0].count}`);

    console.log('Database successfully reset to clean production state!');
    process.exit(0);
  } catch (err) {
    console.error('Error cleaning test data:', err);
    process.exit(1);
  }
}

cleanTestData();
