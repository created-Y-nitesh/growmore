const payoutService = require('../services/payoutService');
const pool = require('../db');

/**
 * POST /api/admin/withdrawals/:id/process-payout
 * Transitions APPROVED withdrawal to PROCESSING and dispatches to payout provider
 */
exports.processPayout = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { idempotencyKey } = req.body;

    const result = await payoutService.processPayout(
      parseInt(id, 10),
      req.user,
      idempotencyKey
    );

    return res.status(200).json({
      success: true,
      message: 'Withdrawal payout initiated and placed in PROCESSING state.',
      payout: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/withdrawals/payouts/:ref/success
 * Manually or programmatically confirm payout settlement
 */
exports.confirmPayoutSuccess = async (req, res, next) => {
  try {
    const { ref } = req.params;
    const { bankReference } = req.body;

    const result = await payoutService.finalizePayoutSuccess(ref, bankReference, req.user);
    return res.status(200).json({
      success: true,
      message: 'Payout marked SUCCESS and ledger hold settled.',
      result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/withdrawals/payouts/:ref/fail
 * Manually or programmatically fail payout and release reserved funds
 */
exports.confirmPayoutFailure = async (req, res, next) => {
  try {
    const { ref } = req.params;
    const { reason } = req.body;

    const result = await payoutService.finalizePayoutFailure(
      ref,
      reason || 'Bank payout rejected',
      req.user
    );
    return res.status(200).json({
      success: true,
      message: 'Payout marked FAILED and funds released back to user.',
      result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/payout-webhook
 * Public webhook endpoint from payment/payout provider
 */
exports.handlePayoutWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-payout-signature'] || req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

    const result = await payoutService.handlePayoutWebhook(rawBody, signature, req.body);
    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/payouts
 * List all payout transactions with pagination & filters
 */
exports.getPayoutTransactions = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT COUNT(*) FROM payout_transactions');
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(`
      SELECT pt.*, w.user_id, u.email, u.full_name
      FROM payout_transactions pt
      JOIN withdrawals w ON w.id = pt.withdrawal_id
      JOIN users u ON u.id = w.user_id
      ORDER BY pt.id DESC
      LIMIT $1 OFFSET $2;
    `, [limit, offset]);

    return res.json({
      success: true,
      payouts: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};
