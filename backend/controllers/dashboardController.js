const pool = require('../db');

/**
 * Enterprise Admin Analytics & Dashboard Metrics Controller
 * All aggregations run in single optimized queries using covering indexes.
 */

/**
 * GET /api/admin/dashboard/metrics
 * Comprehensive high-level executive dashboard metrics
 */
exports.getDashboardMetrics = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        -- 1. Users metrics
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE account_status = 'active') AS active_users,
        (SELECT COUNT(*) FROM users WHERE account_status = 'suspended') AS suspended_users,

        -- 2. Ledger financial metrics
        (SELECT COALESCE(SUM(amount), 0.00) FROM wallet_ledger WHERE status = 'COMPLETED') AS total_available_funds,
        (SELECT COALESCE(SUM(amount), 0.00) FROM wallet_ledger WHERE entry_type = 'DEPOSIT' AND status = 'COMPLETED') AS total_deposits_volume,
        (SELECT COALESCE(SUM(amount), 0.00) FROM wallet_ledger WHERE entry_type = 'WITHDRAWAL' AND status = 'COMPLETED') AS total_withdrawals_volume,
        (SELECT COALESCE(SUM(amount), 0.00) FROM wallet_ledger WHERE entry_type = 'RETURN_CREDIT' AND status = 'COMPLETED') AS total_returns_credited,

        -- 3. Investments metrics
        (SELECT COUNT(*) FROM investments WHERE status = 'active') AS active_investments_count,
        (SELECT COALESCE(SUM(principal_amount), 0.00) FROM investments WHERE status = 'active') AS active_investments_principal,
        (SELECT COALESCE(SUM(expected_return_amount), 0.00) FROM investments WHERE status = 'active') AS active_investments_expected_returns,

        -- 4. Pipeline pending actions
        (SELECT COUNT(*) FROM deposits WHERE status = 'PENDING') AS pending_deposits_count,
        (SELECT COALESCE(SUM(amount), 0.00) FROM deposits WHERE status = 'PENDING') AS pending_deposits_amount,
        (SELECT COUNT(*) FROM withdrawals WHERE status IN ('PENDING', 'APPROVED', 'PROCESSING')) AS pending_withdrawals_count,
        (SELECT COALESCE(SUM(amount), 0.00) FROM withdrawals WHERE status IN ('PENDING', 'APPROVED', 'PROCESSING')) AS pending_withdrawals_amount,

        -- 5. Support tickets
        (SELECT COUNT(*) FROM support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS')) AS open_tickets_count,
        (SELECT COUNT(*) FROM support_tickets WHERE status = 'OPEN') AS unassigned_tickets_count;
    `;

    const result = await pool.query(query);
    const m = result.rows[0];

    const availableFunds = parseFloat(m.total_available_funds) || 0;
    const lockedInvestments = parseFloat(m.active_investments_principal) || 0;
    const totalPortfolio = parseFloat((availableFunds + lockedInvestments).toFixed(2));

    return res.json({
      success: true,
      metrics: {
        users: {
          total: parseInt(m.total_users, 10) || 0,
          active: parseInt(m.active_users, 10) || 0,
          suspended: parseInt(m.suspended_users, 10) || 0
        },
        financials: {
          availableFunds,
          lockedInvestments,
          totalPortfolio,
          totalDepositsVolume: parseFloat(m.total_deposits_volume) || 0,
          totalWithdrawalsVolume: Math.abs(parseFloat(m.total_withdrawals_volume) || 0),
          totalReturnsCredited: parseFloat(m.total_returns_credited) || 0
        },
        investments: {
          activeCount: parseInt(m.active_investments_count, 10) || 0,
          activePrincipal: lockedInvestments,
          expectedReturns: parseFloat(m.active_investments_expected_returns) || 0
        },
        pipeline: {
          pendingDeposits: {
            count: parseInt(m.pending_deposits_count, 10) || 0,
            amount: parseFloat(m.pending_deposits_amount) || 0
          },
          pendingWithdrawals: {
            count: parseInt(m.pending_withdrawals_count, 10) || 0,
            amount: parseFloat(m.pending_withdrawals_amount) || 0
          }
        },
        support: {
          openTickets: parseInt(m.open_tickets_count, 10) || 0,
          unassignedTickets: parseInt(m.unassigned_tickets_count, 10) || 0
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/dashboard/revenue-analytics
 * Grouped daily deposits, withdrawals, and yield returns
 */
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));

    const query = `
      SELECT 
        d.date::date AS day,
        COALESCE(SUM(CASE WHEN wl.entry_type = 'DEPOSIT' THEN wl.amount ELSE 0 END), 0.00) AS deposits,
        COALESCE(SUM(CASE WHEN wl.entry_type = 'WITHDRAWAL' THEN ABS(wl.amount) ELSE 0 END), 0.00) AS withdrawals,
        COALESCE(SUM(CASE WHEN wl.entry_type = 'RETURN_CREDIT' THEN wl.amount ELSE 0 END), 0.00) AS returns_credited
      FROM generate_series(NOW() - ($1 || ' days')::interval, NOW(), '1 day'::interval) d(date)
      LEFT JOIN wallet_ledger wl ON DATE(wl.created_at) = d.date::date AND wl.status = 'COMPLETED'
      GROUP BY d.date::date
      ORDER BY d.date::date ASC;
    `;

    const result = await pool.query(query, [days]);

    const timeline = result.rows.map(r => ({
      date: r.day.toISOString().split('T')[0],
      deposits: parseFloat(r.deposits) || 0,
      withdrawals: parseFloat(r.withdrawals) || 0,
      returnsCredited: parseFloat(r.returns_credited) || 0,
      netCashFlow: parseFloat(((parseFloat(r.deposits) || 0) - (parseFloat(r.withdrawals) || 0)).toFixed(2))
    }));

    return res.json({
      success: true,
      timeframeDays: days,
      analytics: timeline
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/dashboard/user-growth
 * Daily user registrations and phone verification rates
 */
exports.getUserGrowth = async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));

    const query = `
      SELECT 
        d.date::date AS day,
        COUNT(u.id) AS registrations,
        COUNT(u.id) FILTER (WHERE u.is_phone_verified = TRUE) AS verified_registrations
      FROM generate_series(NOW() - ($1 || ' days')::interval, NOW(), '1 day'::interval) d(date)
      LEFT JOIN users u ON DATE(u.created_at) = d.date::date
      GROUP BY d.date::date
      ORDER BY d.date::date ASC;
    `;

    const result = await pool.query(query, [days]);

    const timeline = result.rows.map(r => ({
      date: r.day.toISOString().split('T')[0],
      registrations: parseInt(r.registrations, 10) || 0,
      verified: parseInt(r.verified_registrations, 10) || 0
    }));

    return res.json({
      success: true,
      timeframeDays: days,
      growth: timeline
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/dashboard/investments-breakdown
 * Distribution of active investments per plan
 */
exports.getActiveInvestmentsBreakdown = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.id AS plan_id,
        p.name AS plan_name,
        p.plan_code,
        p.duration_days,
        p.return_rate_percentage,
        COUNT(i.id) AS active_contracts_count,
        COALESCE(SUM(i.principal_amount), 0.00) AS total_principal_allocated,
        COALESCE(SUM(i.expected_return_amount), 0.00) AS total_expected_returns
      FROM investment_plans p
      LEFT JOIN investments i ON i.plan_id = p.id AND i.status = 'active'
      GROUP BY p.id, p.name, p.plan_code, p.duration_days, p.return_rate_percentage
      ORDER BY total_principal_allocated DESC;
    `;

    const result = await pool.query(query);

    const plansBreakdown = result.rows.map(r => ({
      planId: Number(r.plan_id),
      planName: r.plan_name,
      planCode: r.plan_code,
      durationDays: parseInt(r.duration_days, 10),
      returnRatePercentage: parseFloat(r.return_rate_percentage),
      activeContractsCount: parseInt(r.active_contracts_count, 10) || 0,
      totalPrincipalAllocated: parseFloat(r.total_principal_allocated) || 0,
      totalExpectedReturns: parseFloat(r.total_expected_returns) || 0
    }));

    return res.json({
      success: true,
      breakdown: plansBreakdown
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/dashboard/pending-actions
 * Consolidated summary of pending items requiring administrator action
 */
exports.getPendingActions = async (req, res, next) => {
  try {
    // 1. Pending deposits
    const depRes = await pool.query(`
      SELECT d.id, d.amount, d.payment_provider, d.provider_reference, d.created_at, u.email, u.full_name
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      WHERE d.status = 'PENDING'
      ORDER BY d.created_at ASC
      LIMIT 5;
    `);

    // 2. Pending & approved withdrawals
    const wdrRes = await pool.query(`
      SELECT w.id, w.amount, w.payout_method, w.status, w.created_at, u.email, u.full_name
      FROM withdrawals w
      JOIN users u ON u.id = w.user_id
      WHERE w.status IN ('PENDING', 'APPROVED', 'PROCESSING')
      ORDER BY w.created_at ASC
      LIMIT 5;
    `);

    // 3. Open support tickets
    const tckRes = await pool.query(`
      SELECT id, ticket_number, category, subject, priority, created_at, user_name, user_email
      FROM support_tickets
      WHERE status IN ('OPEN', 'IN_PROGRESS')
      ORDER BY (priority = 'URGENT') DESC, (priority = 'HIGH') DESC, created_at ASC
      LIMIT 5;
    `);

    return res.json({
      success: true,
      pendingActions: {
        deposits: depRes.rows,
        withdrawals: wdrRes.rows,
        supportTickets: tckRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
};
