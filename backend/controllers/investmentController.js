const pool = require('../db');
const { calculateEstimatedReturn } = require('../services/returnCalculatorService');

// POST /api/investments - Submit an investment request
const createInvestment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId;
    const { planId, principalAmount, idempotencyKey } = req.body;

    // 1. Validation
    const parsedPlanId = parseInt(planId, 10);
    const parsedPrincipal = parseFloat(principalAmount);

    if (isNaN(parsedPlanId) || parsedPlanId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid plan ID is required.'
      });
    }

    if (isNaN(parsedPrincipal) || parsedPrincipal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Investment principal must be a positive number.'
      });
    }

    // Check idempotency if key supplied
    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT * FROM investments WHERE idempotency_key = $1 AND user_id = $2;',
        [idempotencyKey, userId]
      );
      if (existing.rows.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'Investment request already registered (idempotent response).',
          investment: existing.rows[0]
        });
      }
    }

    // 2. Fetch Plan & Terms
    const planRes = await client.query(
      `SELECT id, plan_code, name, tagline, description, minimum_amount, duration_days, return_rate_percentage, currency, is_active, terms, perks
       FROM investment_plans
       WHERE id = $1 AND is_active = TRUE;`,
      [parsedPlanId]
    );

    if (planRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'The selected investment plan does not exist or is inactive.'
      });
    }

    const plan = planRes.rows[0];
    const minAmount = parseFloat(plan.minimum_amount);
    const planCode = (plan.plan_code || '').toUpperCase();
    const planNameLower = (plan.name || '').toLowerCase();

    // Enforce Plan Min and Max boundaries
    if (parsedPrincipal < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Principal amount (₹${parsedPrincipal.toLocaleString('en-IN')}) is below the required minimum of ₹${minAmount.toLocaleString('en-IN')}.`
      });
    }

    if ((planCode === 'BASIC' || planNameLower.includes('basic')) && parsedPrincipal > 20000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum allocation for Basic Plan is ₹20,000. For higher allocations, select VIP Member.'
      });
    }

    if ((planCode === 'VIP' || planNameLower.includes('vip')) && parsedPrincipal > 100000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum allocation for VIP Member is ₹1,00,000.'
      });
    }

    if ((planCode === 'DAILY' || (planNameLower.includes('daily') && !planNameLower.includes('super'))) && parsedPrincipal > 150000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum allocation for Daily Earning Plan is ₹1,50,000. For unlimited allocation, select Daily Earning Super Plan.'
      });
    }

    // 3. Begin Transaction with Row Locking
    await client.query('BEGIN');

    // Serialize access to user's wallet
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE;', [userId]);

    // Check available balance in ledger (Main / Top-Up Wallet)
    const ledgerRes = await client.query(`
      SELECT COALESCE(SUM(amount), 0.00) AS available_balance
      FROM wallet_ledger
      WHERE user_id = $1 
        AND (wallet_type = 'MAIN' OR wallet_type IS NULL)
        AND entry_type NOT IN ('RETURN_CREDIT', 'DAILY_BONUS_CREDIT')
        AND status = 'COMPLETED';
    `, [userId]);

    const availableBalance = parseFloat(ledgerRes.rows[0].available_balance) || 0.00;

    // Strict 365-day principal lock
    const durationDays = 365;
    const returnRate = parseFloat(plan.return_rate_percentage);

    const termsSnapshot = {
      planId: Number(plan.id),
      planCode: plan.plan_code,
      planName: plan.name,
      durationDays: 365,
      principalLockedDays: 365,
      returnRatePercentage: returnRate,
      minimumAmount: minAmount,
      currency: plan.currency || 'INR',
      perks: plan.perks || [],
      terms: [
        'Principal Capital Strictly Locked for 365 Days',
        ...(Array.isArray(plan.terms) ? plan.terms : [])
      ],
      allocatedAt: new Date().toISOString()
    };

    const expectedReturnAmount = calculateEstimatedReturn({
      principalAmount: parsedPrincipal,
      returnRatePercentage: returnRate,
      durationDays: durationDays
    });

    let investmentStatus = 'pending';
    let startDate = null;
    let maturityDate = null;
    let newBalance = availableBalance;

    if (availableBalance >= parsedPrincipal) {
      // Sufficient balance: allocate directly and set active
      investmentStatus = 'active';
      startDate = new Date();
      maturityDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      newBalance = parseFloat((availableBalance - parsedPrincipal).toFixed(2));

      // Record immutable ledger allocation entry
      const txnRef = `INV-ALLOC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await client.query(`
        INSERT INTO wallet_ledger 
          (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, metadata)
        VALUES 
          ($1, $2, 'INVESTMENT_ALLOCATION', 'MAIN', $3, $4, 'INR', 'COMPLETED', $5);
      `, [
        userId,
        txnRef,
        -parsedPrincipal,
        newBalance,
        JSON.stringify({ planId: plan.id, planName: plan.name, principal: parsedPrincipal })
      ]);
    }

    // Insert investment record
    const insertQuery = `
      INSERT INTO investments 
        (user_id, plan_id, plan_name, principal_amount, currency, status, expected_return_amount, start_date, maturity_date, terms_snapshot, idempotency_key)
      VALUES 
        ($1, $2, $3, $4, 'INR', $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const invResult = await client.query(insertQuery, [
      userId,
      plan.id,
      plan.name,
      parsedPrincipal,
      investmentStatus,
      expectedReturnAmount,
      startDate,
      maturityDate,
      JSON.stringify(termsSnapshot),
      idempotencyKey || null
    ]);

    await client.query('COMMIT');

    const createdInvestment = invResult.rows[0];

    const responseMessage = investmentStatus === 'active'
      ? `Investment of ₹${parsedPrincipal.toLocaleString('en-IN')} in ${plan.name} has been activated.`
      : `Investment request created in 'pending' status. Please top up your wallet with ₹${(parsedPrincipal - availableBalance).toLocaleString('en-IN')} to activate.`;

    return res.status(201).json({
      success: true,
      message: responseMessage,
      investment: {
        id: Number(createdInvestment.id),
        planId: Number(createdInvestment.plan_id),
        planName: createdInvestment.plan_name,
        principalAmount: parseFloat(createdInvestment.principal_amount),
        currency: createdInvestment.currency,
        status: createdInvestment.status,
        expectedReturnAmount: parseFloat(createdInvestment.expected_return_amount),
        startDate: createdInvestment.start_date,
        maturityDate: createdInvestment.maturity_date,
        durationDays: durationDays,
        termsSnapshot: createdInvestment.terms_snapshot,
        createdAt: createdInvestment.created_at
      },
      wallet: {
        availableBalance: newBalance,
        previousBalance: availableBalance
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

// GET /api/investments/my - Get authenticated user's investments
const getMyInvestments = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const query = `
      SELECT 
        i.id,
        i.plan_id,
        i.plan_name,
        i.principal_amount,
        i.currency,
        i.status,
        i.expected_return_amount,
        i.start_date,
        i.maturity_date,
        i.terms_snapshot,
        i.created_at,
        p.duration_days,
        p.return_rate_percentage
      FROM investments i
      LEFT JOIN investment_plans p ON i.plan_id = p.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC;
    `;

    const result = await pool.query(query, [userId]);

    const investments = result.rows.map(row => ({
      id: Number(row.id),
      planId: Number(row.plan_id),
      planName: row.plan_name || (row.terms_snapshot && row.terms_snapshot.planName) || 'Investment Plan',
      principalAmount: parseFloat(row.principal_amount),
      currency: row.currency || 'INR',
      status: row.status,
      expectedReturnAmount: parseFloat(row.expected_return_amount),
      startDate: row.start_date,
      maturityDate: row.maturity_date,
      durationDays: row.duration_days || (row.terms_snapshot && row.terms_snapshot.durationDays) || 30,
      returnRatePercentage: parseFloat(row.return_rate_percentage || (row.terms_snapshot && row.terms_snapshot.returnRatePercentage) || 10.0),
      termsSnapshot: row.terms_snapshot || {},
      createdAt: row.created_at
    }));

    return res.status(200).json({
      success: true,
      count: investments.length,
      investments
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/investments/:id - Get single investment with ownership check
const getInvestmentById = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const investmentId = parseInt(req.params.id, 10);

    if (isNaN(investmentId) || investmentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investment ID'
      });
    }

    const query = `
      SELECT 
        i.id,
        i.user_id,
        i.plan_id,
        i.plan_name,
        i.principal_amount,
        i.currency,
        i.status,
        i.expected_return_amount,
        i.start_date,
        i.maturity_date,
        i.terms_snapshot,
        i.created_at,
        u.full_name AS investor_name,
        u.email AS investor_email
      FROM investments i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1;
    `;

    const result = await pool.query(query, [investmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found.'
      });
    }

    const row = result.rows[0];

    // Authorization check: must be owner or admin
    if (Number(row.user_id) !== Number(userId) && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this investment.'
      });
    }

    return res.status(200).json({
      success: true,
      investment: {
        id: Number(row.id),
        userId: Number(row.user_id),
        investorName: row.investor_name,
        investorEmail: row.investor_email,
        planId: Number(row.plan_id),
        planName: row.plan_name,
        principalAmount: parseFloat(row.principal_amount),
        currency: row.currency,
        status: row.status,
        expectedReturnAmount: parseFloat(row.expected_return_amount),
        startDate: row.start_date,
        maturityDate: row.maturity_date,
        termsSnapshot: row.terms_snapshot,
        createdAt: row.created_at
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInvestment,
  getMyInvestments,
  getInvestmentById
};
