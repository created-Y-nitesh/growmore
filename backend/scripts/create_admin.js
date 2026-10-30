/**
 * Secure Administrator Provisioning Script
 * Usage:
 *   node scripts/create_admin.js "admin@growmore.com" "StrongPassword123!" "Platform Administrator"
 * Or via environment variables:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... node scripts/create_admin.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function provisionAdmin() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;
  const fullName = process.argv[4] || process.env.ADMIN_NAME || 'Platform Administrator';

  if (!email || !password) {
    console.error('Usage: node scripts/create_admin.js <email> <password> [fullName]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Security error: Admin password must be at least 8 characters.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log(`[Admin Provisioning] Checking existing account for: ${email}`);
    const existing = await client.query('SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      await client.query(
        `UPDATE users 
         SET role = 'admin', password_hash = $1, full_name = $2, account_status = 'active', updated_at = NOW() 
         WHERE id = $3`,
        [passwordHash, fullName, user.id]
      );
      console.log(`[Admin Provisioning] Successfully updated existing user (ID: ${user.id}) to role 'admin'.`);
    } else {
      const res = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ($1, $2, $3, 'admin', 'active')
         RETURNING id, email, role, created_at`,
        [fullName, email.toLowerCase(), passwordHash]
      );
      console.log(`[Admin Provisioning] Successfully provisioned new admin user (ID: ${res.rows[0].id}).`);
    }
  } catch (err) {
    console.error('[Admin Provisioning] Failed to provision admin user:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  provisionAdmin();
}

module.exports = provisionAdmin;
