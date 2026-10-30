const pool = require('../db');
const returnBatchService = require('./returnBatchService');
const walletService = require('./walletService');
const jobQueue = require('./jobQueueService');
const logger = require('../utils/logger');

class ScheduledTasksService {
  constructor() {
    this.schedulerTimer = null;
  }

  /**
   * Helper to ensure idempotency and record execution in scheduled_job_runs
   */
  async executeTrackedTask(jobName, runKey, taskFn) {
    const client = await pool.connect();
    let runId = null;

    try {
      // 1. Check if this run has already completed (Idempotency check)
      const existingRes = await client.query(`
        SELECT id, job_name, run_key, status, summary, completed_at
        FROM scheduled_job_runs
        WHERE run_key = $1;
      `, [runKey]);

      if (existingRes.rows.length > 0 && existingRes.rows[0].status === 'COMPLETED') {
        logger.info(`Scheduled task already completed (idempotent skip): ${runKey}`);
        return {
          skipped: true,
          alreadyRun: true,
          success: true,
          reason: 'ALREADY_COMPLETED',
          summary: existingRes.rows[0].summary,
          ...(existingRes.rows[0].summary || {})
        };
      }

      // 2. Insert or update run record as RUNNING
      const upsertRunQuery = `
        INSERT INTO scheduled_job_runs (job_name, run_key, status, started_at)
        VALUES ($1, $2, 'RUNNING', NOW())
        ON CONFLICT (run_key) DO UPDATE
          SET status = 'RUNNING', started_at = NOW(), error_message = NULL
        RETURNING id;
      `;
      const runRes = await client.query(upsertRunQuery, [jobName, runKey]);
      runId = runRes.rows[0].id;
    } finally {
      client.release();
    }

    // 3. Execute task body
    try {
      const summary = await taskFn();

      await pool.query(`
        UPDATE scheduled_job_runs
        SET status = 'COMPLETED',
            summary = $1,
            completed_at = NOW()
        WHERE id = $2;
      `, [JSON.stringify(summary || {}), runId]);

      logger.info(`Scheduled task finished: ${runKey}`, { summary });
      return {
        skipped: false,
        alreadyRun: false,
        success: true,
        summary,
        ...(summary || {})
      };
    } catch (err) {
      logger.error(`Scheduled task failed: ${runKey} - ${err.message}`, { error: err });
      await pool.query(`
        UPDATE scheduled_job_runs
        SET status = 'FAILED',
            error_message = $1,
            completed_at = NOW()
        WHERE id = $2;
      `, [err.stack || err.message, runId]);
      throw err;
    }
  }

  /**
   * 1. Daily Bonus Credit (₹99 for Daily Plan, ₹300 for Super Plan)
   */
  async runDailyBonusCalculation(targetDate = null) {
    const today = targetDate || new Date().toISOString().split('T')[0];
    const runKey = `daily_bonus:${today}`;

    return this.executeTrackedTask('DAILY_BONUS_CREDIT', runKey, async () => {
      const result = await returnBatchService.processDailyBonusBatch({ targetDate: today });
      return result;
    });
  }

  /**
   * 2. Monthly ROI / Return Calculations (Basic 10%, VIP 12%, Daily 18%, Super 20%)
   */
  async runDailyRoiCalculation(periodKey = null) {
    const key = periodKey || new Date().toISOString().slice(0, 7); // e.g. '2026-10'
    const runKey = `daily_roi:${key}`;

    return this.executeTrackedTask('DAILY_ROI_CALCULATION', runKey, async () => {
      const batchResult = await returnBatchService.processBatch({
        periodKey: key,
        adminId: null
      });
      return {
        ...batchResult,
        creditedCount: batchResult.totalCalculated || 0
      };
    });
  }

  /**
   * 3. Combined Midnight Run (Executes at 12:00 AM every night)
   */
  async runMidnightCalculations(targetDate = null) {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    logger.info(`[Midnight Scheduler] Starting automatic midnight run for ${dateStr}...`);

    const bonusResult = await this.runDailyBonusCalculation(dateStr);
    const maturityResult = await this.processInvestmentMaturities();
    
    // Also run monthly ROI for current month window
    const currentMonth = dateStr.slice(0, 7);
    const roiResult = await this.runDailyRoiCalculation(currentMonth);

    logger.info(`[Midnight Scheduler] Midnight calculations finished for ${dateStr}.`, {
      dailyBonus: bonusResult,
      roi: roiResult,
      maturities: maturityResult
    });

    return {
      date: dateStr,
      dailyBonus: bonusResult,
      roi: roiResult,
      maturities: maturityResult
    };
  }

  /**
   * 4. Investment Maturity Processing (Only releases principal if 365 days completed!)
   */
  async processInvestmentMaturities() {
    const today = new Date().toISOString().split('T')[0];
    const runKey = `investment_maturity:${today}`;

    return this.executeTrackedTask('INVESTMENT_MATURITY_PROCESSING', runKey, async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // STRICT INVARIANT: Find active investments where maturity_date (365 days) has passed
        const matureQuery = `
          SELECT id, user_id, plan_id, principal_amount, currency, maturity_date
          FROM investments
          WHERE status = 'active'
            AND maturity_date IS NOT NULL
            AND maturity_date <= NOW()
          FOR UPDATE SKIP LOCKED;
        `;

        const matureRes = await client.query(matureQuery);
        let maturedCount = 0;
        let totalPrincipalReleased = 0;

        for (const inv of matureRes.rows) {
          const principal = parseFloat(inv.principal_amount);

          const balRes = await client.query(`
            SELECT COALESCE(SUM(amount), 0.00) AS available_balance
            FROM wallet_ledger
            WHERE user_id = $1 AND (wallet_type = 'MAIN' OR wallet_type IS NULL) AND status = 'COMPLETED';
          `, [inv.user_id]);

          const currentBal = parseFloat(balRes.rows[0].available_balance) || 0;
          const newBal = parseFloat((currentBal + principal).toFixed(2));

          const ledgerRef = `MATURITY-${inv.id}-${Date.now()}`;
          await client.query(`
            INSERT INTO wallet_ledger
              (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
            VALUES
              ($1, $2, 'INVESTMENT_MATURITY', 'MAIN', $3, $4, $5, 'COMPLETED', $6, $7);
          `, [
            inv.user_id,
            ledgerRef,
            principal,
            newBal,
            inv.currency || 'INR',
            String(inv.id),
            JSON.stringify({ investmentId: inv.id, planId: inv.plan_id, maturitySettlement: true, fullTermCompleted: true })
          ]);

          await client.query(`
            UPDATE investments
            SET status = 'completed', updated_at = NOW()
            WHERE id = $1;
          `, [inv.id]);

          maturedCount++;
          totalPrincipalReleased += principal;
        }

        await client.query('COMMIT');

        return {
          maturedCount,
          totalPrincipalReleased
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  }

  /**
   * 5. Wallet Invariant Reconciliation & Reporting
   */
  async runWalletReconciliation() {
    const today = new Date().toISOString().split('T')[0];
    const runKey = `wallet_reconciliation:${today}`;

    return this.executeTrackedTask('WALLET_RECONCILIATION', runKey, async () => {
      const recon = await returnBatchService.runFinancialReconciliation();

      await pool.query(`
        INSERT INTO reconciliation_reports 
          (is_healthy, total_users, total_system_balance, negative_balances_found, duplicate_references_found, report_details)
        VALUES 
          ($1, $2, $3, $4, $5, $6);
      `, [
        recon.isHealthy,
        recon.platformMetrics?.totalUsers || 0,
        parseFloat(recon.platformMetrics?.totalAvailableBalanceAcrossUsers || 0),
        (recon.flaggedIssues?.negativeBalanceUsers || []).length,
        (recon.flaggedIssues?.duplicateReferences || []).length,
        JSON.stringify(recon)
      ]);

      return recon;
    });
  }

  /**
   * 6. Daily Account Statement Generation
   */
  async generateDailyAccountStatements(statementDate = null) {
    const dateStr = statementDate || new Date().toISOString().split('T')[0];
    const runKey = `account_statements:${dateStr}`;

    return this.executeTrackedTask('ACCOUNT_STATEMENTS_GENERATION', runKey, async () => {
      const usersRes = await pool.query(`
        SELECT id, full_name, email, account_status FROM users WHERE account_status = 'active';
      `);

      let generatedCount = 0;

      for (const u of usersRes.rows) {
        const bal = await walletService.getUserBalance(u.id);

        await pool.query(`
          INSERT INTO account_statements
            (user_id, statement_period, statement_date, opening_balance, total_deposits, total_withdrawals, total_returns, closing_balance, total_portfolio, active_investments_count, statement_metadata)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (user_id, statement_date) DO UPDATE
            SET total_deposits = EXCLUDED.total_deposits,
                total_withdrawals = EXCLUDED.total_withdrawals,
                total_returns = EXCLUDED.total_returns,
                closing_balance = EXCLUDED.closing_balance,
                total_portfolio = EXCLUDED.total_portfolio,
                active_investments_count = EXCLUDED.active_investments_count,
                statement_metadata = EXCLUDED.statement_metadata;
        `, [
          u.id,
          dateStr,
          dateStr,
          bal.availableBalance,
          bal.totalDeposited,
          bal.totalWithdrawn,
          bal.totalReturnsCredited,
          bal.availableBalance,
          bal.totalPortfolio,
          bal.activePlansCount,
          JSON.stringify({ generatedAt: new Date().toISOString(), userEmail: u.email })
        ]);

        generatedCount++;
      }

      return {
        statementDate: dateStr,
        generatedCount
      };
    });
  }

  /**
   * 7. Cleanup of expired OTPs, temporary logs, and stale records
   */
  async cleanupExpiredEntities() {
    const today = new Date().toISOString().split('T')[0];
    const runKey = `cleanup_expired:${today}`;

    return this.executeTrackedTask('CLEANUP_EXPIRED_ENTITIES', runKey, async () => {
      const otpRes = await pool.query(`
        DELETE FROM otp_verifications
        WHERE expires_at < NOW() - INTERVAL '24 hours';
      `);

      const jobsRes = await pool.query(`
        DELETE FROM background_jobs
        WHERE status IN ('COMPLETED', 'DEAD_LETTER')
          AND created_at < NOW() - INTERVAL '14 days';
      `);

      return {
        expiredOtpsDeleted: otpRes.rowCount || 0,
        oldJobsPruned: jobsRes.rowCount || 0
      };
    });
  }

  /**
   * Start Midnight 12:00 AM Automatic Scheduler Loop
   * Checks every 30 seconds. When calendar day advances past midnight,
   * runs the daily bonus & monthly ROI calculation automatically.
   */
  startMidnightScheduler() {
    if (this.schedulerTimer) return;

    logger.info('[Midnight Scheduler] Automatic 12:00 AM Cron Engine initialized.');

    // Immediate check on startup to ensure today's bonus has been credited
    const today = new Date().toISOString().split('T')[0];
    this.runMidnightCalculations(today).catch(err => {
      logger.error(`[Midnight Scheduler] Startup verification error: ${err.message}`);
    });

    // Check every 30 seconds for 12:00 AM crossover
    this.schedulerTimer = setInterval(() => {
      const currentDate = new Date().toISOString().split('T')[0];
      this.runMidnightCalculations(currentDate).catch(err => {
        logger.error(`[Midnight Scheduler] Periodic execution error: ${err.message}`);
      });
    }, 30000);
  }

  stopMidnightScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /**
   * Register scheduled job handlers into background job queue
   */
  registerQueueHandlers() {
    jobQueue.registerHandler('DAILY_BONUS_CREDIT', async (payload) => {
      return this.runDailyBonusCalculation(payload.targetDate);
    });

    jobQueue.registerHandler('DAILY_ROI_CALCULATION', async (payload) => {
      return this.runDailyRoiCalculation(payload.periodKey);
    });

    jobQueue.registerHandler('INVESTMENT_MATURITY_PROCESSING', async () => {
      return this.processInvestmentMaturities();
    });

    jobQueue.registerHandler('WALLET_RECONCILIATION', async () => {
      return this.runWalletReconciliation();
    });

    jobQueue.registerHandler('ACCOUNT_STATEMENTS_GENERATION', async (payload) => {
      return this.generateDailyAccountStatements(payload.statementDate);
    });

    jobQueue.registerHandler('CLEANUP_EXPIRED_ENTITIES', async () => {
      return this.cleanupExpiredEntities();
    });
  }
}

const scheduledTasksService = new ScheduledTasksService();
scheduledTasksService.registerQueueHandlers();

module.exports = scheduledTasksService;
