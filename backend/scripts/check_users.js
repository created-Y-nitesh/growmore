require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');

async function checkUsers() {
  try {
    const res = await db.query('SELECT id, full_name, email, phone, is_phone_verified, created_at FROM public.users;');
    console.log('TOTAL USERS:', res.rows.length);
    console.log('USERS:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

checkUsers();
