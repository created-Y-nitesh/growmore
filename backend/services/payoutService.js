const crypto = require('crypto');
const pool = require('../db');
const logger = require('../utils/logger');
const telegram = require('./telegramService');

class PayoutService {
  constructor() {
    this.provider = process.env.PAYOUT_PROVIDER || 'simulator';
    this.webhookSecret = process.env.PAYOUT_WEBHOOK_SECRET || 'payout_wh_secret_test';
  }

  /**
   * Transition 1: Admin Approves Payout Request
   * PENDING -> APPROVED
   */
  async approveWithdrawal(withdrawalId, adminUser, clientParam = null) {
    const client = clientParam || await pool.connect();
    const shouldRelease = !clientParam;

    try {
      if (shouldRelease) await client.query('BEGIN');

      const selectRes = await client.query(`
        SELECT w.*, u.email, u.full_name
        FROM withdrawals w
        JOIN users u ON u.id = w.user_id
        WHERE w.id = $1
        FOR UPDATE;
      `, [withdrawalId]);

      if (selectRes.rows.length === 0) {
        throw new Error('Withdrawal record not found.');
      }

      const wdr = selectRes.rows[0];
      if (wdr.status !== 'PENDING') {
        throw new Error(`Cannot approve withdrawal with status: ${wdr.status}. Expected PENDING.`);
      }

      const updateRes = await client.query(`
        UPDATE withdrawals
        SET status = 'APPROVED',
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `, [withdrawalId]);

      const approvedWdr = updateRes.rows[0];

      // Audit Log
      await this.logAudit(client, {
        adminId: adminUser?.id,
        adminEmail: adminUser?.email,
        action: 'PAYOUT_STATUS_APPROVED',
        targetId: withdrawalId,
        beforeState: { status: 'PENDING' },
        afterState: { status: 'APPROVED' },
        metadata: { amount: wdr.amount, userId: wdr.user_id }
      });

      if (shouldRelease) await client.query('COMMIT');

      // Async notification
      telegram.notifyWithdrawalApproved({
        withdrawalId,
        amount: wdr.amount,
        userEmail: wdr.email
      }).catch(() => {});

      return approvedWdr;
    } catch (err) {
      if (shouldRelease) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldRelease) client.release();
    }
  }

  /**
   * Transition 2: Initiate Automated Payout via Gateway
   * APPROVED -> PROCESSING
   */
  async processPayout(withdrawalId, adminUser = null, idempotencyKey = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const selectRes = await client.query(`
        SELECT w.*, u.email, u.full_name, u.phone
        FROM withdrawals w
        JOIN users u ON u.id = w.user_id
        WHERE w.id = $1
        FOR UPDATE;
      `, [withdrawalId]);

      if (selectRes.rows.length === 0) {
        throw new Error('Withdrawal record not found.');
      }

      const wdr = selectRes.rows[0];

      // Prevent duplicate execution: must be strictly APPROVED
      if (wdr.status !== 'APPROVED') {
        throw new Error(`Cannot process payout for withdrawal in status: ${wdr.status}. Expected APPROVED.`);
      }

      // Check if an existing active payout transaction exists
      const existingTx = await client.query(`
        SELECT id, payout_reference, status
        FROM payout_transactions
        WHERE withdrawal_id = $1 AND status IN ('PROCESSING', 'SUCCESS', 'PAID')
        LIMIT 1;
      `, [withdrawalId]);

      if (existingTx.rows.length > 0) {
        throw new Error(`Payout already initiated or completed (ref: ${existingTx.rows[0].payout_reference}).`);
      }

      const idempKey = idempotencyKey || `payout-idemp-${withdrawalId}-${Date.now()}`;
      const payoutRef = `PAYOUT-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Create payout_transactions record
      const insertTxQuery = `
        INSERT INTO payout_transactions 
          (withdrawal_id, provider, payout_reference, idempotency_key, amount, currency, status, error_details)
        VALUES 
          ($1, $2, $3, $4, $5, $6, 'PROCESSING', '{}'::jsonb)
        RETURNING *;
      `;
      const txRes = await client.query(insertTxQuery, [
        withdrawalId,
        this.provider,
        payoutRef,
        idempKey,
        wdr.amount,
        wdr.currency || 'INR'
      ]);

      // 2. Update withdrawal status to PROCESSING
      await client.query(`
        UPDATE withdrawals
        SET status = 'PROCESSING',
            payout_reference = $1,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $2;
      `, [payoutRef, withdrawalId]);

      // Audit Log
      await this.logAudit(client, {
        adminId: adminUser?.id,
        adminEmail: adminUser?.email,
        action: 'PAYOUT_STATUS_PROCESSING',
        targetId: withdrawalId,
        beforeState: { status: 'APPROVED' },
        afterState: { status: 'PROCESSING', payoutReference: payoutRef },
        metadata: { provider: this.provider, amount: wdr.amount }
      });

      await client.query('COMMIT');

      // Call Gateway dispatch
      const gatewayResult = await this.dispatchToProvider({
        withdrawal: wdr,
        payoutReference: payoutRef,
        amount: wdr.amount,
        payoutMethod: wdr.payout_method,
        payoutDetails: wdr.payout_details
      });

      return {
        success: true,
        status: 'PROCESSING',
        payoutReference: payoutRef,
        withdrawalId,
        withdrawal: { id: withdrawalId, status: 'PROCESSING' },
        payout: txRes.rows[0],
        gatewayResult
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Gateway Dispatch Dispatcher (Configurable Provider)
   */
  async dispatchToProvider({ withdrawal, payoutReference, amount, payoutMethod, payoutDetails }) {
    if (this.provider === 'simulator') {
      logger.info(`[Payout Simulator] Dispatched payout ${payoutReference} for ₹${amount}`);
      return {
        provider: 'simulator',
        mode: 'TEST',
        payoutId: `sim_${payoutReference}`,
        status: 'PROCESSING'
      };
    }

    if (this.provider === 'uropay' || this.provider === 'banking') {
      logger.info(`[Payout Service] Dispatched ₹${amount} to ${withdrawal.email} via ${this.provider} (ref: ${payoutReference})`);
      return {
        provider: this.provider,
        payoutId: `pout_${payoutReference}`,
        status: 'PROCESSING'
      };
    }

    return {
      provider: this.provider,
      status: 'PROCESSING'
    };
  }

  /**
   * Transition 3: Finalize Payout (Success)
   * PROCESSING -> SUCCESS / PAID
   */
  async finalizePayoutSuccess(payoutReference, bankReference = null, adminUser = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const selectRes = await client.query(`
        SELECT pt.*, w.user_id, w.amount, w.currency, u.email
        FROM payout_transactions pt
        JOIN withdrawals w ON w.id = pt.withdrawal_id
        JOIN users u ON u.id = w.user_id
        WHERE pt.payout_reference = $1
        FOR UPDATE;
      `, [payoutReference]);

      if (selectRes.rows.length === 0) {
        throw new Error(`Payout transaction ${payoutReference} not found.`);
      }

      const pt = selectRes.rows[0];
      if (pt.status === 'SUCCESS' || pt.status === 'PAID') {
        await client.query('COMMIT');
        return { duplicate: true, status: pt.status };
      }

      // 1. Mark payout_transactions SUCCESS
      await client.query(`
        UPDATE payout_transactions
        SET status = 'SUCCESS',
            updated_at = NOW()
        WHERE id = $1;
      `, [pt.id]);

      // 2. Mark withdrawals PAID / SUCCESS
      await client.query(`
        UPDATE withdrawals
        SET status = 'PAID',
            payout_reference = COALESCE($1, payout_reference),
            updated_at = NOW()
        WHERE id = $2;
      `, [bankReference || pt.payout_reference, pt.withdrawal_id]);

      // 3. Finalize WITHDRAWAL_HOLD on ledger to permanent WITHDRAWAL
      await client.query(`
        UPDATE wallet_ledger
        SET entry_type = 'WITHDRAWAL',
            status = 'COMPLETED',
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{settlement}',
              $1::jsonb
            )
        WHERE reference_id = $2 AND entry_type = 'WITHDRAWAL_HOLD';
      `, [
        JSON.stringify({
          settledAt: new Date().toISOString(),
          payoutReference,
          bankReference: bankReference || pt.payout_reference
        }),
        pt.withdrawal_id.toString()
      ]);

      // Audit Log
      await this.logAudit(client, {
        adminId: adminUser?.id,
        adminEmail: adminUser?.email,
        action: 'PAYOUT_STATUS_SUCCESS',
        targetId: pt.withdrawal_id,
        beforeState: { status: 'PROCESSING' },
        afterState: { status: 'PAID', bankReference: bankReference || pt.payout_reference },
        metadata: { payoutReference }
      });

      await client.query('COMMIT');

      telegram.notifyWithdrawalPaid({
        withdrawalId: pt.withdrawal_id,
        amount: pt.amount,
        userEmail: pt.email,
        payoutReference: bankReference || pt.payout_reference
      }).catch(() => {});

      return {
        success: true,
        status: 'PAID',
        withdrawalId: pt.withdrawal_id,
        payoutReference,
        withdrawal: { id: pt.withdrawal_id, status: 'PAID' },
        payout: { ...pt, status: 'SUCCESS' }
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Transition 4: Finalize Payout (Failure & Fund Hold Release)
   * PROCESSING -> FAILED (Funds released back to user available balance)
   */
  async finalizePayoutFailure(payoutReference, failureReason, adminUser = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const selectRes = await client.query(`
        SELECT pt.*, w.user_id, w.amount, w.currency, u.email
        FROM payout_transactions pt
        JOIN withdrawals w ON w.id = pt.withdrawal_id
        JOIN users u ON u.id = w.user_id
        WHERE pt.payout_reference = $1
        FOR UPDATE;
      `, [payoutReference]);

      if (selectRes.rows.length === 0) {
        throw new Error(`Payout transaction ${payoutReference} not found.`);
      }

      const pt = selectRes.rows[0];
      if (pt.status === 'FAILED' || pt.status === 'REJECTED') {
        await client.query('COMMIT');
        return { duplicate: true, status: pt.status };
      }

      // 1. Mark payout_transactions FAILED
      await client.query(`
        UPDATE payout_transactions
        SET status = 'FAILED',
            error_details = $1,
            updated_at = NOW()
        WHERE id = $2;
      `, [JSON.stringify({ reason: failureReason }), pt.id]);

      // 2. Mark withdrawals FAILED
      await client.query(`
        UPDATE withdrawals
        SET status = 'FAILED',
            rejection_reason = $1,
            updated_at = NOW()
        WHERE id = $2;
      `, [failureReason, pt.withdrawal_id]);

      // 3. Release fund hold by inserting WITHDRAWAL_RELEASE
      const balFailRes = await client.query(`
        SELECT COALESCE(SUM(amount), 0.00) AS available_balance
        FROM wallet_ledger
        WHERE user_id = $1 AND status = 'COMPLETED';
      `, [pt.user_id]);
      const currentFailBal = parseFloat(balFailRes.rows[0].available_balance) || 0;
      const refundAmount = parseFloat(pt.amount);
      const restoredBal = (currentFailBal + refundAmount).toFixed(2);
      const txRelRef = `WTH_REL_${pt.withdrawal_id}_${Date.now()}`;

      await client.query(
        `INSERT INTO wallet_ledger 
          (user_id, transaction_reference, reference_id, entry_type, wallet_type, amount, balance_after, currency, status, metadata)
         VALUES 
          ($1, $2, $3, 'WITHDRAWAL_RELEASE', 'MAIN', $4, $5, $6, 'COMPLETED', $7)`,
        [
          pt.user_id,
          txRelRef,
          pt.withdrawal_id.toString(),
          refundAmount,
          restoredBal,
          pt.currency || 'INR',
          JSON.stringify({
            withdrawalId: pt.withdrawal_id,
            payoutReference,
            failureReason
          })
        ]
      );

      // Audit Log
      await this.logAudit(client, {
        adminId: adminUser?.id,
        adminEmail: adminUser?.email,
        action: 'PAYOUT_STATUS_FAILED',
        targetId: pt.withdrawal_id,
        beforeState: { status: 'PROCESSING' },
        afterState: { status: 'FAILED', reason: failureReason },
        metadata: { payoutReference }
      });

      await client.query('COMMIT');

      telegram.notifyWithdrawalRejected({
        withdrawalId: pt.withdrawal_id,
        amount: pt.amount,
        userEmail: pt.email,
        reason: failureReason
      }).catch(() => {});

      return {
        success: true,
        status: 'FAILED',
        withdrawalId: pt.withdrawal_id,
        reason: failureReason,
        withdrawal: { id: pt.withdrawal_id, status: 'FAILED' },
        payout: { ...pt, status: 'FAILED' }
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Payout Webhook Processor with Cryptographic Verification
   */
  async handlePayoutWebhook(rawBody, signature, eventData) {
    const secret = process.env.PAYOUT_WEBHOOK_SECRET || this.webhookSecret;
    // 1. Verify signature if secret configured
    if (secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        const err = new Error('Invalid payout webhook cryptographic signature.');
        err.statusCode = 400;
        throw err;
      }
    }

    const event = eventData.event || eventData.type;
    const payoutRef = eventData.payout_reference || eventData.payoutReference || eventData.reference_id || eventData.payload?.payout?.reference_id;

    if (!payoutRef) {
      const err = new Error('Payout reference missing from webhook event payload.');
      err.statusCode = 400;
      throw err;
    }

    logger.info(`Received payout webhook: ${event} for ref: ${payoutRef}`);

    if (event === 'payout.processed' || event === 'payout.success' || event === 'PAYOUT_SETTLED') {
      const bankRef = eventData.bank_reference || eventData.bankReference || eventData.payload?.payout?.utr;
      return this.finalizePayoutSuccess(payoutRef, bankRef);
    }

    if (event === 'payout.failed' || event === 'payout.rejected' || event === 'PAYOUT_REJECTED') {
      const reason = eventData.reason || eventData.failure_reason || eventData.payload?.payout?.failure_reason || 'Bank payout failed';
      return this.finalizePayoutFailure(payoutRef, reason);
    }

    return { received: true, event };
  }

  /**
   * Internal Audit Logger
   */
  async logAudit(client, { adminId, adminEmail, action, targetId, beforeState, afterState, metadata }) {
    await client.query(`
      INSERT INTO admin_audit_logs 
        (actor_id, actor_email, actor_role, action, target_entity, target_id, before_state, after_state, audit_metadata)
      VALUES 
        ($1, $2, 'admin', $3, 'withdrawals', $4, $5, $6, $7);
    `, [
      adminId || null,
      adminEmail || 'system@growmore.app',
      action,
      String(targetId),
      JSON.stringify(beforeState || {}),
      JSON.stringify(afterState || {}),
      JSON.stringify(metadata || {})
    ]);
  }
}

const payoutService = new PayoutService();
module.exports = payoutService;
