const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const supabaseService = require('../services/supabaseService');

const BCRYPT_SALT_ROUNDS = 12;

// Generate signed JWT token
const generateAuthToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is missing from server environment configuration');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      tokenVersion: user.token_version || 1
    },
    secret,
    { expiresIn }
  );
};

// Generate unique referral code
function generateReferralCode(name) {
  const prefix = (name || 'GM').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'GM';
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GM-${prefix}${rand}`;
}

// POST /api/auth/register
const register = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { fullName, email, password, phone, dob, referralCode } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.'
      });
    }

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required (minimum 2 characters).'
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user with this email already exists
    let existingUnverifiedUser = null;
    const existingEmailCheck = await client.query(
      'SELECT id, is_phone_verified, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;',
      [cleanEmail]
    );

    if (existingEmailCheck.rows.length > 0) {
      const existingEmail = existingEmailCheck.rows[0];
      if (existingEmail.is_phone_verified) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists. Please log in.'
        });
      }
      existingUnverifiedUser = existingEmail;
    }

    // Hash the password with bcrypt (minimum 12 rounds)
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate referral code
    const myReferralCode = generateReferralCode(fullName);

    // Insert or update unverified user
    let newUser;
    if (existingUnverifiedUser) {
      const updateResult = await client.query(`
        UPDATE users
        SET full_name = $1, email = $2, phone = $3, dob = $4, password_hash = $5, referral_code = $6, referred_by = $7, updated_at = NOW()
        WHERE id = $8
        RETURNING id, full_name, email, phone, dob, role, account_status, is_phone_verified, referral_code, created_at, token_version;
      `, [
        fullName.trim(),
        cleanEmail,
        phone || null,
        dob || null,
        passwordHash,
        myReferralCode,
        referralCode ? referralCode.trim() : null,
        existingUnverifiedUser.id
      ]);
      newUser = updateResult.rows[0];
    } else {
      const insertQuery = `
        INSERT INTO users (full_name, email, phone, dob, password_hash, role, account_status, is_phone_verified, referral_code, referred_by)
        VALUES ($1, $2, $3, $4, $5, 'user', 'active', FALSE, $6, $7)
        RETURNING id, full_name, email, phone, dob, role, account_status, is_phone_verified, referral_code, created_at, token_version;
      `;
      const insertResult = await client.query(insertQuery, [
        fullName.trim(),
        cleanEmail,
        phone || null,
        dob || null,
        passwordHash,
        myReferralCode,
        referralCode ? referralCode.trim() : null
      ]);
      newUser = insertResult.rows[0];
    }

    // Generate 6-digit Email OTP
    const otp = emailService.generateOtp();
    const otpHash = emailService.hashOtp(cleanEmail, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    // Invalidate any older unused registration OTPs for this email
    await client.query(
      "UPDATE otp_verifications SET is_used = TRUE WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = 'register' AND is_used = FALSE;",
      [cleanEmail]
    );

    // Save OTP record
    await client.query(
      `INSERT INTO otp_verifications (phone, email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, $3, 'register', $4);`,
      [cleanEmail, cleanEmail, otpHash, expiresAt]
    );

    // Dispatch Email OTP
    const emailDispatchResult = await emailService.sendOtp(cleanEmail, otp, 'register');

    // Generate JWT token
    const token = generateAuthToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created. Verification code dispatched to your email address.',
      requiresOtp: true,
      email: cleanEmail,
      token,
      user: {
        id: Number(newUser.id),
        fullName: newUser.full_name,
        email: newUser.email,
        phone: newUser.phone,
        dob: newUser.dob,
        role: newUser.role,
        accountStatus: newUser.account_status,
        isPhoneVerified: newUser.is_phone_verified,
        referralCode: newUser.referral_code,
        createdAt: newUser.created_at
      },
      notice: emailDispatchResult?.notice,
      devOtp: emailDispatchResult?.devOtp
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/verify-otp
const verifyOtp = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { email, phone, identifier, otp, purpose } = req.body;
    const target = (email || identifier || phone || '').toLowerCase().trim();

    if (!target) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: '6-digit verification code is required.'
      });
    }

    // Look up latest active OTP record for this target & purpose
    const otpQuery = `
      SELECT id, otp_hash, attempts, max_attempts, expires_at, is_used
      FROM otp_verifications
      WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = $2 AND is_used = FALSE
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const result = await client.query(otpQuery, [target, purpose || 'register']);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active OTP request found for this email address. Please request a new code.'
      });
    }

    const record = result.rows[0];

    // Check expiration (5 minutes)
    if (new Date() > new Date(record.expires_at)) {
      await client.query('UPDATE otp_verifications SET is_used = TRUE WHERE id = $1;', [record.id]);
      return res.status(400).json({
        success: false,
        message: 'This OTP has expired. Please request a new verification code.'
      });
    }

    // Check maximum attempts (max 5)
    if (record.attempts >= record.max_attempts) {
      await client.query('UPDATE otp_verifications SET is_used = TRUE WHERE id = $1;', [record.id]);
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. This OTP has been invalidated for security. Please request a new one.'
      });
    }

    // Verify OTP using constant-time hash comparison
    const expectedHash = emailService.hashOtp(target, otp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(record.otp_hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );

    if (!isValid) {
      await client.query(
        'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1;',
        [record.id]
      );
      const remainingAttempts = record.max_attempts - (record.attempts + 1);
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : 'Please request a new code.'}`
      });
    }

    // Mark OTP used
    await client.query('UPDATE otp_verifications SET is_used = TRUE WHERE id = $1;', [record.id]);

    if (purpose === 'register') {
      // Mark user as verified
      const updateResult = await client.query(
        `UPDATE users
         SET is_phone_verified = TRUE, updated_at = NOW()
         WHERE LOWER(email) = $1 OR phone = $1
         RETURNING id, full_name, email, phone, dob, role, account_status, is_phone_verified, referral_code, created_at, token_version, supabase_uid;`,
        [target]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Associated user account not found.'
        });
      }

      const verifiedUser = updateResult.rows[0];

      // Synchronize with Supabase Auth
      let supabaseUid = verifiedUser.supabase_uid;
      if (!supabaseUid && supabaseService.isConfigured() && supabaseService.client) {
        try {
          const { data: listData } = await supabaseService.client.auth.admin.listUsers();
          const match = listData?.users?.find(u => u.email?.toLowerCase() === verifiedUser.email.toLowerCase());
          if (match) {
            supabaseUid = match.id;
          } else {
            const { data: createdUser, error: createErr } = await supabaseService.client.auth.admin.createUser({
              email: verifiedUser.email,
              email_confirm: true,
              user_metadata: {
                full_name: verifiedUser.full_name,
                dob: verifiedUser.dob
              }
            });
            if (!createErr && createdUser?.user) {
              supabaseUid = createdUser.user.id;
            }
          }
          if (supabaseUid) {
            await client.query('UPDATE users SET supabase_uid = $1 WHERE id = $2;', [supabaseUid, verifiedUser.id]);
          }
        } catch (supaErr) {
          console.warn('[Supabase Sync Warning]:', supaErr.message);
        }
      }

      const token = generateAuthToken(verifiedUser);

      return res.status(200).json({
        success: true,
        message: 'Email verified successfully. Welcome to GrowMore!',
        token,
        user: {
          id: Number(verifiedUser.id),
          fullName: verifiedUser.full_name,
          email: verifiedUser.email,
          phone: verifiedUser.phone,
          dob: verifiedUser.dob,
          role: verifiedUser.role,
          accountStatus: verifiedUser.account_status,
          isPhoneVerified: verifiedUser.is_phone_verified,
          referralCode: verifiedUser.referral_code,
          createdAt: verifiedUser.created_at
        }
      });
    }

    if (purpose === 'forgot_password') {
      const resetToken = jwt.sign(
        { email: target, purpose: 'password_reset' },
        process.env.JWT_SECRET || 'gm_secret',
        { expiresIn: '10m' }
      );

      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully. You may now enter your new password.',
        resetToken
      });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully.'
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/resend-otp
const resendOtp = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { phone, identifier, email, purpose } = req.body;
    let target = (email || identifier || phone || '').toLowerCase().trim();

    if (!target) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    // Cooldown check: enforce 60 seconds between OTP requests
    const cooldownQuery = `
      SELECT created_at FROM otp_verifications
      WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = $2 AND created_at > NOW() - INTERVAL '60 seconds'
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const cooldownCheck = await client.query(cooldownQuery, [target, purpose || 'register']);

    if (cooldownCheck.rows.length > 0) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 60 seconds before requesting another verification code.'
      });
    }

    // Invalidate old OTPs for this target & purpose
    await client.query(
      'UPDATE otp_verifications SET is_used = TRUE WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = $2 AND is_used = FALSE;',
      [target, purpose || 'register']
    );

    // Generate new OTP
    const otp = emailService.generateOtp();
    const otpHash = emailService.hashOtp(target, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await client.query(
      `INSERT INTO otp_verifications (phone, email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5);`,
      [target, target, otpHash, purpose || 'register', expiresAt]
    );

    const emailResult = await emailService.sendOtp(target, otp, purpose || 'register');

    return res.status(200).json({
      success: true,
      message: 'A new verification code has been dispatched to your email.',
      target,
      notice: emailResult?.notice,
      devOtp: emailResult?.devOtp
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, phone, identifier, password, rememberMe } = req.body;
    const loginTarget = (email || identifier || phone || '').toLowerCase().trim();

    if (!loginTarget || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email address and password are required.'
      });
    }

    const query = `
      SELECT id, full_name, email, phone, dob, password_hash, role, account_status, is_phone_verified, referral_code, created_at, token_version, kyc_status
      FROM users
      WHERE LOWER(email) = $1 OR phone = $1
      LIMIT 1;
    `;
    const result = await pool.query(query, [loginTarget]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email address or password.'
      });
    }

    const user = result.rows[0];

    // Check account status
    if (user.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. Please contact GrowMore support.'
      });
    }

    // Verify password hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email address or password.'
      });
    }

    // Enforce email verification
    if (user.is_phone_verified === false) {
      return res.status(403).json({
        success: false,
        code: 'UNVERIFIED_ACCOUNT',
        requiresVerification: true,
        email: user.email,
        message: 'Your email address is not yet verified. Please complete OTP verification to access your account.'
      });
    }

    // Generate token
    const token = generateAuthToken(user);

    // Configure secure HttpOnly session cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    };
    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30-day persistent session
    }
    res.cookie('growmore_token', token, cookieOptions);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: Number(user.id),
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        dob: user.dob,
        role: user.role,
        accountStatus: user.account_status,
        isPhoneVerified: user.is_phone_verified,
        kycStatus: user.kyc_status || 'NOT_SUBMITTED',
        isKycVerified: user.kyc_status === 'APPROVED',
        referralCode: user.referral_code,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { phone, email, identifier } = req.body;
    const rawTarget = (email || identifier || phone || '').toLowerCase().trim();

    if (!rawTarget) {
      return res.status(400).json({
        success: false,
        message: 'Registered email address is required.'
      });
    }

    const userResult = await client.query(
      'SELECT id, phone, email FROM users WHERE LOWER(email) = $1 OR phone = $1 LIMIT 1;',
      [rawTarget]
    );

    if (userResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If this email is registered with GrowMore, a 6-digit recovery OTP has been dispatched.',
        target: rawTarget
      });
    }

    const user = userResult.rows[0];
    const targetEmail = (user.email || rawTarget).toLowerCase().trim();

    // Cooldown check (60s)
    const cooldownCheck = await client.query(
      `SELECT created_at FROM otp_verifications 
       WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = 'forgot_password' AND created_at > NOW() - INTERVAL '60 seconds'
       LIMIT 1;`,
      [targetEmail]
    );

    if (cooldownCheck.rows.length > 0) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 60 seconds before requesting another recovery code.'
      });
    }

    // Generate recovery OTP
    const otp = emailService.generateOtp();
    const otpHash = emailService.hashOtp(targetEmail, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Invalidate old recovery OTPs
    await client.query(
      "UPDATE otp_verifications SET is_used = TRUE WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = 'forgot_password' AND is_used = FALSE;",
      [targetEmail]
    );

    await client.query(
      `INSERT INTO otp_verifications (phone, email, otp_hash, purpose, expires_at)
       VALUES ($1, $2, $3, 'forgot_password', $4);`,
      [targetEmail, targetEmail, otpHash, expiresAt]
    );

    const emailResult = await emailService.sendOtp(targetEmail, otp, 'forgot_password');

    return res.status(200).json({
      success: true,
      message: 'If this email is registered with GrowMore, a 6-digit recovery OTP has been dispatched.',
      target: targetEmail,
      maskedTarget: targetEmail.includes('@') ? `${targetEmail.slice(0, 3)}***@${targetEmail.split('@')[1]}` : targetEmail,
      notice: emailResult?.notice,
      devOtp: emailResult?.devOtp
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { email, phone, identifier, otp, resetToken, newPassword } = req.body;
    let targetEmail = (email || identifier || phone || '').toLowerCase().trim();

    if (resetToken) {
      try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'gm_secret');
        if (decoded.email) {
          targetEmail = decoded.email.toLowerCase().trim();
        } else if (decoded.phone) {
          targetEmail = decoded.phone.toLowerCase().trim();
        }
      } catch (tokenErr) {
        return res.status(400).json({
          success: false,
          message: 'Password reset session has expired. Please verify OTP again.'
        });
      }
    } else {
      if (!otp || otp.length !== 6) {
        return res.status(400).json({
          success: false,
          message: 'Valid 6-digit verification code is required.'
        });
      }

      const otpRecordResult = await client.query(
        `SELECT id, otp_hash, attempts, max_attempts, expires_at
         FROM otp_verifications
         WHERE (LOWER(email) = $1 OR LOWER(phone) = $1) AND purpose = 'forgot_password' AND is_used = FALSE
         ORDER BY created_at DESC
         LIMIT 1;`,
        [targetEmail]
      );

      if (otpRecordResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No active recovery request found. Please request a new code.'
        });
      }

      const record = otpRecordResult.rows[0];

      if (new Date() > new Date(record.expires_at)) {
        return res.status(400).json({
          success: false,
          message: 'OTP has expired. Please request a new code.'
        });
      }

      const expectedHash = emailService.hashOtp(targetEmail, otp);
      const isValid = crypto.timingSafeEqual(
        Buffer.from(record.otp_hash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );

      if (!isValid) {
        await client.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1;', [record.id]);
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code.'
        });
      }

      await client.query('UPDATE otp_verifications SET is_used = TRUE WHERE id = $1;', [record.id]);
    }

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: 'Registered email address is required.'
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // Update password in PostgreSQL and bump token_version to invalidate prior sessions
    const updateResult = await client.query(
      `UPDATE users
       SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
       WHERE LOWER(email) = $2 OR phone = $2
       RETURNING id, full_name, email, phone, supabase_uid;`,
      [newPasswordHash, targetEmail]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Account not found for this identifier.'
      });
    }

    const updatedUser = updateResult.rows[0];

    // Also update in Supabase if linked
    if (updatedUser.supabase_uid && supabaseService.isConfigured() && supabaseService.client) {
      try {
        await supabaseService.client.auth.admin.updateUserById(updatedUser.supabase_uid, {
          password: newPassword
        });
      } catch (supaErr) {
        console.warn('[Supabase Password Update Warning]:', supaErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.'
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  res.clearCookie('growmore_token', { path: '/' });
  res.clearCookie('token', { path: '/' });
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
};

// GET /api/auth/me (Protected route)
const getMe = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT id, full_name, email, phone, dob, role, account_status, is_phone_verified, referral_code, kyc_status, created_at, token_version
      FROM users
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const user = result.rows[0];

    // Check if token version was bumped (session invalidated)
    if (req.user.tokenVersion && req.user.tokenVersion < user.token_version) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated due to password reset. Please log in again.'
      });
    }

    if (user.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active.'
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: Number(user.id),
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        dob: user.dob,
        role: user.role,
        accountStatus: user.account_status,
        isPhoneVerified: user.is_phone_verified,
        kycStatus: user.kyc_status || 'NOT_SUBMITTED',
        isKycVerified: user.kyc_status === 'APPROVED',
        referralCode: user.referral_code,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  logout,
  getMe
};
