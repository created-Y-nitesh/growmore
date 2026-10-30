require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');

async function migrate() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Expand wallet_type check constraint
    await client.query(`
      ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_wallet_type_check;
      ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_wallet_type_check 
        CHECK (wallet_type IN ('MAIN', 'INVESTMENT', 'WITHDRAWAL', 'INTEREST', 'DAILY_EARNING'));
    `);

    // 2. Expand entry_type check constraint
    await client.query(`
      ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_entry_type_check;
      ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_entry_type_check 
        CHECK (entry_type IN ('DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_SETTLED', 'INVESTMENT_ALLOCATION', 'RETURN_CREDIT', 'DAILY_BONUS_CREDIT', 'INVESTMENT_MATURITY', 'ADJUSTMENT'));
    `);

    await client.query('COMMIT');
    console.log('Successfully updated wallet_ledger check constraints.');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
