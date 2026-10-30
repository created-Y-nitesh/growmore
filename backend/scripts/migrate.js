const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Starting database migrations...');
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`[Migration] Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`[Migration] Successfully applied ${file}`);
    }
    console.log('[Migration] All migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] Migration failed, transaction rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
