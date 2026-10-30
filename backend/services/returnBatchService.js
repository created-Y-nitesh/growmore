const pool = require('../db');
const returnCalculatorService = require('./returnCalculatorService');
const walletService = require('./walletService');
const logger = require('../utils/logger');

/**
 * Return Batch Processing & Financial Reconciliation Service
 * Computes scheduled returns for active investments, enforces idempotency,
 * and maintains financial balance invariants across the platform.
 */
class ReturnBatchService {
  /**
   * Process daily bonus batch (₹99 for Daily Plan, ₹300 for Super Plan)
   * Runs at midnight 12:00 AM every night.
   * @param {Object} options
   * @param {string} options.targetDate - e.g. '2026-10-30'
   */
  async processDailyBonusBatch({ targetDate = new Date().toISOString().split('T')[0] }) {
    const client = await pool.connect();
    const summary = {
      targetDate,
      totalEvaluated: 0,
      totalCredited: 0,
      totalSkippedAlreadyCredited: 0,
      totalBonusAmount: 0.00,
      creditedEntries: [],
      errors: []
    };

    try {
      // Find all active investments belonging to Daily or Super tiers
      const query = `
        SELECT 
          i.id, i.user_id, i.principal_amount, i.currency, i.start_date, i.maturity_date,
          p.plan_code, p.name AS plan_name
        FROM investments i
        JOIN investment_plans p ON i.plan_id = p.id
        WHERE i.status = 'active'
          AND (
            UPPER(p.plan_code) IN ('DAILY', 'SUPER') 
            OR p.name ILIKE '%daily%' 
            OR p.name ILIKE '%super%'
          )
        ORDER BY i.id ASC;
      `;

      const res = await client.query(query);
      summary.totalEvaluated = res.rows.length;

      for (const inv of res.rows) {
        try {
          const isSuper = (inv.plan_code && inv.plan_code.toUpperCase() === 'SUPER') || 
                          (inv.plan_name && inv.plan_name.toLowerCase().includes('super'));
          const bonusAmount = isSuper ? 300.00 : 99.00;
          const txnRef = `DAILY_BONUS_${inv.id}_${targetDate}`;

          // Check if already credited for this date & investment (Idempotency)
          const checkRes = await client.query(
            'SELECT id FROM wallet_ledger WHERE transaction_reference = $1 LIMIT 1;',
            [txnRef]
          );

          if (checkRes.rows.length > 0) {
            summary.totalSkippedAlreadyCredited++;
            continue;
          }

          await client.query('BEGIN');

          // Fetch user's current daily earning balance inside transaction
          const balRes = await client.query(`
            SELECT COALESCE(SUM(amount), 0.00) AS balance
            FROM wallet_ledger
            WHERE user_id = $1 AND wallet_type = 'DAILY_EARNING' AND status = 'COMPLETED';
          `, [inv.user_id]);

          const currentDailyBal = parseFloat(balRes.rows[0].balance) || 0.00;
          const newDailyBal = parseFloat((currentDailyBal + bonusAmount).toFixed(2));

          // Insert into immutable wallet_ledger
          await client.query(`
            INSERT INTO wallet_ledger
              (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
            VALUES
              ($1, $2, 'DAILY_BONUS_CREDIT', 'DAILY_EARNING', $3, $4, 'INR', 'COMPLETED', $5, $6);
          `, [
            inv.user_id,
            txnRef,
            bonusAmount,
            newDailyBal,
            String(inv.id),
            JSON.stringify({
              investmentId: inv.id,
              planCode: inv.plan_code,
              planName: inv.plan_name,
              bonusDate: targetDate,
              bonusAmount
            })
          ]);

          await client.query('COMMIT');

          summary.totalCredited++;
          summary.totalBonusAmount += bonusAmount;
          summary.creditedEntries.push({
            investmentId: inv.id,
            userId: inv.user_id,
            planName: inv.plan_name,
            bonusAmount,
            newDailyBal
          });
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`Error processing daily bonus for investment ${inv.id}: ${err.message}`);
          summary.errors.push({ investmentId: inv.id, error: err.message });
        }
      }

      summary.totalBonusAmount = parseFloat(summary.totalBonusAmount.toFixed(2));
      return summary;
    } finally {
      client.release();
    }
  }

  /**
   * Run scheduled return calculations for active investments
   * (Basic: 10%, VIP: 12%, Daily: 18%, Super: 20%)
   * Credited directly to wallet_type: 'INTEREST'
   */
  async processBatch({ periodKey = new Date().toISOString().slice(0, 7), adminId = null }) {
    const client = await pool.connect();

    const summary = {
      periodKey,
      totalEvaluated: 0,
      totalCalculated: 0,
      totalSkippedDuplicate: 0,
      totalCreditedAmount: '0.00',
      totalEstimatedYield: '0.00',
      processedEntries: [],
      errors: []
    };

    try {
      const invRes = await client.query(`
        SELECT 
          i.id, i.user_id, i.principal_amount, i.currency, i.status, 
          i.start_date, i.maturity_date, i.terms_snapshot, i.plan_name,
          p.plan_code, p.return_rate_percentage, p.duration_days
        FROM investments i
        LEFT JOIN investment_plans p ON i.plan_id = p.id
        WHERE i.status = 'active'
        ORDER BY i.id ASC
      `);

      summary.totalEvaluated = invRes.rows.length;
      let totalEstPaise = 0;
      let totalCredPaise = 0;

      for (const inv of invRes.rows) {
        const idempotencyKey = `RET_${inv.id}_${periodKey}`;

        // Idempotency check: see if return entry already credited
        const existing = await client.query(
          'SELECT id, status, amount FROM return_entries WHERE idempotency_key = $1',
          [idempotencyKey]
        );

        if (existing.rows.length > 0) {
          summary.totalSkippedDuplicate++;
          continue;
        }

        // Determine rate: Basic 10%, VIP 12%, Daily 18%, Super 20%
        let rate = 10.0;
        const code = (inv.plan_code || '').toUpperCase();
        const pName = (inv.plan_name || '').toLowerCase();

        if (code === 'SUPER' || pName.includes('super')) {
          rate = 20.0;
        } else if (code === 'DAILY' || pName.includes('daily')) {
          rate = 18.0;
        } else if (code === 'VIP' || pName.includes('vip')) {
          rate = 12.0;
        } else if (code === 'BASIC' || pName.includes('basic')) {
          rate = 10.0;
        } else if (inv.return_rate_percentage) {
          rate = parseFloat(inv.return_rate_percentage);
        }

        const principal = parseFloat(inv.principal_amount);
        // Monthly interest amount = Principal * (Rate / 100)
        const returnAmount = parseFloat((principal * (rate / 100)).toFixed(2));
        const returnPaise = Math.round(returnAmount * 100);
        totalEstPaise += returnPaise;

        await client.query('BEGIN');

        // Record in return_entries table
        const entryRes = await client.query(
          `INSERT INTO return_entries 
            (investment_id, user_id, amount, currency, calculation_period, status, idempotency_key, rate_applied, principal_base, is_estimate, audit_metadata)
           VALUES 
            ($1, $2, $3, $4, $5, 'CREDITED', $6, $7, $8, FALSE, $9)
           RETURNING id`,
          [
            inv.id,
            inv.user_id,
            returnAmount,
            inv.currency || 'INR',
            periodKey,
            idempotencyKey,
            rate,
            principal,
            JSON.stringify({
              calculatedAt: new Date().toISOString(),
              adminId,
              planCode: inv.plan_code,
              formula: 'Principal * (MonthlyRate / 100)'
            })
          ]
        );

        // Fetch current Interest Balance
        const interestBalRes = await client.query(`
          SELECT COALESCE(SUM(amount), 0.00) AS balance
          FROM wallet_ledger
          WHERE user_id = $1 
            AND (wallet_type = 'INTEREST' OR (wallet_type = 'MAIN' AND entry_type = 'RETURN_CREDIT'))
            AND status = 'COMPLETED';
        `, [inv.user_id]);

        const currentInterestBal = parseFloat(interestBalRes.rows[0].balance) || 0.00;
        const newInterestBal = parseFloat((currentInterestBal + returnAmount).toFixed(2));
        const txRef = `RET_${inv.id}_${periodKey}`;

        // Credit to wallet_ledger under 'INTEREST' wallet
        await client.query(
          `INSERT INTO wallet_ledger 
            (user_id, transaction_reference, reference_id, entry_type, wallet_type, amount, balance_after, currency, status, metadata)
           VALUES 
            ($1, $2, $3, 'RETURN_CREDIT', 'INTEREST', $4, $5, $6, 'COMPLETED', $7)`,
          [
            inv.user_id,
            txRef,
            entryRes.rows[0].id.toString(),
            returnAmount,
            newInterestBal,
            inv.currency || 'INR',
            JSON.stringify({
              investmentId: inv.id,
              periodKey,
              rate,
              planName: inv.plan_name
            })
          ]
        );
        totalCredPaise += returnPaise;

        await client.query('COMMIT');

        summary.totalCalculated++;
        summary.processedEntries.push({
          investmentId: inv.id,
          userId: inv.user_id,
          amount: returnAmount,
          rate,
          status: 'CREDITED',
          idempotencyKey
        });
      }

      summary.totalEstimatedYield = (totalEstPaise / 100).toFixed(2);
      summary.totalCreditedAmount = (totalCredPaise / 100).toFixed(2);

      return summary;
    } catch (err) {
      await client.query('ROLLBACK');
      summary.errors.push(err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run authoritative platform-wide financial reconciliation audit
   */
  async runFinancialReconciliation() {
    const client = await pool.connect();
    try {
      const ledgerByType = await client.query(`
        SELECT 
          entry_type,
          wallet_type,
          COUNT(*) as entry_count,
          COALESCE(SUM(amount), 0.00) as total_amount
        FROM wallet_ledger
        GROUP BY entry_type, wallet_type
      `);

      const invTotal = await client.query(`
        SELECT 
          COUNT(*) as total_investments,
          COALESCE(SUM(principal_amount), 0.00) as total_principal
        FROM investments
        WHERE status = 'active'
      `);

      const usersRes = await client.query('SELECT id, full_name, email FROM users');
      const negativeBalanceUsers = [];
      let totalPlatformAvailable = 0;
      let totalPlatformHolds = 0;

      for (const u of usersRes.rows) {
        const bal = await walletService.getUserBalance(u.id);
        const avail = Number(bal.availableBalance);
        const holds = Number(bal.pendingWithdrawals);
        if (avail < 0) {
          negativeBalanceUsers.push({
            userId: u.id,
            email: u.email,
            negativeBalance: avail
          });
        }
        totalPlatformAvailable += avail;
        totalPlatformHolds += holds;
      }

      const duplicateRefs = await client.query(`
        SELECT transaction_reference, COUNT(*)
        FROM wallet_ledger
        GROUP BY transaction_reference
        HAVING COUNT(*) > 1
      `);

      const hasDiscrepancies = negativeBalanceUsers.length > 0 || duplicateRefs.rows.length > 0;

      return {
        timestamp: new Date().toISOString(),
        isHealthy: !hasDiscrepancies,
        invariants: {
          noNegativeBalances: negativeBalanceUsers.length === 0,
          noDuplicateTransactionReferences: duplicateRefs.rows.length === 0
        },
        platformMetrics: {
          totalUsers: usersRes.rows.length,
          totalActiveInvestments: parseInt(invTotal.rows[0].total_investments, 10),
          totalActivePrincipal: parseFloat(invTotal.rows[0].total_principal).toFixed(2),
          totalAvailableBalanceAcrossUsers: totalPlatformAvailable.toFixed(2),
          totalPendingWithdrawalHolds: totalPlatformHolds.toFixed(2)
        },
        ledgerBreakdown: ledgerByType.rows.map(r => ({
          entryType: r.entry_type,
          walletType: r.wallet_type,
          count: parseInt(r.entry_count, 10),
          amount: parseFloat(r.total_amount).toFixed(2)
        })),
        flaggedIssues: {
          negativeBalanceUsers,
          duplicateReferences: duplicateRefs.rows
        }
      };
    } finally {
      client.release();
    }
  }
}

module.exports = new ReturnBatchService();
