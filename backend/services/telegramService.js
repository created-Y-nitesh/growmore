// language: JavaScript, file: telegramService.js, runtime: Node.js 18+, target: Telegram Bot API
// Sends push notifications to admin Telegram chat on key financial events.
// Uses Node built-in https — no extra npm package required.

'use strict';

const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

/**
 * Post a message to Telegram via Bot API.
 * Silent if token or chat_id not configured — never crashes the main flow.
 */
function sendMessage(chatId, text) {
  return new Promise((resolve) => {
    if (!BOT_TOKEN || !chatId) {
      // Not configured — skip silently
      return resolve({ skipped: true });
    }

    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });

    req.on('error', (err) => {
      // Telegram failure must never interrupt financial operations
      console.warn('[Telegram] Notification failed silently:', err.message);
      resolve({ error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Notify admin — new deposit submitted by user
 */
async function notifyNewDeposit({ userName, userEmail, amount, reference, depositId }) {
  const text =
    `🟡 <b>New Deposit Request</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>User:</b> ${escHtml(userName)} (${escHtml(userEmail)})\n` +
    `💰 <b>Amount:</b> ₹${Number(amount).toLocaleString('en-IN')}\n` +
    `🔖 <b>Ref:</b> <code>${escHtml(reference)}</code>\n` +
    `🆔 <b>Deposit ID:</b> #${depositId}\n` +
    `⏱ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👉 Go to Admin Panel → Deposits to verify.`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

/**
 * Notify admin — new withdrawal request submitted
 */
async function notifyNewWithdrawal({ userName, userEmail, amount, payoutMethod, withdrawalId }) {
  const text =
    `🔴 <b>New Withdrawal Request</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>User:</b> ${escHtml(userName)} (${escHtml(userEmail)})\n` +
    `💸 <b>Amount:</b> ₹${Number(amount).toLocaleString('en-IN')}\n` +
    `🏦 <b>Method:</b> ${escHtml(payoutMethod)}\n` +
    `🆔 <b>Withdrawal ID:</b> #${withdrawalId}\n` +
    `⏱ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👉 Go to Admin Panel → Withdrawals to approve.`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

/**
 * Notify admin — deposit manually verified and wallet credited
 */
async function notifyDepositVerified({ depositId, amount, userEmail, verifiedBy, bankTxRef }) {
  const text =
    `✅ <b>Deposit Verified</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Deposit ID:</b> #${depositId}\n` +
    `💰 <b>Amount:</b> ₹${Number(amount).toLocaleString('en-IN')} credited\n` +
    `👤 <b>User:</b> ${escHtml(userEmail)}\n` +
    `🏦 <b>Bank Ref:</b> <code>${escHtml(bankTxRef)}</code>\n` +
    `🛡 <b>Verified by:</b> ${escHtml(verifiedBy)}\n` +
    `⏱ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

/**
 * Notify admin — withdrawal approved
 */
async function notifyWithdrawalApproved({ withdrawalId, amount, userEmail }) {
  const text =
    `✅ <b>Withdrawal Approved</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Withdrawal ID:</b> #${withdrawalId}\n` +
    `💸 <b>Amount:</b> ₹${Number(amount).toLocaleString('en-IN')}\n` +
    `👤 <b>User:</b> ${escHtml(userEmail)}\n` +
    `⏱ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
    `👉 Now proceed to mark as PAID after bank transfer.`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

/**
 * Notify admin — withdrawal marked paid
 */
async function notifyWithdrawalPaid({ withdrawalId, amount, userEmail, payoutReference }) {
  const text =
    `💚 <b>Withdrawal PAID</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Withdrawal ID:</b> #${withdrawalId}\n` +
    `💸 <b>Amount:</b> ₹${Number(amount).toLocaleString('en-IN')}\n` +
    `👤 <b>User:</b> ${escHtml(userEmail)}\n` +
    `🏦 <b>Payout Ref:</b> <code>${escHtml(payoutReference)}</code>\n` +
    `⏱ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

/**
 * Notify admin — withdrawal rejected and funds released back
 */
async function notifyWithdrawalRejected({ withdrawalId, amount, userEmail, reason }) {
  const text =
    `❌ <b>Withdrawal Rejected</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🆔 <b>Withdrawal ID:</b> #${withdrawalId}\n` +
    `💸 <b>Amount:</b> ₹${Number(amount).toLocaleString('en-IN')} (funds released)\n` +
    `👤 <b>User:</b> ${escHtml(userEmail)}\n` +
    `📝 <b>Reason:</b> ${escHtml(reason || 'Not specified')}\n` +
    `⏱ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

/**
 * Notify admin — new customer support ticket
 */
async function notifyNewSupportTicket({ userName, userMobile, accountId, category, message, lockedDeposit, withdrawableReturns }) {
  const text =
    `💬 <b>New In-App Support Ticket</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Customer:</b> ${escHtml(userName)}\n` +
    `🆔 <b>Account ID:</b> <code>${escHtml(accountId)}</code>\n` +
    `📱 <b>Mobile:</b> ${escHtml(userMobile)}\n` +
    `🔒 <b>Locked Capital:</b> ₹${Number(lockedDeposit || 0).toLocaleString('en-IN')}\n` +
    `💰 <b>Withdrawable:</b> ₹${Number(withdrawableReturns || 0).toLocaleString('en-IN')}\n` +
    `📌 <b>Category:</b> ${escHtml(category)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📝 <b>Query:</b>\n${escHtml(message)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⏱ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

function notifyOtpDispatch(target, otp, purpose) {
  const isEmail = String(target || '').includes('@');
  const text =
    `🔑 <b>[GrowMore Verification OTP]</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${isEmail ? '📧 <b>Email:</b>' : '📱 <b>Mobile:</b>'} <code>${escHtml(target)}</code>\n` +
    `🔢 <b>OTP Code:</b> <code>${escHtml(otp)}</code>\n` +
    `🎯 <b>Purpose:</b> ${escHtml(purpose || 'Verification')}\n` +
    `⏱ <b>Valid:</b> 5 minutes\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕒 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  return sendMessage(ADMIN_CHAT_ID, text);
}

// Escape HTML special chars to prevent Telegram parse_mode injection
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  notifyNewDeposit,
  notifyNewWithdrawal,
  notifyDepositVerified,
  notifyWithdrawalApproved,
  notifyWithdrawalPaid,
  notifyWithdrawalRejected,
  notifyNewSupportTicket,
  notifyOtpDispatch,
  sendMessage
};
