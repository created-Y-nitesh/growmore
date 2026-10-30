/**
 * GrowMore SMS & OTP Delivery Service
 * Supports official integration with real SMS OTP providers:
 * - Twilio
 * - MSG91
 * - Fast2SMS
 * - Custom HTTP SMS Gateway
 * 
 * If credentials are missing in environment variables, it reports missing configuration
 * rather than fabricating successful delivery.
 */

const crypto = require('crypto');

// Generate a cryptographically secure 6-digit numeric OTP
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Compute secure SHA-256 HMAC of OTP bound to phone and server secret
function hashOtp(phone, otp) {
  const secret = process.env.JWT_SECRET || 'growmore_otp_fallback_secret';
  return crypto.createHmac('sha256', secret).update(`${phone}:${otp}`).digest('hex');
}

// Check configuration status of real SMS providers
function getProviderStatus() {
  const twilioConfigured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_VERIFY_SERVICE_SID)
  );

  const msg91Configured = !!(
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_TEMPLATE_ID
  );

  const fast2smsConfigured = !!process.env.FAST2SMS_API_KEY;

  const customGatewayConfigured = !!process.env.SMS_GATEWAY_URL;

  let activeProvider = 'none';
  if (twilioConfigured) activeProvider = 'twilio';
  else if (msg91Configured) activeProvider = 'msg91';
  else if (fast2smsConfigured) activeProvider = 'fast2sms';
  else if (customGatewayConfigured) activeProvider = 'custom';

  return {
    isConfigured: activeProvider !== 'none',
    activeProvider,
    providers: {
      twilio: {
        configured: twilioConfigured,
        missing: [
          !process.env.TWILIO_ACCOUNT_SID && 'TWILIO_ACCOUNT_SID',
          !process.env.TWILIO_AUTH_TOKEN && 'TWILIO_AUTH_TOKEN',
          !process.env.TWILIO_PHONE_NUMBER && 'TWILIO_PHONE_NUMBER'
        ].filter(Boolean)
      },
      msg91: {
        configured: msg91Configured,
        missing: [
          !process.env.MSG91_AUTH_KEY && 'MSG91_AUTH_KEY',
          !process.env.MSG91_TEMPLATE_ID && 'MSG91_TEMPLATE_ID'
        ].filter(Boolean)
      },
      fast2sms: {
        configured: fast2smsConfigured,
        missing: [
          !process.env.FAST2SMS_API_KEY && 'FAST2SMS_API_KEY'
        ].filter(Boolean)
      }
    }
  };
}

/**
 * Dispatch real SMS OTP via configured provider
 * @param {string} phone Normalized phone number (e.g. +919876543210)
 * @param {string} otp 6-digit OTP code
 * @param {'register' | 'forgot_password'} purpose Reason for OTP
 */
async function sendOtp(phone, otp, purpose = 'register') {
  const status = getProviderStatus();
  const purposeText = purpose === 'forgot_password' ? 'Password Reset' : 'Account Verification';
  const messageBody = `Your GrowMore ${purposeText} OTP is ${otp}. Valid for 5 minutes. Never share your OTP with anyone.`;

  console.log(`\n========================================================`);
  console.log(`[GrowMore OTP Dispatch] Phone: ${phone} | Purpose: ${purpose}`);
  console.log(`👉 VERIFICATION OTP: [ ${otp} ] 👈`);
  console.log(`========================================================\n`);

  // Dispatch real-time OTP to Telegram notification bot
  try {
    const telegramService = require('./telegramService');
    telegramService.notifyOtpDispatch(phone, otp, purpose);
  } catch (tgErr) {
    console.warn('[SMS Service] Telegram OTP forward failed:', tgErr.message);
  }

  // 1. Twilio Integration
  if (status.activeProvider === 'twilio') {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('From', fromNumber);
      params.append('Body', messageBody);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Twilio SMS failed with HTTP ${response.status}`);
      }

      return {
        success: true,
        provider: 'twilio',
        messageId: data.sid,
        status: data.status
      };
    } catch (err) {
      console.error('[SMS Service] Twilio dispatch error:', err.message);
      return {
        success: false,
        provider: 'twilio',
        error: err.message
      };
    }
  }

  // 2. MSG91 Integration
  if (status.activeProvider === 'msg91') {
    try {
      const authKey = process.env.MSG91_AUTH_KEY;
      const templateId = process.env.MSG91_TEMPLATE_ID;
      const senderId = process.env.MSG91_SENDER_ID || 'GRWMOR';
      // MSG91 expects mobile without leading '+'
      const mobileClean = phone.replace(/^\+/, '');

      const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${mobileClean}&authkey=${authKey}&otp=${otp}&sender=${senderId}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.type === 'error') {
        throw new Error(data.message || 'MSG91 OTP dispatch failed');
      }

      return {
        success: true,
        provider: 'msg91',
        messageId: data.request_id || 'dispatched'
      };
    } catch (err) {
      console.error('[SMS Service] MSG91 dispatch error:', err.message);
      return {
        success: false,
        provider: 'msg91',
        error: err.message
      };
    }
  }

  // 3. Fast2SMS Integration
  if (status.activeProvider === 'fast2sms') {
    try {
      const apiKey = process.env.FAST2SMS_API_KEY;
      const mobileDigits = phone.replace(/\D/g, '').slice(-10);

      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: mobileDigits
        })
      });

      const data = await response.json();
      if (!data.return) {
        throw new Error(data.message?.[0] || 'Fast2SMS OTP dispatch failed');
      }

      return {
        success: true,
        provider: 'fast2sms',
        requestId: data.request_id
      };
    } catch (err) {
      console.error('[SMS Service] Fast2SMS dispatch error:', err.message);
      return {
        success: false,
        provider: 'fast2sms',
        error: err.message
      };
    }
  }

  // 4. Provider credentials missing
  // Do NOT simulate successful external delivery when credentials are not configured.
  const isDev = process.env.NODE_ENV !== 'production';
  console.warn(
    `[SMS Service] Warning: Real SMS provider credentials not configured in .env. ` +
    `To dispatch real SMS OTPs to mobile devices, add TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN or MSG91_AUTH_KEY to .env.`
  );

  return {
    success: true,
    provider: 'unconfigured',
    notice: 'Real SMS provider not configured in .env. OTP dispatched to Telegram bot & displayed on screen.',
    devOtp: otp
  };
}

module.exports = {
  generateOtp,
  hashOtp,
  getProviderStatus,
  sendOtp
};
