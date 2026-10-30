const pool = require('../db');
const telegram = require('../services/telegramService');
const walletService = require('../services/walletService');

// POST /api/withdrawals - Submit a withdrawal request adhering strictly to plan rules
const createWithdrawal = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId;
    let { 
      amount, 
      sourceWallet = 'interest', // 'interest' | 'daily_earning' | 'principal'
      payoutMethod, 
      payoutDetails, 
      idempotencyKey 
    } = req.body;

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid positive withdrawal amount is required.'
      });
    }

    // RULE: Principal is NEVER withdrawable before 365 days maturity
    if (sourceWallet === 'principal') {
      return res.status(400).json({
        success: false,
        message: 'Principal capital is strictly locked for 365 days and cannot be withdrawn before maturity.'
      });
    }

    const method = (typeof payoutMethod === 'string' && payoutMethod.trim())
      ? payoutMethod.trim()
      : 'IMPS Bank Transfer';

    // Idempotency check
    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT * FROM withdrawals WHERE idempotency_key = $1 AND user_id = $2;',
        [idempotencyKey, userId]
      );
      if (existing.rows.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'Withdrawal request already registered (idempotent response).',
          withdrawal: existing.rows[0]
        });
      }
    }

    // Begin Transaction with Exclusive Row Lock
    await client.query('BEGIN');

    // 1. Lock user row to eliminate concurrent double-spending
    const userRes = await client.query(
      'SELECT id, account_status, full_name, email FROM users WHERE id = $1 FOR UPDATE;',
      [userId]
    );

    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const user = userRes.rows[0];

    if (user.account_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Account is restricted from initiating withdrawals.'
      });
    }

    // 2. Fetch current wallet breakdown and active plans
    const walletSummary = await walletService.getUserWalletSummary(userId);

    // Auto-detect source wallet if default or ambiguous
    if (!['interest', 'daily_earning'].includes(sourceWallet)) {
      if (walletSummary.interestBalance >= parsedAmount && parsedAmount >= 500) {
        sourceWallet = 'interest';
      } else if (walletSummary.dailyEarningBalance >= parsedAmount && parsedAmount >= (walletSummary.hasSuperPlan ? 3000 : 1000)) {
        sourceWallet = 'daily_earning';
      } else {
        sourceWallet = 'interest';
      }
    }

    let ledgerWalletType = 'INTEREST';
    let availableSourceBalance = 0;
    let minAllowedAmount = 500;
    let sourceLabel = 'Interest Wallet';

    // 3. Enforce Specific Plan & Wallet Thresholds
    if (sourceWallet === 'interest') {
      ledgerWalletType = 'INTEREST';
      sourceLabel = 'Interest Wallet (Monthly ROI)';
      minAllowedAmount = 500;
      availableSourceBalance = walletSummary.interestBalance;

      if (parsedAmount < minAllowedAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Minimum interest withdrawal amount is ₹${minAllowedAmount}. (Your interest balance: ₹${availableSourceBalance.toLocaleString('en-IN')})`
        });
      }

      if (availableSourceBalance < parsedAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient interest balance. You have ₹${availableSourceBalance.toLocaleString('en-IN')} available in Interest Wallet, but requested ₹${parsedAmount.toLocaleString('en-IN')}.`
        });
      }

    } else if (sourceWallet === 'daily_earning') {
      ledgerWalletType = 'DAILY_EARNING';
      sourceLabel = 'Daily Earnings Wallet';
      availableSourceBalance = walletSummary.dailyEarningBalance;

      if (!walletSummary.hasDailyPlan && !walletSummary.hasSuperPlan) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'You do not have an active Daily Earning Plan or Super Plan.'
        });
      }

      // Daily Plan: min ₹1,000 | Super Plan: min ₹3,000
      if (walletSummary.hasSuperPlan) {
        minAllowedAmount = 3000;
      } else {
        minAllowedAmount = 1000;
      }

      if (parsedAmount < minAllowedAmount) {
        await client.query('ROLLBACK');
        const planTierName = walletSummary.hasSuperPlan ? 'Daily Earning Super Plan' : 'Daily Earning Plan';
        return res.status(400).json({
          success: false,
          message: `${planTierName} requires minimum accumulated earnings of ₹${minAllowedAmount.toLocaleString('en-IN')} to withdraw. Current daily earnings: ₹${availableSourceBalance.toLocaleString('en-IN')}.`
        });
      }

      if (availableSourceBalance < parsedAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient daily earnings balance. You have ₹${availableSourceBalance.toLocaleString('en-IN')} available, but requested ₹${parsedAmount.toLocaleString('en-IN')}.`
        });
      }
    }

    // 4. Generate unique payout reference
    const payoutRef = `WDR-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const sanitizedDetails = {
      method,
      sourceWallet,
      sourceLabel,
      accountMasked: payoutDetails && payoutDetails.accountNumber ? `••••${payoutDetails.accountNumber.slice(-4)}` : 'Verified Account',
      ifsc: payoutDetails && payoutDetails.ifsc ? payoutDetails.ifsc.toUpperCase() : 'N/A',
      bankName: payoutDetails && payoutDetails.bankName ? payoutDetails.bankName : 'Registered Bank',
      upiId: payoutDetails && payoutDetails.upiId ? payoutDetails.upiId : undefined,
      beneficiaryName: user.email
    };

    // 5. Create withdrawal record
    const insertQuery = `
      INSERT INTO withdrawals 
        (user_id, amount, currency, payout_reference, payout_method, payout_details, status, idempotency_key)
      VALUES 
        ($1, $2, 'INR', $3, $4, $5, 'PENDING', $6)
      RETURNING *;
    `;

    const wdrRes = await client.query(insertQuery, [
      userId,
      parsedAmount,
      payoutRef,
      method,
      JSON.stringify(sanitizedDetails),
      idempotencyKey || null
    ]);

    const withdrawal = wdrRes.rows[0];

    // 6. Reserve funds immediately in ledger (WITHDRAWAL_HOLD) against designated wallet_type
    const newSourceBalance = parseFloat((availableSourceBalance - parsedAmount).toFixed(2));
    const ledgerTxnRef = `WDR-HOLD-${withdrawal.id}-${Date.now()}`;

    await client.query(`
      INSERT INTO wallet_ledger
        (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
      VALUES
        ($1, $2, 'WITHDRAWAL_HOLD', $3, $4, $5, 'INR', 'COMPLETED', $6, $7);
    `, [
      userId,
      ledgerTxnRef,
      ledgerWalletType,
      -parsedAmount,
      newSourceBalance,
      String(withdrawal.id),
      JSON.stringify({ 
        withdrawalId: withdrawal.id, 
        payoutReference: payoutRef, 
        sourceWallet, 
        reservedAmount: parsedAmount 
      })
    ]);

    await client.query('COMMIT');

    // Non-blocking Telegram admin notification
    try {
      telegram.notifyNewWithdrawal({
        userName: user.full_name || 'Investor',
        userEmail: user.email || String(userId),
        amount: parsedAmount,
        payoutMethod: `${method} (${sourceLabel})`,
        withdrawalId: Number(withdrawal.id)
      }).catch(() => {});
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Withdrawal request for ₹${parsedAmount.toLocaleString('en-IN')} submitted from ${sourceLabel}. Payout will be processed within 24 to 48 hours after manual verification.`,
      estimatedSettlement: '24-48 Hours',
      withdrawal: {
        id: Number(withdrawal.id),
        amount: parseFloat(withdrawal.amount),
        currency: withdrawal.currency,
        payoutReference: withdrawal.payout_reference,
        payoutMethod: withdrawal.payout_method,
        sourceWallet,
        status: withdrawal.status,
        estimatedSettlement: '24-48 Hours',
        createdAt: withdrawal.created_at
      },
      wallet: {
        sourceWallet,
        previousBalance: availableSourceBalance,
        newBalance: newSourceBalance,
        reservedAmount: parsedAmount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

// GET /api/withdrawals/my - List authenticated user's withdrawal requests
const getMyWithdrawals = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT id, amount, currency, payout_reference, payout_method, payout_details, status, created_at, updated_at
      FROM withdrawals
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, [userId]);

    const withdrawals = result.rows.map(row => {
      let sourceWallet = 'interest';
      if (row.payout_details && typeof row.payout_details === 'object') {
        sourceWallet = row.payout_details.sourceWallet || 'interest';
      }

      return {
        id: Number(row.id),
        amount: parseFloat(row.amount),
        currency: row.currency,
        payoutReference: row.payout_reference,
        payoutMethod: row.payout_method,
        sourceWallet,
        payoutDetails: row.payout_details,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return res.status(200).json({
      success: true,
      count: withdrawals.length,
      withdrawals
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/withdrawals/:id - Retrieve specific withdrawal request by ID
const getWithdrawalById = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const withdrawalId = req.params.id;

    const query = `
      SELECT id, amount, currency, payout_reference, payout_method, payout_details, status, created_at, updated_at
      FROM withdrawals
      WHERE id = $1 AND user_id = $2;
    `;

    const result = await pool.query(query, [withdrawalId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found.'
      });
    }

    const row = result.rows[0];
    return res.status(200).json({
      success: true,
      withdrawal: {
        id: Number(row.id),
        amount: parseFloat(row.amount),
        currency: row.currency,
        payoutReference: row.payout_reference,
        payoutMethod: row.payout_method,
        payoutDetails: row.payout_details,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createWithdrawal,
  getMyWithdrawals,
  getWithdrawalById
};
