const jwt = require('jsonwebtoken');
const pool = require('../db');
const supabaseService = require('../services/supabaseService');

/**
 * Resolves or bridges an external Supabase Auth user to an internal BIGINT PostgreSQL user record.
 */
async function resolveSupabaseUser(sbUid, sbEmail, sbPhone, sbName, sbRole = 'user') {
  // 1. Try finding an existing mapped user by supabase_uid or email
  const findQuery = `
    SELECT id, email, phone, role, account_status, is_phone_verified, supabase_uid, token_version
    FROM users
    WHERE supabase_uid = $1::uuid 
       OR (LOWER(email) = LOWER($2) AND email IS NOT NULL AND email <> '')
    ORDER BY (supabase_uid = $1::uuid) DESC, id ASC
    LIMIT 1;
  `;
  const existing = await pool.query(findQuery, [sbUid, sbEmail || '']);

  if (existing.rows.length > 0) {
    const user = existing.rows[0];

    // If supabase_uid is not yet set on this user record, bridge it now
    if (!user.supabase_uid) {
      await pool.query('UPDATE users SET supabase_uid = $1::uuid, updated_at = NOW() WHERE id = $2;', [sbUid, user.id]);
    }

    return user;
  }

  // 2. Auto-provision internal ledger user record for newly registered Supabase user
  const insertQuery = `
    INSERT INTO users (full_name, email, phone, password_hash, role, account_status, is_phone_verified, supabase_uid)
    VALUES ($1, $2, $3, 'SUPABASE_MANAGED_AUTH', $4, 'active', TRUE, $5::uuid)
    ON CONFLICT (supabase_uid) DO UPDATE SET updated_at = NOW()
    RETURNING id, full_name, email, phone, role, account_status, is_phone_verified, supabase_uid, token_version;
  `;
  const insertRes = await pool.query(insertQuery, [
    sbName || 'Supabase User',
    sbEmail || null,
    sbPhone || null,
    sbRole || 'user',
    sbUid
  ]);

  return insertRes.rows[0];
}

// Verify Bearer JWT Token or HttpOnly Cookie (supports native JWT & Supabase Auth)
const authenticateToken = async (req, res, next) => {
  let token = null;
  const authHeader = req.headers['authorization'];

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    } else {
      return res.status(401).json({
        success: false,
        message: 'Malformed authorization header. Expected format: Bearer <token>'
      });
    }
  } else if (req.cookies && (req.cookies.growmore_token || req.cookies.token)) {
    token = req.cookies.growmore_token || req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authorization token required'
    });
  }

  // 1. Try local JWT_SECRET (native session)
  const localSecret = process.env.JWT_SECRET;
  if (localSecret) {
    try {
      const decoded = jwt.verify(token, localSecret);
      const rawId = decoded.userId || decoded.id || decoded.sub;

      // Case A: numeric integer id (native users.id)
      if (rawId && !isNaN(Number(rawId)) && typeof rawId !== 'boolean') {
        const userRes = await pool.query(
          'SELECT id, email, phone, role, account_status, is_phone_verified, token_version FROM users WHERE id = $1 LIMIT 1;',
          [Number(rawId)]
        );

        if (userRes.rows.length === 0) {
          return res.status(401).json({
            success: false,
            message: 'User account not found.'
          });
        }

        const dbUser = userRes.rows[0];

        // 1. Enforce account_status === 'active' on every authenticated request
        const accountStatus = (dbUser.account_status || '').toLowerCase();
        if (accountStatus !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Your account is suspended or inactive. Please contact support.'
          });
        }

        // 2. Validate token_version to immediately invalidate revoked sessions
        const tokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : decoded.token_version;
        if (tokenVersion !== undefined && Number(tokenVersion) !== Number(dbUser.token_version)) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }
        if (tokenVersion === undefined && Number(dbUser.token_version) > 1) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }

        req.user = {
          ...decoded,
          id: Number(dbUser.id),
          userId: Number(dbUser.id),
          email: dbUser.email,
          phone: dbUser.phone,
          role: dbUser.role,
          accountStatus: dbUser.account_status,
          isPhoneVerified: dbUser.is_phone_verified
        };
        return next();
      }

      // Case B: UUID string id (Supabase UUID mapped to internal user)
      if (rawId && typeof rawId === 'string' && rawId.length > 20) {
        const dbUser = await resolveSupabaseUser(
          rawId,
          decoded.email,
          decoded.phone,
          decoded.user_metadata?.full_name || decoded.user_metadata?.name || decoded.fullName,
          decoded.user_metadata?.role || decoded.role || 'user'
        );

        // 1. Enforce account_status === 'active'
        const accountStatus = (dbUser.account_status || '').toLowerCase();
        if (accountStatus !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Your account is suspended or inactive. Please contact support.'
          });
        }

        // 2. Validate token_version
        const tokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : decoded.token_version;
        if (tokenVersion !== undefined && Number(tokenVersion) !== Number(dbUser.token_version)) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }
        if (tokenVersion === undefined && Number(dbUser.token_version) > 1) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }

        req.user = {
          ...decoded,
          id: Number(dbUser.id),
          userId: Number(dbUser.id),
          supabase_uid: rawId,
          email: dbUser.email,
          phone: dbUser.phone,
          role: dbUser.role,
          accountStatus: dbUser.account_status,
          isPhoneVerified: dbUser.is_phone_verified
        };
        return next();
      }
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.'
        });
      }
      // If not expired, could be a Supabase token; fall through to Supabase check
    }
  }

  // 2. Try Supabase JWT Secret if configured
  const supabaseSecret = process.env.SUPABASE_JWT_SECRET;
  if (supabaseSecret) {
    try {
      const decoded = jwt.verify(token, supabaseSecret);
      const sbUid = decoded.sub || decoded.userId || decoded.id;
      if (sbUid) {
        const dbUser = await resolveSupabaseUser(
          sbUid,
          decoded.email,
          decoded.phone,
          decoded.user_metadata?.full_name || decoded.user_metadata?.name,
          decoded.user_metadata?.role || decoded.role || 'user'
        );

        // 1. Enforce account_status === 'active'
        const accountStatus = (dbUser.account_status || '').toLowerCase();
        if (accountStatus !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Your account is suspended or inactive. Please contact support.'
          });
        }

        // 2. Validate token_version
        const tokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : decoded.token_version;
        if (tokenVersion !== undefined && Number(tokenVersion) !== Number(dbUser.token_version)) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }
        if (tokenVersion === undefined && Number(dbUser.token_version) > 1) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }

        req.user = {
          ...decoded,
          id: Number(dbUser.id),
          userId: Number(dbUser.id),
          supabase_uid: sbUid,
          email: dbUser.email,
          phone: dbUser.phone,
          role: dbUser.role,
          accountStatus: dbUser.account_status,
          isPhoneVerified: dbUser.is_phone_verified
        };
        return next();
      }
    } catch (sbErr) {
      if (sbErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.'
        });
      }
    }
  }

  // 3. Try Supabase SDK verification if client is configured
  if (supabaseService.isConfigured()) {
    try {
      const sbUser = await supabaseService.verifyUserToken(token);
      if (sbUser && sbUser.id) {
        const dbUser = await resolveSupabaseUser(
          sbUser.id,
          sbUser.email,
          sbUser.phone,
          sbUser.user_metadata?.full_name || sbUser.user_metadata?.name,
          sbUser.user_metadata?.role || 'user'
        );

        // 1. Enforce account_status === 'active'
        const accountStatus = (dbUser.account_status || '').toLowerCase();
        if (accountStatus !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Your account is suspended or inactive. Please contact support.'
          });
        }

        // 2. Validate token_version
        if (Number(dbUser.token_version) > 1) {
          return res.status(401).json({
            success: false,
            message: 'Session has been invalidated. Please log in again.'
          });
        }

        req.user = {
          id: Number(dbUser.id),
          userId: Number(dbUser.id),
          supabase_uid: sbUser.id,
          email: dbUser.email,
          phone: dbUser.phone,
          role: dbUser.role,
          accountStatus: dbUser.account_status,
          isPhoneVerified: dbUser.is_phone_verified,
          is_phone_verified: Boolean(sbUser.phone_confirmed_at),
          is_email_verified: Boolean(sbUser.email_confirmed_at)
        };
        return next();
      }
    } catch (verifyErr) {
      console.warn('[Auth Middleware] Supabase verification error:', verifyErr.message);
    }
  }

  return res.status(403).json({
    success: false,
    message: 'Invalid or revoked authentication token'
  });
};

// Role-Based Access Control (RBAC)
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: insufficient permissions'
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole,
  resolveSupabaseUser
};
