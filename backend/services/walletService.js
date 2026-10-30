const pool = require('../db');

/**
 * Calculates accurate financial wallet metrics for an authenticated user
 * strictly partitioned into:
 * 1. principal_locked - 365-day locked capital in active investment plans
 * 2. interest_balance - monthly ROI returns (10%, 12%, 18%, 20%) with min ₹500 withdrawal threshold
 * 3. daily_earning_balance - accumulated ₹99 / ₹300 daily bonuses (min ₹1,000 / ₹3,000 threshold)
 * 4. available_balance - main deposit/top-up funds
 */
async function getUserWalletSummary(userId) {
  // 1. Locked Principal in Active Investments (365 Days)
  const investmentsRes = await pool.query(`
    SELECT 
      COALESCE(SUM(i.principal_amount), 0.00) AS total_invested,
      COALESCE(SUM(i.expected_return_amount), 0.00) AS total_expected_returns,
      COUNT(*) AS active_plans_count
    FROM investments i
    WHERE i.user_id = $1 AND i.status = 'active';
  `, [userId]);

  const principalLocked = parseFloat(investmentsRes.rows[0].total_invested) || 0.00;
  const estimatedReturns = parseFloat(investmentsRes.rows[0].total_expected_returns) || 0.00;
  const activePlansCount = parseInt(investmentsRes.rows[0].active_plans_count, 10) || 0;

  // 2. Active Plans details (to detect Daily vs Super tiers)
  const activePlansRes = await pool.query(`
    SELECT 
      i.id, i.plan_id, i.plan_name, i.principal_amount, i.start_date, i.maturity_date,
      p.plan_code, p.return_rate_percentage, p.duration_days
    FROM investments i
    LEFT JOIN investment_plans p ON i.plan_id = p.id
    WHERE i.user_id = $1 AND i.status = 'active'
    ORDER BY i.created_at DESC;
  `, [userId]);

  const activePlans = activePlansRes.rows.map(r => ({
    id: Number(r.id),
    planId: Number(r.plan_id),
    planCode: r.plan_code || '',
    planName: r.plan_name,
    principal: parseFloat(r.principal_amount),
    startDate: r.start_date,
    maturityDate: r.maturity_date,
    returnRatePercentage: parseFloat(r.return_rate_percentage || 0),
    durationDays: Number(r.duration_days || 365)
  }));

  const hasSuperPlan = activePlans.some(p => 
    (p.planCode && p.planCode.toUpperCase() === 'SUPER') || 
    (p.planName && p.planName.toLowerCase().includes('super'))
  );

  const hasDailyPlan = activePlans.some(p => 
    (p.planCode && p.planCode.toUpperCase() === 'DAILY') || 
    (p.planName && p.planName.toLowerCase().includes('daily'))
  );

  // 3. Interest Balance (Monthly returns from Basic/VIP/Daily/Super minus interest withdrawals)
  const interestRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS balance
    FROM wallet_ledger
    WHERE user_id = $1 
      AND (
        wallet_type = 'INTEREST' 
        OR (wallet_type = 'MAIN' AND entry_type = 'RETURN_CREDIT')
      )
      AND status = 'COMPLETED';
  `, [userId]);

  const interestBalance = Math.max(0, parseFloat(parseFloat(interestRes.rows[0].balance).toFixed(2)) || 0.00);

  // 4. Daily Earning Balance (Accumulated ₹99 or ₹300 daily bonuses minus daily earning withdrawals)
  const dailyEarningRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS balance
    FROM wallet_ledger
    WHERE user_id = $1 
      AND wallet_type = 'DAILY_EARNING'
      AND status = 'COMPLETED';
  `, [userId]);

  const dailyEarningBalance = Math.max(0, parseFloat(parseFloat(dailyEarningRes.rows[0].balance).toFixed(2)) || 0.00);

  // 5. Main Available Top-up Balance (From deposits not yet allocated to investments)
  const mainLedgerRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS balance
    FROM wallet_ledger
    WHERE user_id = $1 
      AND (wallet_type = 'MAIN' OR wallet_type IS NULL)
      AND entry_type NOT IN ('RETURN_CREDIT', 'DAILY_BONUS_CREDIT')
      AND status = 'COMPLETED';
  `, [userId]);

  const availableBalance = Math.max(0, parseFloat(parseFloat(mainLedgerRes.rows[0].balance).toFixed(2)) || 0.00);

  // 6. Pending Withdrawals (Reserved funds)
  const pendingWdrRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS pending_amount, COUNT(*) AS count
    FROM withdrawals
    WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED', 'PROCESSING');
  `, [userId]);

  const pendingWithdrawals = parseFloat(pendingWdrRes.rows[0].pending_amount) || 0.00;

  // 7. Pending Deposits
  const pendingDepRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS pending_amount, COUNT(*) AS count
    FROM deposits
    WHERE user_id = $1 AND status = 'PENDING';
  `, [userId]);

  const pendingDeposits = parseFloat(pendingDepRes.rows[0].pending_amount) || 0.00;

  // 8. Cumulative lifetime stats
  const totalDepRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS total_deposited
    FROM wallet_ledger
    WHERE user_id = $1 AND entry_type = 'DEPOSIT' AND status = 'COMPLETED';
  `, [userId]);
  const totalDeposited = parseFloat(totalDepRes.rows[0].total_deposited) || 0.00;

  const totalPaidWdrRes = await pool.query(`
    SELECT COALESCE(SUM(amount), 0.00) AS total_withdrawn
    FROM withdrawals
    WHERE user_id = $1 AND status = 'PAID';
  `, [userId]);
  const totalWithdrawn = parseFloat(totalPaidWdrRes.rows[0].total_withdrawn) || 0.00;

  const totalReturnsCredited = parseFloat((interestBalance + dailyEarningBalance).toFixed(2));

  // Determine withdrawal eligibility
  const minInterestWithdrawal = 500;
  const minDailyEarningWithdrawal = hasSuperPlan ? 3000 : 1000;

  const canWithdrawInterest = interestBalance >= minInterestWithdrawal;
  const canWithdrawDailyEarning = (hasDailyPlan || hasSuperPlan) && (dailyEarningBalance >= minDailyEarningWithdrawal);

  // Total Withdrawable funds
  const totalWithdrawable = parseFloat((interestBalance + dailyEarningBalance).toFixed(2));

  // Total Portfolio = All components combined
  const totalPortfolio = parseFloat((availableBalance + principalLocked + interestBalance + dailyEarningBalance).toFixed(2));

  return {
    currency: 'INR',
    // 3 Distinct Wallets required by Audit:
    principalLocked,           // Principal strictly locked for 365 days
    interestBalance,           // Monthly return (10%, 12%, 18%, 20%) - min ₹500 withdraw
    dailyEarningBalance,       // Accumulated ₹99 / ₹300 daily bonuses - min ₹1000 / ₹3000 withdraw
    availableBalance,          // Top-up deposit funds available for investment
    
    // Aggregated metrics
    totalWithdrawable,
    totalPortfolio,
    lockedInInvestments: principalLocked, // backwards-compatible alias
    estimatedReturns,
    activePlansCount,
    activePlans,

    // Plan & Withdrawal flags
    hasDailyPlan,
    hasSuperPlan,
    minInterestWithdrawal,
    minDailyEarningWithdrawal,
    canWithdrawInterest,
    canWithdrawDailyEarning,

    // Lifetime metrics
    pendingWithdrawals: parseFloat(pendingWithdrawals.toFixed(2)),
    pendingDeposits: parseFloat(pendingDeposits.toFixed(2)),
    totalDeposited: parseFloat(totalDeposited.toFixed(2)),
    totalWithdrawn: parseFloat(totalWithdrawn.toFixed(2)),
    totalReturnsCredited
  };
}

/**
 * Returns paginated immutable financial ledger entries
 */
async function getPaginatedLedger(userId, { page = 1, limit = 20, type = null }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT 
      id, 
      transaction_reference, 
      entry_type, 
      wallet_type, 
      amount, 
      balance_after, 
      currency, 
      status, 
      metadata, 
      reference_id, 
      created_at
    FROM wallet_ledger
    WHERE user_id = $1
  `;
  const queryParams = [userId];

  if (type) {
    queryParams.push(type);
    query += ` AND entry_type = $${queryParams.length}`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};`;
  queryParams.push(limitNum, offset);

  let countQuery = 'SELECT COUNT(*) FROM wallet_ledger WHERE user_id = $1';
  const countParams = [userId];
  if (type) {
    countParams.push(type);
    countQuery += ' AND entry_type = $2';
  }

  const [entriesRes, countRes] = await Promise.all([
    pool.query(query, queryParams),
    pool.query(countQuery, countParams)
  ]);

  const totalItems = parseInt(countRes.rows[0].count, 10) || 0;
  const totalPages = Math.ceil(totalItems / limitNum) || 1;

  const entries = entriesRes.rows.map(row => ({
    id: Number(row.id),
    transactionReference: row.transaction_reference,
    entryType: row.entry_type,
    walletType: row.wallet_type,
    amount: parseFloat(row.amount),
    balanceAfter: parseFloat(row.balance_after || 0),
    currency: row.currency,
    status: row.status,
    metadata: row.metadata || {},
    referenceId: row.reference_id,
    createdAt: row.created_at
  }));

  return {
    entries,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalItems,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    }
  };
}

/**
 * Returns user transaction history formatted for UI console
 */
async function getPaginatedTransactions(userId, { page = 1, limit = 20, type = null }) {
  const ledgerData = await getPaginatedLedger(userId, { page, limit, type });

  const transactions = ledgerData.entries.map(entry => {
    let friendlyType = 'Adjustment';
    let isCredit = entry.amount > 0;

    switch (entry.entryType) {
      case 'DEPOSIT':
        friendlyType = 'Top Up Deposit';
        break;
      case 'WITHDRAWAL_HOLD':
        friendlyType = 'Withdrawal Hold';
        break;
      case 'WITHDRAWAL_RELEASE':
        friendlyType = 'Withdrawal Release (Refund)';
        break;
      case 'WITHDRAWAL_SETTLED':
      case 'WITHDRAWAL':
        friendlyType = 'Withdrawal Payout';
        break;
      case 'INVESTMENT_ALLOCATION':
        friendlyType = 'Plan Allocation';
        break;
      case 'RETURN_CREDIT':
        friendlyType = 'Monthly Interest Return (ROI)';
        break;
      case 'DAILY_BONUS_CREDIT':
        friendlyType = 'Daily Plan Bonus';
        break;
      case 'INVESTMENT_MATURITY':
        friendlyType = 'Principal Maturity Settlement';
        break;
      default:
        friendlyType = entry.entryType;
    }

    let walletLabel = 'Main Wallet';
    if (entry.walletType === 'INTEREST') {
      walletLabel = 'Interest Wallet';
    } else if (entry.walletType === 'DAILY_EARNING') {
      walletLabel = 'Daily Earnings Wallet';
    } else if (entry.walletType === 'MAIN') {
      walletLabel = 'Top Up Wallet';
    }

    return {
      id: entry.transactionReference,
      ledgerId: entry.id,
      type: friendlyType,
      rawType: entry.entryType,
      wallet: walletLabel,
      amount: Math.abs(entry.amount),
      isCredit,
      balanceAfter: entry.balanceAfter,
      currency: entry.currency,
      status: entry.status,
      date: entry.createdAt,
      metadata: entry.metadata
    };
  });

  return {
    transactions,
    pagination: ledgerData.pagination
  };
}

module.exports = {
  getUserWalletSummary,
  getUserBalance: getUserWalletSummary,
  getPaginatedLedger,
  getPaginatedTransactions
};
