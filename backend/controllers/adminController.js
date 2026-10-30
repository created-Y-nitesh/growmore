const pool = require('../db');
const walletService = require('../services/walletService');
const returnBatchService = require('../services/returnBatchService');
const telegram = require('../services/telegramService');

/**
 * Administrative Operations Controller
 * Strict server-side RBAC enforced. Every modification produces an immutable audit log.
 */

// Helper to record administrative actions in admin_audit_logs
async function logAdminAction(client, { adminId, adminEmail, action, targetEntity, targetId, ip, metadata }) {
  const query = `
    INSERT INTO admin_audit_logs 
      (actor_id, actor_email, actor_role, action, target_entity, target_id, ip_address, audit_metadata)
    VALUES 
      ($1, $2, 'admin', $3, $4, $5, $6, $7)
  `;
  await client.query(query, [
    adminId || null,
    adminEmail || null,
    action,
    targetEntity,
    targetId ? targetId.toString() : null,
    ip || null,
    JSON.stringify(metadata || {})
  ]);
}

// 1. Get Platform Users (Optimized single query, eliminated N+1)
exports.getUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT COUNT(*) FROM users');
    const total = parseInt(countRes.rows[0].count, 10);

    const usersQuery = `
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        u.phone, 
        u.role, 
        u.account_status, 
        u.created_at, 
        u.updated_at,
        COALESCE(wl.available_balance, 0.00) AS available_balance,
        COALESCE(inv.locked_in_investments, 0.00) AS locked_in_investments,
        (COALESCE(wl.available_balance, 0.00) + COALESCE(inv.locked_in_investments, 0.00)) AS total_portfolio,
        COALESCE(wdr.pending_withdrawals, 0.00) AS pending_withdrawals
      FROM (
        SELECT id, full_name, email, phone, role, account_status, created_at, updated_at
        FROM users
        ORDER BY id DESC
        LIMIT $1 OFFSET $2
      ) u
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount), 0.00) AS available_balance
        FROM wallet_ledger
        WHERE user_id = u.id AND status = 'COMPLETED'
      ) wl ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(principal_amount), 0.00) AS locked_in_investments
        FROM investments
        WHERE user_id = u.id AND status = 'active'
      ) inv ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount), 0.00) AS pending_withdrawals
        FROM withdrawals
        WHERE user_id = u.id AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      ) wdr ON true
      ORDER BY u.id DESC;
    `;

    const usersRes = await pool.query(usersQuery, [limit, offset]);

    const usersWithBalances = usersRes.rows.map(row => ({
      id: Number(row.id),
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      account_status: row.account_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      availableBalance: parseFloat(parseFloat(row.available_balance).toFixed(2)) || 0,
      totalPortfolio: parseFloat(parseFloat(row.total_portfolio).toFixed(2)) || 0,
      lockedInInvestments: parseFloat(parseFloat(row.locked_in_investments).toFixed(2)) || 0,
      pendingWithdrawals: parseFloat(parseFloat(row.pending_withdrawals).toFixed(2)) || 0
    }));

    return res.json({
      success: true,
      users: usersWithBalances,
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

// 2. Update User Account Status (active / suspended)
exports.updateUserStatus = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const allowedStatuses = ['active', 'suspended'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "suspended"'
      });
    }

    await client.query('BEGIN');
    const userRes = await client.query('SELECT id, email, role, account_status FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const previousStatus = userRes.rows[0].account_status;

    await client.query(
      'UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'USER_STATUS_CHANGE',
      targetEntity: 'users',
      targetId: id,
      ip: req.ip,
      metadata: { previousStatus, newStatus: status, reason }
    });

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `User account status updated to ${status}`,
      userId: id,
      accountStatus: status
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 3. Get Investment Plans
exports.getPlans = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM investment_plans ORDER BY id ASC');
    return res.json({ success: true, plans: result.rows });
  } catch (err) {
    next(err);
  }
};

// 4. Create Investment Plan
exports.createPlan = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, tagline, description, minimumAmount, durationDays, returnRatePercentage, currency, terms, perks } = req.body;

    if (!name || !minimumAmount || !durationDays) {
      return res.status(400).json({
        success: false,
        message: 'Plan name, minimum amount, and duration days are required'
      });
    }

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO investment_plans 
        (name, tagline, description, minimum_amount, duration_days, return_rate_percentage, currency, terms, perks, is_active)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING *`,
      [
        name,
        tagline || null,
        description || null,
        parseFloat(minimumAmount),
        parseInt(durationDays, 10),
        parseFloat(returnRatePercentage || 10.0),
        (currency || 'INR').toUpperCase(),
        JSON.stringify(terms || []),
        JSON.stringify(perks || [])
      ]
    );

    const newPlan = result.rows[0];

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'PLAN_CREATED',
      targetEntity: 'investment_plans',
      targetId: newPlan.id,
      ip: req.ip,
      metadata: { planName: name, minimumAmount, durationDays }
    });

    await client.query('COMMIT');
    return res.status(201).json({ success: true, plan: newPlan });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 5. Update Investment Plan
exports.updatePlan = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, tagline, description, minimumAmount, durationDays, returnRatePercentage, isActive } = req.body;

    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM investment_plans WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const current = existing.rows[0];

    const updated = await client.query(
      `UPDATE investment_plans 
       SET name = COALESCE($1, name),
           tagline = COALESCE($2, tagline),
           description = COALESCE($3, description),
           minimum_amount = COALESCE($4, minimum_amount),
           duration_days = COALESCE($5, duration_days),
           return_rate_percentage = COALESCE($6, return_rate_percentage),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name || null,
        tagline || null,
        description || null,
        minimumAmount ? parseFloat(minimumAmount) : null,
        durationDays ? parseInt(durationDays, 10) : null,
        returnRatePercentage ? parseFloat(returnRatePercentage) : null,
        typeof isActive === 'boolean' ? isActive : null,
        id
      ]
    );

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'PLAN_UPDATED',
      targetEntity: 'investment_plans',
      targetId: id,
      ip: req.ip,
      metadata: { before: current, after: updated.rows[0] }
    });

    await client.query('COMMIT');
    return res.json({ success: true, plan: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 6. Get All Investments (Platform-Wide)
exports.getInvestments = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT COUNT(*) FROM investments');
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT 
        i.*,
        u.email as user_email,
        u.full_name as user_name
       FROM investments i
       JOIN users u ON i.user_id = u.id
       ORDER BY i.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      success: true,
      investments: result.rows,
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

// 7. Get All Deposit Requests
exports.getDeposits = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status ? req.query.status.toUpperCase() : null;

    let query = `
      SELECT d.*, u.email as user_email, u.full_name as user_name
      FROM deposits d
      JOIN users u ON d.user_id = u.id
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` WHERE d.status = $${params.length}`;
    }

    query += ` ORDER BY d.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = status 
      ? 'SELECT COUNT(*) FROM deposits WHERE status = $1' 
      : 'SELECT COUNT(*) FROM deposits';
    const countParams = status ? [status] : [];
    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      deposits: result.rows,
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

// 8. Admin Manual Deposit Verification (for bank transfer / NEFT confirmation)
exports.verifyDepositManual = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { transactionReference, notes } = req.body;

    if (!transactionReference) {
      return res.status(400).json({
        success: false,
        message: 'External bank transaction reference is required for audit trail'
      });
    }

    await client.query('BEGIN');
    const depRes = await client.query('SELECT * FROM deposits WHERE id = $1 FOR UPDATE', [id]);
    if (depRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Deposit record not found' });
    }

    const deposit = depRes.rows[0];
    if (deposit.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot manually verify deposit in ${deposit.status} state`
      });
    }

    // 1. Update deposit status
    await client.query(
      `UPDATE deposits 
       SET status = 'SUCCESS',
           provider_reference = $1,
           admin_note = $2,
           verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [transactionReference, notes || 'Verified manually by administrator', id]
    );

    // 2. Calculate balance and add atomic ledger entry
    const userWallet = await walletService.getUserBalance(deposit.user_id);
    const currentBalance = Number(userWallet.availableBalance);
    const depositAmount = Number(deposit.amount);
    const newBalance = (currentBalance + depositAmount).toFixed(2);
    const txRef = `DEP_MANUAL_${deposit.id}_${Date.now()}`;

    await client.query(
      `INSERT INTO wallet_ledger 
        (user_id, transaction_reference, reference_id, entry_type, wallet_type, amount, balance_after, currency, status, metadata)
       VALUES 
        ($1, $2, $3, 'DEPOSIT', 'MAIN', $4, $5, $6, 'COMPLETED', $7)`,
      [
        deposit.user_id,
        txRef,
        deposit.id.toString(),
        depositAmount.toFixed(2),
        newBalance,
        deposit.currency,
        JSON.stringify({
          verificationType: 'MANUAL_ADMIN',
          verifiedBy: req.user.email,
          bankTxRef: transactionReference,
          notes
        })
      ]
    );

    // 3. Record in admin_audit_logs
    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'MANUAL_DEPOSIT_VERIFIED',
      targetEntity: 'deposits',
      targetId: id,
      ip: req.ip,
      metadata: { depositId: id, amount: deposit.amount, transactionReference, notes }
    });

    await client.query('COMMIT');

    // Telegram notification (non-blocking)
    telegram.notifyDepositVerified({
      depositId: id,
      amount: deposit.amount,
      userEmail: deposit.user_id,
      verifiedBy: req.user.email,
      bankTxRef: transactionReference
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Deposit verified and user ledger credited atomically',
      depositId: id,
      amount: deposit.amount,
      newBalance
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 9. Get All Withdrawal Requests
exports.getWithdrawals = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status ? req.query.status.toUpperCase() : null;

    let query = `
      SELECT w.*, u.email as user_email, u.full_name as user_name
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` WHERE w.status = $${params.length}`;
    }

    query += ` ORDER BY w.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = status 
      ? 'SELECT COUNT(*) FROM withdrawals WHERE status = $1' 
      : 'SELECT COUNT(*) FROM withdrawals';
    const countParams = status ? [status] : [];
    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      withdrawals: result.rows,
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

// 10. Approve Withdrawal (PENDING -> APPROVED)
exports.approveWithdrawal = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { note } = req.body;

    await client.query('BEGIN');
    const wRes = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    if (wRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    const withdrawal = wRes.rows[0];
    if (withdrawal.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot approve withdrawal in ${withdrawal.status} status`
      });
    }

    await client.query(
      `UPDATE withdrawals 
       SET status = 'APPROVED', admin_note = $1, updated_at = NOW() 
       WHERE id = $2`,
      [note || 'Approved for banking payout', id]
    );

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'WITHDRAWAL_APPROVED',
      targetEntity: 'withdrawals',
      targetId: id,
      ip: req.ip,
      metadata: { amount: withdrawal.amount, note }
    });

    await client.query('COMMIT');

    // Telegram notification (non-blocking)
    telegram.notifyWithdrawalApproved({
      withdrawalId: id,
      amount: withdrawal.amount,
      userEmail: withdrawal.user_id
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Withdrawal request approved for payout',
      withdrawalId: id,
      status: 'APPROVED'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 11. Mark Withdrawal Paid (APPROVED/PROCESSING -> PAID)
exports.markWithdrawalPaid = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payoutReference, note } = req.body;

    if (!payoutReference) {
      return res.status(400).json({
        success: false,
        message: 'Banking payout reference is required'
      });
    }

    await client.query('BEGIN');
    const wRes = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    if (wRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    const withdrawal = wRes.rows[0];
    if (withdrawal.status !== 'APPROVED' && withdrawal.status !== 'PROCESSING') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot mark withdrawal paid from ${withdrawal.status} status`
      });
    }

    // Update status to PAID
    await client.query(
      `UPDATE withdrawals 
       SET status = 'PAID', 
           payout_reference = $1, 
           admin_note = $2, 
           settled_at = NOW(), 
           updated_at = NOW() 
       WHERE id = $3`,
      [payoutReference, note || 'Bank payout successfully settled', id]
    );

    // Update metadata on existing WITHDRAWAL_HOLD ledger entry
    await client.query(`
      UPDATE wallet_ledger
      SET metadata = metadata || jsonb_build_object('settled', true, 'payoutReference', $1::text, 'settledAt', NOW()::text)
      WHERE reference_id = $2 AND entry_type = 'WITHDRAWAL_HOLD';
    `, [payoutReference, String(withdrawal.id)]);

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'WITHDRAWAL_SETTLED_PAID',
      targetEntity: 'withdrawals',
      targetId: id,
      ip: req.ip,
      metadata: { payoutReference, amount: withdrawal.amount }
    });

    await client.query('COMMIT');

    // Telegram notification (non-blocking)
    telegram.notifyWithdrawalPaid({
      withdrawalId: id,
      amount: withdrawal.amount,
      userEmail: withdrawal.user_id,
      payoutReference
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Withdrawal settled and marked PAID',
      withdrawalId: id,
      status: 'PAID'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 12. Reject Withdrawal (Atomically RELEASES funds back to user ledger)
exports.rejectWithdrawal = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required for auditable cancellation'
      });
    }

    await client.query('BEGIN');
    const wRes = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    if (wRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    const withdrawal = wRes.rows[0];
    if (withdrawal.status === 'PAID') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot reject a withdrawal that has already been marked PAID'
      });
    }

    if (withdrawal.status === 'REJECTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Withdrawal request is already rejected'
      });
    }

    // 1. Release reserved hold on ledger to appropriate wallet type
    let refundWalletType = 'INTEREST';
    if (withdrawal.payout_details && typeof withdrawal.payout_details === 'object') {
      if (withdrawal.payout_details.sourceWallet === 'daily_earning') {
        refundWalletType = 'DAILY_EARNING';
      } else if (withdrawal.payout_details.sourceWallet === 'main') {
        refundWalletType = 'MAIN';
      }
    }

    const currentBalRes = await client.query(`
      SELECT COALESCE(SUM(amount), 0.00) AS balance
      FROM wallet_ledger
      WHERE user_id = $1 AND wallet_type = $2 AND status = 'COMPLETED';
    `, [withdrawal.user_id, refundWalletType]);

    const currentBalance = Number(currentBalRes.rows[0].balance);
    const refundAmount = Number(withdrawal.amount);
    const restoredBalance = (currentBalance + refundAmount).toFixed(2);
    const txRef = `WTH_REL_${withdrawal.id}_${Date.now()}`;

    await client.query(
      `INSERT INTO wallet_ledger 
        (user_id, transaction_reference, reference_id, entry_type, wallet_type, amount, balance_after, currency, status, metadata)
       VALUES 
        ($1, $2, $3, 'WITHDRAWAL_RELEASE', $4, $5, $6, $7, 'COMPLETED', $8)`,
      [
        withdrawal.user_id,
        txRef,
        withdrawal.id.toString(),
        refundWalletType,
        refundAmount.toFixed(2),
        restoredBalance,
        withdrawal.currency,
        JSON.stringify({
          withdrawalId: withdrawal.id,
          reason,
          refundWalletType,
          rejectedBy: req.user.email
        })
      ]
    );

    // 2. Mark withdrawal REJECTED
    await client.query(
      `UPDATE withdrawals 
       SET status = 'REJECTED', 
           rejection_reason = $1, 
           rejected_at = NOW(), 
           updated_at = NOW() 
       WHERE id = $2`,
      [reason, id]
    );

    // 3. Log admin action
    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'WITHDRAWAL_REJECTED_HOLD_RELEASED',
      targetEntity: 'withdrawals',
      targetId: id,
      ip: req.ip,
      metadata: { withdrawalId: id, amount: withdrawal.amount, reason, restoredBalance }
    });

    await client.query('COMMIT');

    // Telegram notification (non-blocking)
    telegram.notifyWithdrawalRejected({
      withdrawalId: id,
      amount: withdrawal.amount,
      userEmail: withdrawal.user_id,
      reason
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Withdrawal rejected and reserved funds safely restored to user wallet',
      withdrawalId: id,
      restoredBalance,
      status: 'REJECTED'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 13. Platform-Wide Authoritative Ledger Explorer
exports.getLedger = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const offset = (page - 1) * limit;
    const entryType = req.query.entryType ? req.query.entryType.toUpperCase() : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    let query = `
      SELECT l.*, u.email as user_email, u.full_name as user_name
      FROM wallet_ledger l
      JOIN users u ON l.user_id = u.id
    `;
    const conditions = [];
    const params = [];

    if (entryType) {
      params.push(entryType);
      conditions.push(`l.entry_type = $${params.length}`);
    }

    if (userId) {
      params.push(userId);
      conditions.push(`l.user_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM wallet_ledger l WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM wallet_ledger';
    const countRes = await pool.query(countQuery, params.slice(0, conditions.length));
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      ledger: result.rows,
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

// 14. Return Calculation Records
exports.getReturns = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT COUNT(*) FROM return_entries');
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT r.*, u.email as user_email, u.full_name as user_name, i.plan_name
       FROM return_entries r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN investments i ON r.investment_id = i.id
       ORDER BY r.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      success: true,
      returns: result.rows,
      isLiveCreditingEnabled: process.env.ENABLE_LIVE_RETURN_CREDITING === 'true',
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

// 15. Trigger Scheduled Return Batch Calculation
exports.runReturnBatch = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { periodKey } = req.body;
    const key = periodKey || new Date().toISOString().slice(0, 7);

    const batchSummary = await returnBatchService.processBatch({
      periodKey: key,
      adminId: req.user.id
    });

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'RETURN_BATCH_EXECUTED',
      targetEntity: 'return_entries',
      targetId: key,
      ip: req.ip,
      metadata: batchSummary
    });

    return res.json({
      success: true,
      message: `Return calculation batch executed for period: ${key}`,
      summary: batchSummary
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
};

// 16. Administrative Audit Logs
exports.getAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT COUNT(*) FROM admin_audit_logs');
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(
      `SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      success: true,
      auditLogs: result.rows,
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

// 17. Financial Balance Reconciliation & Platform Invariants
exports.getReconciliation = async (req, res, next) => {
  try {
    const report = await returnBatchService.runFinancialReconciliation();
    return res.json({
      success: true,
      report
    });
  } catch (err) {
    next(err);
  }
};

// 18. Support Tickets Management
exports.getTickets = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { status, priority, search, q } = req.query;
    const searchTerm = (search || q || '').trim();

    const whereClauses = [];
    const params = [];

    if (status && status.trim() && status.toLowerCase() !== 'all') {
      params.push(status.trim().toUpperCase());
      whereClauses.push(`status = $${params.length}`);
    }

    if (priority && priority.trim() && priority.toLowerCase() !== 'all') {
      params.push(priority.trim().toUpperCase());
      whereClauses.push(`priority = $${params.length}`);
    }

    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      whereClauses.push(`(
        ticket_number ILIKE $${params.length} OR
        user_name ILIKE $${params.length} OR
        user_email ILIKE $${params.length} OR
        user_mobile ILIKE $${params.length} OR
        subject ILIKE $${params.length} OR
        message ILIKE $${params.length}
      )`);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM support_tickets ${whereSQL}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(limit);
    params.push(offset);

    const query = `
      SELECT * FROM support_tickets
      ${whereSQL}
      ORDER BY id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      tickets: result.rows,
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

exports.getTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isNumeric = !isNaN(Number(id));
    const query = isNumeric
      ? 'SELECT * FROM support_tickets WHERE id = $1 OR ticket_number = $2 LIMIT 1;'
      : 'SELECT * FROM support_tickets WHERE ticket_number = $1 LIMIT 1;';
    const params = isNumeric ? [Number(id), id] : [id];

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found.'
      });
    }

    return res.json({
      success: true,
      ticket: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
};

exports.updateTicket = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, priority, adminNotes } = req.body;

    const isNumeric = !isNaN(Number(id));
    const findQuery = isNumeric
      ? 'SELECT * FROM support_tickets WHERE id = $1 OR ticket_number = $2 LIMIT 1;'
      : 'SELECT * FROM support_tickets WHERE ticket_number = $1 LIMIT 1;';
    const findParams = isNumeric ? [Number(id), id] : [id];

    const checkRes = await client.query(findQuery, findParams);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found.'
      });
    }

    const currentTicket = checkRes.rows[0];
    const updateClauses = [];
    const updateParams = [];

    if (status) {
      const allowedStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
      const upperStatus = status.trim().toUpperCase();
      if (!allowedStatuses.includes(upperStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
        });
      }
      updateParams.push(upperStatus);
      updateClauses.push(`status = $${updateParams.length}`);

      if (['RESOLVED', 'CLOSED'].includes(upperStatus) && !currentTicket.resolved_at) {
        updateClauses.push(`resolved_at = NOW()`);
      } else if (!['RESOLVED', 'CLOSED'].includes(upperStatus)) {
        updateClauses.push(`resolved_at = NULL`);
      }
    }

    if (priority) {
      const allowedPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
      const upperPriority = priority.trim().toUpperCase();
      if (!allowedPriorities.includes(upperPriority)) {
        return res.status(400).json({
          success: false,
          message: `Invalid priority. Must be one of: ${allowedPriorities.join(', ')}`
        });
      }
      updateParams.push(upperPriority);
      updateClauses.push(`priority = $${updateParams.length}`);
    }

    if (adminNotes !== undefined) {
      updateParams.push(adminNotes);
      updateClauses.push(`admin_notes = $${updateParams.length}`);
    }

    updateClauses.push(`updated_at = NOW()`);
    updateParams.push(currentTicket.id);

    const updateQuery = `
      UPDATE support_tickets 
      SET ${updateClauses.join(', ')} 
      WHERE id = $${updateParams.length}
      RETURNING *;
    `;

    const updateRes = await client.query(updateQuery, updateParams);
    const updatedTicket = updateRes.rows[0];

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'SUPPORT_TICKET_UPDATED',
      targetEntity: 'support_tickets',
      targetId: currentTicket.id,
      ip: req.ip,
      metadata: {
        previousStatus: currentTicket.status,
        newStatus: updatedTicket.status,
        previousPriority: currentTicket.priority,
        newPriority: updatedTicket.priority
      }
    });

    return res.json({
      success: true,
      message: 'Support ticket updated successfully.',
      ticket: updatedTicket
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
};

exports.closeTicket = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const isNumeric = !isNaN(Number(id));
    const findQuery = isNumeric
      ? 'SELECT * FROM support_tickets WHERE id = $1 OR ticket_number = $2 LIMIT 1;'
      : 'SELECT * FROM support_tickets WHERE ticket_number = $1 LIMIT 1;';
    const findParams = isNumeric ? [Number(id), id] : [id];

    const checkRes = await client.query(findQuery, findParams);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found.'
      });
    }

    const currentTicket = checkRes.rows[0];

    const updateQuery = `
      UPDATE support_tickets 
      SET status = 'CLOSED', 
          resolved_at = NOW(), 
          admin_notes = COALESCE($1, admin_notes),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;

    const updateRes = await client.query(updateQuery, [adminNotes || null, currentTicket.id]);
    const closedTicket = updateRes.rows[0];

    await logAdminAction(client, {
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: 'SUPPORT_TICKET_CLOSED',
      targetEntity: 'support_tickets',
      targetId: currentTicket.id,
      ip: req.ip,
      metadata: {
        previousStatus: currentTicket.status,
        ticketNumber: currentTicket.ticket_number
      }
    });

    return res.json({
      success: true,
      message: 'Support ticket closed successfully.',
      ticket: closedTicket
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
};

