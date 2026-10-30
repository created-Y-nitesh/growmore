/**
 * GrowMore Email & OTP Delivery Service
 * Uses Nodemailer for reliable email dispatch (Gmail, SMTP, SendGrid, etc.)
 * Dispatches to admin Telegram bot and logs to console.
 */

'use strict';

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const telegramService = require('./telegramService');

// Generate cryptographically secure 6-digit numeric OTP
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Compute secure SHA-256 HMAC of OTP bound to email and server secret
function hashOtp(target, otp) {
  const secret = process.env.JWT_SECRET || 'growmore_otp_fallback_secret';
  const cleanTarget = (target || '').toLowerCase().trim();
  return crypto.createHmac('sha256', secret).update(`${cleanTarget}:${otp}`).digest('hex');
}

// Get configured nodemailer transporter
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, GMAIL_USER, GMAIL_APP_PASS } = process.env;

  if (GMAIL_USER && GMAIL_APP_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASS
      }
    });
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  return null;
}

/**
 * Send an OTP verification email to user
 * @param {string} email
 * @param {string} otp
 * @param {'register'|'forgot_password'|'login'} purpose
 */
async function sendOtp(email, otp, purpose = 'register') {
  const cleanEmail = (email || '').toLowerCase().trim();

  // 1. Notify Telegram Bot for instant visibility
  try {
    await telegramService.notifyOtpDispatch(cleanEmail, otp, purpose);
  } catch (err) {
    console.warn('[Email Service] Telegram notification warning:', err.message);
  }

  // 2. Terminal log
  console.log('\n========================================================');
  console.log(`[GrowMore Email OTP Dispatch] Email: ${cleanEmail} | Purpose: ${purpose}`);
  console.log(`👉 EMAIL VERIFICATION OTP: [ ${otp} ] 👈`);
  console.log('========================================================\n');

  // 3. Attempt real email dispatch if SMTP / Gmail is configured
  const transporter = getTransporter();
  let emailDispatched = false;
  let emailError = null;

  if (transporter) {
    try {
      const fromAddress = process.env.SMTP_FROM || process.env.GMAIL_USER || 'no-reply@growmore.investments';
      const subject = purpose === 'forgot_password'
        ? 'GrowMore - Password Reset Verification Code'
        : 'GrowMore - Email Verification Code';

      const actionText = purpose === 'forgot_password'
        ? 'reset your account password'
        : 'complete your account registration';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; margin: 0; padding: 24px; color: #f3f4f6; }
            .card { max-width: 500px; margin: 0 auto; background: #131b2e; border: 1px solid #1f293d; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .logo { font-size: 24px; font-weight: 800; color: #6366f1; text-align: center; margin-bottom: 24px; letter-spacing: -0.5px; }
            .logo span { color: #38bdf8; }
            .title { font-size: 20px; font-weight: 700; color: #ffffff; text-align: center; margin-bottom: 8px; }
            .subtitle { font-size: 14px; color: #94a3b8; text-align: center; margin-bottom: 28px; line-height: 1.5; }
            .otp-box { background: #0b0f19; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
            .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace; }
            .expiry { font-size: 13px; color: #f59e0b; margin-top: 10px; font-weight: 500; }
            .warning { font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px; border-top: 1px solid #1f293d; padding-top: 20px; }
            .footer { font-size: 12px; color: #475569; text-align: center; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">Grow<span>More</span></div>
            <div class="title">Email Verification Code</div>
            <div class="subtitle">Use the verification code below to ${actionText}. This code is strictly personal.</div>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <div class="expiry">⏱ Valid for 5 minutes</div>
            </div>
            <div class="warning">
              <strong>Security Alert:</strong> If you did not initiate this request, please disregard this email. Never disclose this code to anyone. GrowMore personnel will never contact you asking for your verification code.
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} GrowMore Wealth Management. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `;

      await transporter.sendMail({
        from: `"GrowMore Security" <${fromAddress}>`,
        to: cleanEmail,
        subject,
        text: `Your GrowMore verification code is ${otp}. Valid for 5 minutes. Never share this code with anyone.`,
        html: htmlContent
      });

      emailDispatched = true;
      console.log(`[Email Service] Live email successfully dispatched to ${cleanEmail}`);
    } catch (err) {
      emailError = err.message;
      console.error('[Email Service] Nodemailer dispatch failed:', err.message);
    }
  } else {
    console.warn('[Email Service] Note: Real SMTP/Gmail not set in .env. To enable direct live email delivery, add GMAIL_USER and GMAIL_APP_PASS (or SMTP_HOST/SMTP_USER/SMTP_PASS) in backend/.env.');
  }

  return {
    success: true,
    email: cleanEmail,
    emailDispatched,
    emailError,
    devOtp: otp,
    notice: emailDispatched
      ? `Verification code dispatched to ${cleanEmail}.`
      : `Verification code generated. (Dispatched to Telegram & on-screen).`
  };
}

module.exports = {
  generateOtp,
  hashOtp,
  sendOtp
};
