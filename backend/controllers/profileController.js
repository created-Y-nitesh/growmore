/**
 * Profile Controller - Customer Profile Management & Field Protection
 * Enforces strict boundary: customers can read & update only permitted fields.
 * Privilege escalation (role, account_status, is_verified, balance) is strictly prohibited.
 */

const pool = require('../db');

const FORBIDDEN_FIELDS = [
  'role',
  'account_status',
  'is_verified',
  'balance',
  'admin',
  'id',
  'email',
  'created_at',
  'updated_at'
];

exports.getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const targetUid = req.user.supabase_uid || userId.toString();
    const email = req.user.email;

    // Check public.profiles first
    const profileRes = await pool.query(
      `SELECT id, email, full_name, phone, dob, role, account_status, is_verified, kyc_status, avatar_url, created_at, updated_at
       FROM public.profiles 
       WHERE id::text = $1 OR (email = $2 AND email <> '')`,
      [targetUid, email || '']
    );

    if (profileRes.rows.length > 0) {
      return res.json({
        success: true,
        profile: profileRes.rows[0]
      });
    }

    // Fallback to users table if profile not yet synced
    const userRes = await pool.query(
      `SELECT id, email, full_name, phone, role, account_status, is_phone_verified AS is_verified, kyc_status, created_at, updated_at
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found.'
      });
    }

    return res.json({
      success: true,
      profile: userRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    // 1. Strict Privilege Escalation Guard
    for (const forbiddenKey of FORBIDDEN_FIELDS) {
      if (body[forbiddenKey] !== undefined) {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED_FIELD_MODIFICATION',
          message: `Security violation: Modifying '${forbiddenKey}' is strictly forbidden.`
        });
      }
    }

    // 2. Extract allowed fields
    const allowedUpdates = {};
    const permittedKeys = ['full_name', 'phone', 'dob', 'avatar_url'];

    for (const key of permittedKeys) {
      if (body[key] !== undefined) {
        allowedUpdates[key] = body[key];
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No permitted profile fields provided for update.'
      });
    }

    // Build dynamic update query
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [col, val] of Object.entries(allowedUpdates)) {
      setClauses.push(`${col} = $${idx}`);
      values.push(val);
      idx++;
    }

    setClauses.push(`updated_at = NOW()`);
    const targetUid = req.user.supabase_uid || userId.toString();
    values.push(targetUid);
    const whereIdx = idx;

    const query = `
      UPDATE public.profiles 
      SET ${setClauses.join(', ')}
      WHERE id::text = $${whereIdx}
      RETURNING id, email, full_name, phone, dob, role, account_status, is_verified, avatar_url, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      // If profile row didn't exist in public.profiles, update users table
      const fallbackClauses = [];
      const fallbackValues = [];
      let fIdx = 1;

      if (allowedUpdates.full_name !== undefined) {
        fallbackClauses.push(`full_name = $${fIdx}`);
        fallbackValues.push(allowedUpdates.full_name);
        fIdx++;
      }
      if (allowedUpdates.phone !== undefined) {
        fallbackClauses.push(`phone = $${fIdx}`);
        fallbackValues.push(allowedUpdates.phone);
        fIdx++;
      }

      fallbackClauses.push(`updated_at = NOW()`);
      fallbackValues.push(userId);

      const fbResult = await pool.query(
        `UPDATE users SET ${fallbackClauses.join(', ')} WHERE id = $${fIdx} RETURNING id, email, full_name, phone, role, account_status, updated_at`,
        fallbackValues
      );

      return res.json({
        success: true,
        message: 'Profile updated successfully.',
        profile: fbResult.rows[0]
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      profile: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
};
