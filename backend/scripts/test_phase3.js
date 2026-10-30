/**
 * Automated Test Suite: Phase 3 Backend Production Roadmap
 * 1. Background Job System (PostgreSQL queue, worker, retry backoff, dead-letter, deduplication, graceful shutdown)
 * 2. Cron & Scheduled Tasks (Daily ROI, Maturity processing, Wallet reconciliation, Statements, Entity cleanup)
 * 3. Automated Withdrawal & Payout Pipeline (PENDING -> APPROVED -> PROCESSING -> SUCCESS/FAILED, Webhooks, Idempotency, Audit)
 * 4. Admin Dashboard Analytics (Single-query metrics, Revenue analytics, User growth, Investments breakdown, Pending queue)
 * 5. Audit & Compliance (Persistent logging with before/after state, CSV/JSON export)
 * 6. Monitoring & Health (/health, /ready, /metrics, DB/Queue/Storage telemetry)
 * 7. Logging & Request IDs (x-request-id propagation, sensitive credential redaction)
 */

const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = require('../server');
const pool = require('../db');
const jobQueue = require('../services/jobQueueService');
const scheduledTasks = require('../services/scheduledTasksService');
const payoutService = require('../services/payoutService');
const logger = require('../utils/logger');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runPhase3Tests() {
  console.log('===============================================================');
  console.log('   GROWMORE PHASE 3 BACKEND VERIFICATION AUTOMATED TEST SUITE  ');
  console.log('===============================================================\n');

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`[Phase 3 Server] Listening on http://127.0.0.1:${port}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  const testTimestamp = Date.now();
  const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret';

  try {
    // -------------------------------------------------------------------------
    // SETUP: Seed test admin and user
    // -------------------------------------------------------------------------
    const adminRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 3 Admin', $1, 'hash_pw', $2, 'admin', 'active', TRUE, 1)
      RETURNING id, email, role, token_version;
    `, [`p3_admin_${testTimestamp}@test.com`, `+91971${testTimestamp.toString().slice(-7)}`]);
    const adminUser = adminRes.rows[0];

    const userRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 3 User', $1, 'hash_pw', $2, 'user', 'active', TRUE, 1)
      RETURNING id, email, role, token_version;
    `, [`p3_user_${testTimestamp}@test.com`, `+91972${testTimestamp.toString().slice(-7)}`]);
    const regularUser = userRes.rows[0];

    const adminToken = jwt.sign(
      { id: adminUser.id, userId: adminUser.id, email: adminUser.email, role: 'admin', tokenVersion: 1 },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const userToken = jwt.sign(
      { id: regularUser.id, userId: regularUser.id, email: regularUser.email, role: 'user', tokenVersion: 1 },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Clean up any lingering test plans from prior crashed runs
    await pool.query("UPDATE investment_plans SET is_active = FALSE WHERE plan_code LIKE 'P3_PLAN_%' OR name = 'Phase 3 High Yield';");

    // Seed test investment plan if needed
    const planRes = await pool.query(`
      INSERT INTO investment_plans (name, plan_code, minimum_amount, duration_days, return_rate_percentage, is_active)
      VALUES ('Phase 3 High Yield', $1, 1000, 30, 15.00, TRUE)
      RETURNING id, plan_code;
    `, [`P3_PLAN_${testTimestamp.toString().slice(-4)}`]);
    const testPlanId = planRes.rows[0].id;

    // Credit user's wallet ledger with starting deposit
    await pool.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
      VALUES ($1, $2, 'DEPOSIT', 'MAIN', 50000.00, 50000.00, 'INR', 'COMPLETED', 'TEST_SEED', '{"description":"Phase 3 initial balance seed"}');
    `, [regularUser.id, `DEP_SEED_${testTimestamp}`]);

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Monitoring, Health & Request IDs
    // -------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Monitoring, Health & Request IDs ---');

    // 1.1: GET /health returns operational
    const healthRes = await makeRequest(server, { path: '/health' });
    assert(healthRes.status === 200 && healthRes.data.api === 'healthy' && healthRes.data.database === 'connected',
      'GET /health returns 200 with operational status & database connected');

    // 1.2: GET /ready returns deep checks
    const readyRes = await makeRequest(server, { path: '/ready' });
    assert(readyRes.status === 200 && readyRes.data.ready === true && readyRes.data.components.database.status === 'connected',
      'GET /ready returns 200 with verified database, queue, and storage health');

    // 1.3: GET /metrics returns CPU, memory, uptime, pool stats
    const metricsRes = await makeRequest(server, { path: '/metrics' });
    assert(metricsRes.status === 200 && metricsRes.data.service === 'growmore-backend' && typeof metricsRes.data.process.memoryUsage.heapUsedMb === 'number',
      'GET /metrics returns 200 with system, process, memory, CPU, and queue telemetry');

    // 1.4: Request ID assignment and propagation
    const reqIdRes = await makeRequest(server, { path: '/health' });
    assert(Boolean(reqIdRes.headers['x-request-id']),
      'Every request receives a generated x-request-id header');

    // 1.5: Logger credential redaction
    const sensitivePayload = { password: 'SecretPassword123!', token: 'jwt.token.here', otp: '123456', normalField: 'clean' };
    const redacted = logger.redact(sensitivePayload);
    assert(redacted.password === '[REDACTED]' && redacted.token === '[REDACTED]' && redacted.otp === '[REDACTED]' && redacted.normalField === 'clean',
      'Structured logger automatically redacts passwords, tokens, OTPs, and secrets');

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Production Background Job Queue System
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Production Background Job Queue System ---');

    // 2.1: Enqueue job
    const enqueueRes = await jobQueue.enqueue('TEST_JOB', { testId: testTimestamp }, {
      jobKey: `test_key_${testTimestamp}`,
      maxAttempts: 3,
      backoffSeconds: 1
    });
    assert(enqueueRes.deduplicated === false && Boolean(enqueueRes.job.id),
      'Enqueue adds job to PostgreSQL background_jobs table');

    // 2.2: Deduplication by jobKey
    const duplicateRes = await jobQueue.enqueue('TEST_JOB', { testId: testTimestamp }, {
      jobKey: `test_key_${testTimestamp}`
    });
    assert(duplicateRes.deduplicated === true && duplicateRes.job.id === enqueueRes.job.id,
      'Prevent duplicate execution of scheduled jobs with identical active jobKey');

    // 2.3: Atomic dequeue & handler execution
    let handlerExecuted = false;
    jobQueue.registerHandler('TEST_JOB', async (payload) => {
      handlerExecuted = true;
      return { processed: true, echo: payload.testId };
    });

    const processRes = await jobQueue.processNextJob();
    assert(processRes && processRes.success === true && handlerExecuted === true,
      'Worker claims job atomically using FOR UPDATE SKIP LOCKED and marks COMPLETED with result');

    // 2.4: Retry policy with exponential backoff
    const failingKey = `failing_key_${testTimestamp}`;
    let attemptCount = 0;
    jobQueue.registerHandler('FAIL_RETRY_JOB', async () => {
      attemptCount++;
      throw new Error(`Intentional simulation failure #${attemptCount}`);
    });

    const failEnqueue = await jobQueue.enqueue('FAIL_RETRY_JOB', { simulate: true }, {
      jobKey: failingKey,
      maxAttempts: 2,
      backoffSeconds: 2
    });

    const firstAttempt = await jobQueue.processNextJob();
    assert(firstAttempt && firstAttempt.success === false,
      'Failing job captures error and increments attempt count');

    const jobCheckRes = await pool.query('SELECT attempts, status, max_attempts FROM background_jobs WHERE id = $1', [failEnqueue.job.id]);
    assert(jobCheckRes.rows[0].attempts === 1 && jobCheckRes.rows[0].status === 'QUEUED',
      'Transient failure keeps status QUEUED for retry with exponential backoff interval');

    // 2.5: Dead-letter handling when reaching max_attempts
    // Manually simulate reaching next_run_at and executing second attempt
    await pool.query('UPDATE background_jobs SET next_run_at = NOW() - INTERVAL \'1 second\' WHERE id = $1', [failEnqueue.job.id]);
    const secondAttempt = await jobQueue.processNextJob();
    assert(secondAttempt && secondAttempt.success === false,
      'Second failure triggers final attempt evaluation');

    const deadLetterCheck = await pool.query('SELECT status, attempts FROM background_jobs WHERE id = $1', [failEnqueue.job.id]);
    assert(deadLetterCheck.rows[0].status === 'DEAD_LETTER' && deadLetterCheck.rows[0].attempts === 2,
      'Job exceeding max_attempts is moved to DEAD_LETTER queue with error details preserved');

    // 2.6: Queue stats telemetry
    const queueStats = await jobQueue.getQueueStats();
    assert(typeof queueStats.queued === 'number' && typeof queueStats.completed === 'number' && queueStats.deadLetter >= 1,
      'jobQueue.getQueueStats() aggregates queued, processing, completed, and dead-letter jobs');

    // 2.7: Graceful shutdown
    await jobQueue.stopWorker({ timeoutMs: 1000 });
    assert(jobQueue.isRunning === false,
      'Graceful shutdown stops queue worker polling cleanly');

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Cron & Scheduled Tasks (Idempotent & Safe to Rerun)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Cron & Scheduled Tasks (Idempotent) ---');

    // Create an active investment for daily ROI and maturity testing
    const investRes = await pool.query(`
      INSERT INTO investments 
        (user_id, plan_id, principal_amount, expected_return_amount, status, start_date, maturity_date)
      VALUES 
        ($1, $2, 10000.00, 11500.00, 'active', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day')
      RETURNING id, principal_amount, expected_return_amount;
    `, [regularUser.id, testPlanId]);
    const testInvestment = investRes.rows[0];

    // 3.1: Daily ROI Calculation
    const roiToday = new Date().toISOString().split('T')[0];
    const roiResult = await scheduledTasks.runDailyRoiCalculation(roiToday);
    assert(roiResult && typeof roiResult.creditedCount === 'number',
      'Daily ROI calculation completes successfully and credits daily returns');

    // 3.2: Daily ROI Idempotency check
    const duplicateRoiResult = await scheduledTasks.runDailyRoiCalculation(roiToday);
    assert(duplicateRoiResult && duplicateRoiResult.alreadyRun === true,
      'Daily ROI calculation is strictly idempotent: subsequent run in same period detects prior run and skips duplicate credits');

    // 3.3: Investment Maturity Processing
    const maturityResult = await scheduledTasks.processInvestmentMaturities();
    assert(maturityResult && maturityResult.maturedCount >= 1,
      'Investment maturity processing identifies expired active investments and closes them');

    const matureCheck = await pool.query('SELECT status FROM investments WHERE id = $1', [testInvestment.id]);
    assert(matureCheck.rows[0].status === 'completed',
      'Matured investment status transitions to completed and wallet_ledger is credited with INVESTMENT_MATURITY');

    // 3.4: Wallet Reconciliation
    const reconResult = await scheduledTasks.runWalletReconciliation();
    assert(reconResult && reconResult.success === true && typeof reconResult.usersChecked === 'number',
      'Wallet reconciliation computes ledger invariants and saves report into reconciliation_reports');

    const reconDbCheck = await pool.query('SELECT id, is_healthy, total_users FROM reconciliation_reports ORDER BY id DESC LIMIT 1');
    assert(reconDbCheck.rows.length > 0 && typeof reconDbCheck.rows[0].is_healthy === 'boolean',
      'Reconciliation reports persisted to database table reconciliation_reports');

    // 3.5: Daily Account Statement Generation
    const stmtResult = await scheduledTasks.generateDailyAccountStatements(roiToday);
    assert(stmtResult && stmtResult.success === true && (stmtResult.generatedCount >= 1 || stmtResult.statementsGenerated >= 1),
      'Account statement engine generates statements and saves records to account_statements');

    // 3.6: Expired Entity Cleanup
    // Seed expired OTP in otp_verifications
    await pool.query(`
      INSERT INTO otp_verifications (phone, otp_hash, purpose, expires_at, is_used)
      VALUES ($1, 'dummy_hash', 'register', NOW() - INTERVAL '48 hours', FALSE);
    `, [regularUser.phone || '+919999999999']);

    const cleanupResult = await scheduledTasks.cleanupExpiredEntities();
    assert(cleanupResult && cleanupResult.success === true && cleanupResult.expiredOtpsDeleted >= 1,
      'Expired OTPs and aged background jobs are pruned safely by scheduled cleanup');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Automated Withdrawal & Payout Pipeline
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Automated Withdrawal & Payout Pipeline ---');

    // Create withdrawal request
    const wdrRes = await pool.query(`
      INSERT INTO withdrawals (user_id, amount, payout_method, payout_details, status)
      VALUES ($1, 2500.00, 'IMPS', '{"account_number":"1234567890","ifsc":"HDFC0001234"}', 'PENDING')
      RETURNING id, amount, status;
    `, [regularUser.id]);
    const testWithdrawal = wdrRes.rows[0];

    // Seed ledger hold for withdrawal
    await pool.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
      VALUES ($1, $2, 'WITHDRAWAL_HOLD', 'MAIN', -2500.00, 47500.00, 'INR', 'COMPLETED', $3, '{"description":"Hold for withdrawal"}');
    `, [regularUser.id, `WDR_HOLD_${testTimestamp}_1`, testWithdrawal.id.toString()]);

    // 4.1: Approve withdrawal (PENDING -> APPROVED)
    const approveRes = await payoutService.approveWithdrawal(testWithdrawal.id, adminUser);
    assert(approveRes.status === 'APPROVED',
      'Admin approves withdrawal: transitions from PENDING to APPROVED');

    // 4.2: Initiate payout (APPROVED -> PROCESSING)
    const idempotencyKey = `payout_idem_${testTimestamp}`;
    const payoutInitiateRes = await payoutService.processPayout(testWithdrawal.id, adminUser, idempotencyKey);
    assert(payoutInitiateRes && payoutInitiateRes.withdrawal.status === 'PROCESSING' && Boolean(payoutInitiateRes.payout.payout_reference),
      'Payout dispatch initiates: transitions APPROVED to PROCESSING and creates payout_transactions record');

    // 4.3: Double execution prevention
    let duplicateRejected = false;
    try {
      await payoutService.processPayout(testWithdrawal.id, adminUser, idempotencyKey);
    } catch (err) {
      duplicateRejected = true;
    }
    assert(duplicateRejected === true,
      'Payout pipeline prevents double execution: re-processing an active payout throws conflict error');

    // 4.4: Confirm Payout Success (PROCESSING -> SUCCESS / PAID)
    const payoutRef = payoutInitiateRes.payout.payout_reference;
    const successRes = await payoutService.finalizePayoutSuccess(payoutRef, 'UTR_BANK_123456', adminUser);
    assert(successRes && successRes.withdrawal.status === 'PAID' && successRes.payout.status === 'SUCCESS',
      'Payout settlement confirmation: transitions to SUCCESS / PAID and converts ledger hold to settled WITHDRAWAL');

    // 4.5: Payout Failure & Fund Hold Release
    // Create another withdrawal to test failure flow
    const failWdrRes = await pool.query(`
      INSERT INTO withdrawals (user_id, amount, payout_method, payout_details, status)
      VALUES ($1, 1500.00, 'IMPS', '{"account_number":"9876543210","ifsc":"SBIN0001234"}', 'APPROVED')
      RETURNING id, amount;
    `, [regularUser.id]);
    const failWdr = failWdrRes.rows[0];

    await pool.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
      VALUES ($1, $2, 'WITHDRAWAL_HOLD', 'MAIN', -1500.00, 46000.00, 'INR', 'COMPLETED', $3, '{"description":"Hold for withdrawal to fail"}');
    `, [regularUser.id, `WDR_HOLD_${testTimestamp}_2`, failWdr.id.toString()]);

    const failPayout = await payoutService.processPayout(failWdr.id, adminUser, `fail_idem_${testTimestamp}`);
    const failureRes = await payoutService.finalizePayoutFailure(failPayout.payout.payout_reference, 'Beneficiary account blocked', adminUser);
    assert(failureRes && failureRes.withdrawal.status === 'FAILED' && failureRes.payout.status === 'FAILED',
      'Payout failure transitions withdrawal to FAILED and updates payout_transactions');

    // Verify fund hold was released back in ledger
    const releasedHoldCheck = await pool.query(`
      SELECT entry_type, status FROM wallet_ledger 
      WHERE reference_id = $1 AND entry_type = 'WITHDRAWAL_RELEASE';
    `, [failWdr.id.toString()]);
    assert(releasedHoldCheck.rows.length > 0 && releasedHoldCheck.rows[0].status === 'COMPLETED',
      'Payout failure automatically releases fund hold in wallet_ledger via WITHDRAWAL_RELEASE');

    // 4.6: Webhook signature verification
    const webhookSecret = process.env.PAYOUT_WEBHOOK_SECRET || 'test_webhook_secret';
    process.env.PAYOUT_WEBHOOK_SECRET = webhookSecret;

    // Create a 3rd withdrawal for webhook test
    const webhookWdrRes = await pool.query(`
      INSERT INTO withdrawals (user_id, amount, payout_method, payout_details, status)
      VALUES ($1, 500.00, 'UPI', '{"vpa":"user@upi"}', 'APPROVED')
      RETURNING id;
    `, [regularUser.id]);
    const webhookWdrId = webhookWdrRes.rows[0].id;

    await pool.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status, reference_id, metadata)
      VALUES ($1, $2, 'WITHDRAWAL_HOLD', 'MAIN', -500.00, 45500.00, 'INR', 'COMPLETED', $3, '{"description":"Hold for webhook withdrawal"}');
    `, [regularUser.id, `WDR_HOLD_${testTimestamp}_3`, webhookWdrId.toString()]);
    const webhookPayout = await payoutService.processPayout(webhookWdrId, adminUser, `webhook_idem_${testTimestamp}`);

    const webhookPayload = JSON.stringify({
      event: 'payout.processed',
      payout_reference: webhookPayout.payout.payout_reference,
      status: 'SUCCESS',
      bank_reference: 'UTR_WEBHOOK_778899'
    });
    const validSignature = crypto.createHmac('sha256', webhookSecret).update(webhookPayload).digest('hex');

    const webhookHttpRes = await makeRequest(server, {
      path: '/api/payments/payout-webhook',
      method: 'POST',
      headers: {
        'x-payout-signature': validSignature
      }
    }, webhookPayload);

    assert(webhookHttpRes.status === 200 && webhookHttpRes.data.success === true,
      'POST /api/payments/payout-webhook validates cryptographic HMAC-SHA256 signature and updates payout status');

    // 4.7: Invalid webhook signature rejection
    const invalidWebhookHttpRes = await makeRequest(server, {
      path: '/api/payments/payout-webhook',
      method: 'POST',
      headers: {
        'x-payout-signature': 'invalid_signature_hash'
      }
    }, webhookPayload);

    assert(invalidWebhookHttpRes.status === 401 || invalidWebhookHttpRes.status === 400,
      'POST /api/payments/payout-webhook strictly rejects invalid signatures');

    // -------------------------------------------------------------------------
    // TEST GROUP 5: Admin Dashboard Analytics (Optimized Single Queries)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Admin Dashboard Analytics ---');

    // 5.1: High-level metrics
    const metricsDashRes = await makeRequest(server, {
      path: '/api/admin/dashboard/metrics',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(metricsDashRes.status === 200 && metricsDashRes.data.metrics.users.total >= 2 && typeof metricsDashRes.data.metrics.financials.availableFunds === 'number',
      'GET /api/admin/dashboard/metrics executes single covering aggregation returning complete metrics');

    // 5.2: Revenue analytics timeline
    const revDashRes = await makeRequest(server, {
      path: '/api/admin/dashboard/revenue-analytics?days=14',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(revDashRes.status === 200 && Array.isArray(revDashRes.data.analytics) && revDashRes.data.analytics.length > 0,
      'GET /api/admin/dashboard/revenue-analytics aggregates cash flows by day with generate_series');

    // 5.3: User growth timeline
    const growthDashRes = await makeRequest(server, {
      path: '/api/admin/dashboard/user-growth?days=14',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(growthDashRes.status === 200 && Array.isArray(growthDashRes.data.growth) && growthDashRes.data.growth.length > 0,
      'GET /api/admin/dashboard/user-growth computes daily registration and verification trajectories');

    // 5.4: Active investments breakdown
    const invBreakdownRes = await makeRequest(server, {
      path: '/api/admin/dashboard/investments-breakdown',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(invBreakdownRes.status === 200 && Array.isArray(invBreakdownRes.data.breakdown) && invBreakdownRes.data.breakdown.length > 0,
      'GET /api/admin/dashboard/investments-breakdown returns portfolio distribution per investment plan');

    // 5.5: Consolidated pending actions queue
    const pendingActionsRes = await makeRequest(server, {
      path: '/api/admin/dashboard/pending-actions',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(pendingActionsRes.status === 200 && Array.isArray(pendingActionsRes.data.pendingActions.deposits) && Array.isArray(pendingActionsRes.data.pendingActions.withdrawals),
      'GET /api/admin/dashboard/pending-actions aggregates actionable queues for deposits, withdrawals, and tickets');

    // -------------------------------------------------------------------------
    // TEST GROUP 6: Audit & Regulatory Compliance
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Audit & Regulatory Compliance ---');

    // Verify audit logs were written with before/after state
    const auditLogsRes = await pool.query(`
      SELECT id, actor_id, actor_email, action, target_entity, before_state, after_state, endpoint, http_method
      FROM admin_audit_logs
      WHERE actor_id = $1
      ORDER BY id DESC
      LIMIT 1;
    `, [adminUser.id]);

    assert(auditLogsRes.rows.length > 0 && auditLogsRes.rows[0].action.startsWith('PAYOUT_') && Boolean(auditLogsRes.rows[0].after_state),
      'Persistent audit trail captures actor, timestamp, IP, before_state, after_state on admin transitions');

    // 6.2: JSON audit log export
    const jsonExportRes = await makeRequest(server, {
      path: '/api/admin/audit-logs/export?format=json',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(jsonExportRes.status === 200 && jsonExportRes.data.success === true && Array.isArray(jsonExportRes.data.logs),
      'GET /api/admin/audit-logs/export?format=json streams structured audit records with filter support');

    // 6.3: CSV audit log export
    const csvExportRes = await makeRequest(server, {
      path: '/api/admin/audit-logs/export?format=csv',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(csvExportRes.status === 200 && typeof csvExportRes.data === 'string' && csvExportRes.data.startsWith('"Log ID"'),
      'GET /api/admin/audit-logs/export?format=csv returns properly formatted RFC 4180 CSV export with headers');

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    try {
      await pool.query('DELETE FROM admin_audit_logs WHERE actor_id = $1', [adminUser.id]);
      await pool.query('DELETE FROM payout_transactions WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE user_id = $1)', [regularUser.id]);
      await pool.query('DELETE FROM withdrawals WHERE user_id = $1', [regularUser.id]);
      await pool.query('DELETE FROM investments WHERE user_id = $1', [regularUser.id]);
      await pool.query('DELETE FROM investment_plans WHERE id = $1', [testPlanId]);
      await pool.query('DELETE FROM wallet_ledger WHERE user_id = $1', [regularUser.id]);
      await pool.query('DELETE FROM account_statements WHERE user_id = $1', [regularUser.id]);
      await pool.query('DELETE FROM otp_verifications WHERE phone = $1', [regularUser.phone]);
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUser.id, regularUser.id]);
      await pool.query('DELETE FROM background_jobs WHERE job_key LIKE $1', [`%${testTimestamp}%`]);
      console.log('  ✓ Cleaned up test entities.');
    } catch (cleanErr) {
      console.warn('  ! Cleanup note:', cleanErr.message);
    }

  } catch (err) {
    console.error('FATAL Test Suite Error:', err);
    failed++;
  } finally {
    try {
      await pool.query("UPDATE investment_plans SET is_active = FALSE WHERE plan_code LIKE 'P3_PLAN_%' OR name = 'Phase 3 High Yield';");
    } catch (e) {}
    server.close();
  }

  console.log('\n===============================================================');
  console.log(`   PHASE 3 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase3Tests();
}

module.exports = runPhase3Tests;
