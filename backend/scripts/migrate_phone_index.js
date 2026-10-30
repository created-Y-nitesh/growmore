require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');

async function migratePhoneConstraint() {
  try {
    console.log('Sanitizing phone index on public.users...');
    // Replace any empty string phones with NULL
    await db.query("UPDATE public.users SET phone = NULL WHERE phone = '' OR TRIM(phone) = '';");
    
    // Drop existing unique index if present
    await db.query("DROP INDEX IF EXISTS public.idx_users_phone;");
    
    // Recreate unique index only for valid non-empty phones
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON public.users (phone) WHERE (phone IS NOT NULL AND phone <> '');");
    
    console.log('Phone constraint successfully updated and sanitized.');
    process.exit(0);
  } catch (err) {
    console.error('Error migrating phone constraint:', err);
    process.exit(1);
  }
}

migratePhoneConstraint();
