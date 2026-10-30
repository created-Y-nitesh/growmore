const pool = require('../db');

async function migrate() {
  console.log('Running migration: email OTP support...');
  await pool.query(`
    -- Increase phone column length to 255 so emails or phones can fit safely
    ALTER TABLE otp_verifications ALTER COLUMN phone TYPE VARCHAR(255);

    -- Add email column to otp_verifications if not exists
    ALTER TABLE otp_verifications ADD COLUMN IF NOT EXISTS email VARCHAR(255);

    -- Ensure phone column is nullable in users table
    ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

    -- Add index on email in otp_verifications
    CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_verifications (lower(email), purpose);
  `);
  console.log('Migration completed successfully.');
  pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
