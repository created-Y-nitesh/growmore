const pool = require('../db');
const telegram = require('../services/telegramService');

// POST /api/deposits - Create a pending deposit request
const createDeposit = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { amount, paymentProvider, providerReference, idempotencyKey } = req.body;

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum deposit request amount is ₹100.'
      });
    }

    if (parsedAmount > 5000000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum single deposit request amount is ₹50,00,000. For institutional allocations, contact support.'
      });
    }

    const provider = (typeof paymentProvider === 'string' && paymentProvider.trim())
      ? paymentProvider.trim()
      : 'UPI Instant Gateway';

    // Idempotency check
    if (idempotencyKey) {
      const existing = await pool.query(
        'SELECT * FROM deposits WHERE idempotency_key = $1 AND user_id = $2;',
        [idempotencyKey, userId]
      );
      if (existing.rows.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'Deposit request already exists (idempotent response).',
          deposit: existing.rows[0]
        });
      }
    }

    // Generate unique provider reference if not supplied
    const reference = (typeof providerReference === 'string' && providerReference.trim())
      ? providerReference.trim()
      : `DEP-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Check if reference already recorded
    const refCheck = await pool.query(
      'SELECT id FROM deposits WHERE provider_reference = $1;',
      [reference]
    );
    if (refCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A deposit with this transaction reference has already been submitted.'
      });
    }

    // Insert deposit with PENDING status. Wallet ledger is ONLY credited upon real UroPay payment verification.
    const client = await pool.connect();
    let deposit;
    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO deposits 
          (user_id, payment_provider, provider_reference, amount, currency, status, idempotency_key, metadata)
        VALUES 
          ($1, $2, $3, $4, 'INR', 'PENDING', $5, $6)
        RETURNING *;
      `;

      const result = await client.query(insertQuery, [
        userId,
        provider,
        reference,
        parsedAmount,
        idempotencyKey || null,
        JSON.stringify({
          initiatedAt: new Date().toISOString(),
          paymentChannel: provider,
          clearanceType: 'AWAITING_VERIFICATION',
          complianceNotice: 'Wallet will only be credited once real payment is verified via UroPay.'
        })
      ]);

      deposit = result.rows[0];

      // Note: wallet_ledger is NOT credited here. Real money credit requires UroPay verification.
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Fetch user info for Telegram notification
    try {
      const userRes = await pool.query('SELECT full_name, email FROM users WHERE id = $1', [userId]);
      const user = userRes.rows[0] || {};
      telegram.notifyNewDeposit({
        userName: user.full_name || 'Unknown',
        userEmail: user.email || userId,
        amount: parsedAmount,
        reference,
        depositId: Number(deposit.id)
      }).catch(() => {});
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Deposit request for ₹${parsedAmount.toLocaleString('en-IN')} submitted. Funds will be credited after real payment verification.`,
      deposit: {
        id: Number(deposit.id),
        amount: parseFloat(deposit.amount),
        currency: deposit.currency,
        paymentProvider: deposit.payment_provider,
        providerReference: deposit.provider_reference,
        status: deposit.status,
        createdAt: deposit.created_at
      }
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/deposits/my - List user's deposit requests
const getMyDeposits = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT id, payment_provider, provider_reference, amount, currency, status, created_at, verified_at
      FROM deposits
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, [userId]);

    const deposits = result.rows.map(row => ({
      id: Number(row.id),
      paymentProvider: row.payment_provider,
      providerReference: row.provider_reference,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: row.created_at,
      verifiedAt: row.verified_at
    }));

    return res.status(200).json({
      success: true,
      count: deposits.length,
      deposits
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/deposits/:id - Get one deposit request with ownership check
const getDepositById = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const depositId = parseInt(req.params.id, 10);

    if (isNaN(depositId) || depositId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deposit ID'
      });
    }

    const query = `
      SELECT d.*, u.full_name AS user_name, u.email AS user_email
      FROM deposits d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1;
    `;

    const result = await pool.query(query, [depositId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Deposit request not found.'
      });
    }

    const row = result.rows[0];

    // Authorization check
    if (Number(row.user_id) !== Number(userId) && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this deposit.'
      });
    }

    return res.status(200).json({
      success: true,
      deposit: {
        id: Number(row.id),
        userId: Number(row.user_id),
        userName: row.user_name,
        userEmail: row.user_email,
        paymentProvider: row.payment_provider,
        providerReference: row.provider_reference,
        amount: parseFloat(row.amount),
        currency: row.currency,
        status: row.status,
        metadata: row.metadata,
        createdAt: row.created_at,
        verifiedAt: row.verified_at
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDeposit,
  getMyDeposits,
  getDepositById
};
