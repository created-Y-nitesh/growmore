const pool = require('../db');
const paymentAdapter = require('../services/paymentProvider/paymentAdapter');
const walletService = require('../services/walletService');

/**
 * Payment Controller - UroPay Integration
 * Manages order creation, UPI checkout generation, cryptographic verification,
 * and atomic wallet ledger settlement.
 */

// 1. Get Payment Configuration Status
exports.getConfigStatus = async (req, res, next) => {
  try {
    const isConfigured = paymentAdapter.isConfigured();
    const isTestMode = paymentAdapter.isTestMode();
    const missingKeys = paymentAdapter.getMissingConfig();

    return res.json({
      success: true,
      provider: 'uropay',
      isLiveEnabled: isConfigured && !isTestMode,
      isTestMode,
      apiKey: paymentAdapter.apiKey,
      isConfigured,
      requiresConfiguration: !isConfigured,
      missingConfigKeys: missingKeys,
      notice: isConfigured
        ? 'UroPay Merchant API is configured and active.'
        : 'UroPay API Keys (UROPAY_API_KEY & UROPAY_API_SECRET) not set in backend/.env. Simulated sandbox mode is active.'
    });
  } catch (err) {
    next(err);
  }
};

// 2. Create Server-Side UroPay Payment Order
exports.createOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { amount, depositId, purpose = 'deposit', redirectUrl } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deposit amount: minimum deposit is ₹100.'
      });
    }

    await client.query('BEGIN');

    let targetDepositId = depositId;

    // Verify or create pending deposit record in PostgreSQL
    if (targetDepositId) {
      const depRes = await client.query(
        'SELECT * FROM deposits WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [targetDepositId, userId]
      );
      if (depRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Deposit request not found.'
        });
      }
      if (depRes.rows[0].status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot create payment order for deposit in ${depRes.rows[0].status} state.`
        });
      }
    } else {
      const insRes = await client.query(
        `INSERT INTO deposits (user_id, payment_provider, amount, currency, status)
         VALUES ($1, 'uropay', $2, 'INR', 'PENDING')
         RETURNING id`,
        [userId, parsedAmount]
      );
      targetDepositId = insRes.rows[0].id;
    }

    // Call UroPay Adapter to generate order
    const orderResult = await paymentAdapter.createOrder({
      amount: parsedAmount,
      currency: 'INR',
      receipt: `rec_dep_${targetDepositId}`,
      redirectUrl,
      notes: { depositId: targetDepositId, userId, purpose }
    });

    // Update deposit with provider order ID
    await client.query(
      'UPDATE deposits SET provider_order_id = $1, payment_provider = $2 WHERE id = $3',
      [orderResult.orderId, 'uropay', targetDepositId]
    );

    // Record in dedicated payments table with suitable uniqueness constraint
    await client.query(
      `INSERT INTO payments 
        (user_id, deposit_id, provider, order_id, amount, currency, status, purpose, receipt, is_test_mode, notes)
       VALUES 
        ($1, $2, 'uropay', $3, $4, 'INR', 'created', $5, $6, $7, $8)
       ON CONFLICT (order_id) DO UPDATE SET
         status = 'created',
         amount = EXCLUDED.amount,
         updated_at = NOW()`,
      [
        userId,
        targetDepositId,
        orderResult.orderId,
        parsedAmount,
        purpose,
        orderResult.tenantOrderRef || `rec_dep_${targetDepositId}`,
        orderResult.isTestMode,
        JSON.stringify({ notes: { depositId: targetDepositId, userId } })
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      provider: 'uropay',
      depositId: targetDepositId,
      orderId: orderResult.orderId,
      tenantOrderRef: orderResult.tenantOrderRef,
      amount: parsedAmount,
      currency: orderResult.currency,
      openUrl: orderResult.openUrl,
      paymentUrl: orderResult.paymentUrl,
      upiIntent: orderResult.upiIntent,
      qrCode: orderResult.qrCode,
      isTestMode: orderResult.isTestMode,
      requiresConfiguration: orderResult.requiresConfiguration,
      notice: orderResult.notice || null
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 3. Server-Side Payment Verification Endpoint
exports.verifyPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const {
      orderId,
      paymentId,
      utr,
      reference,
      signature,
      depositId,
      uropay_order_id,
      uropay_payment_id
    } = req.body;

    const resolvedOrderId = orderId || uropay_order_id;
    const resolvedPaymentId = paymentId || uropay_payment_id || utr || reference || `pay_${Date.now()}`;

    if (!resolvedOrderId && !depositId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required order ID or deposit ID for verification.'
      });
    }

    await client.query('BEGIN');

    // Locate and lock matching deposit record
    let depRes;
    if (resolvedOrderId) {
      depRes = await client.query(
        'SELECT * FROM deposits WHERE provider_order_id = $1 AND user_id = $2 FOR UPDATE',
        [resolvedOrderId, userId]
      );
    } else {
      depRes = await client.query(
        'SELECT * FROM deposits WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [depositId, userId]
      );
    }

    if (depRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'No matching deposit record found.'
      });
    }

    const deposit = depRes.rows[0];

    // Check if deposit has already been verified
    if (deposit.status === 'SUCCESS') {
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Payment already verified and settled successfully.',
        depositId: deposit.id,
        orderId: resolvedOrderId || deposit.provider_order_id,
        paymentId: deposit.provider_payment_id
      });
    }

    // Cryptographic signature check if signature is provided
    if (signature) {
      const sigVerification = paymentAdapter.verifyPaymentSignature({
        orderId: resolvedOrderId,
        paymentId: resolvedPaymentId,
        signature
      });

      if (!sigVerification.isValid) {
        await client.query(
          `UPDATE payments 
           SET status = 'failed', 
               payment_id = $1, 
               error_description = $2, 
               updated_at = NOW() 
           WHERE order_id = $3`,
          [resolvedPaymentId, sigVerification.reason, resolvedOrderId]
        );
        await client.query(
          `UPDATE deposits SET status = 'FAILED', admin_note = 'Cryptographic signature mismatch' WHERE id = $1`,
          [deposit.id]
        );
        await client.query('COMMIT');

        return res.status(400).json({
          success: false,
          error: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'UroPay signature verification failed.'
        });
      }
    }

    // Update payments record to captured
    if (resolvedOrderId) {
      await client.query(
        `UPDATE payments 
         SET status = 'captured',
             payment_id = $1,
             signature = $2,
             verified_at = NOW(),
             updated_at = NOW()
         WHERE order_id = $3`,
        [resolvedPaymentId, signature || null, resolvedOrderId]
      );
    }

    // Update deposits record to SUCCESS
    await client.query(
      `UPDATE deposits 
       SET status = 'SUCCESS',
           payment_provider = 'uropay',
           provider_payment_id = $1,
           provider_signature = $2,
           verified_at = NOW(),
           verification_data = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        resolvedPaymentId,
        signature || null,
        JSON.stringify({
          source: 'uropay_checkout_verification',
          orderId: resolvedOrderId,
          paymentId: resolvedPaymentId,
          verifiedAt: new Date().toISOString()
        }),
        deposit.id
      ]
    );

    // Atomically credit the wallet ledger
    const userWallet = await walletService.getUserBalance(deposit.user_id);
    const currentBalance = Number(userWallet.availableBalance);
    const depositAmount = Number(deposit.amount);
    const newBalance = (currentBalance + depositAmount).toFixed(2);

    const txRef = `URO_${resolvedPaymentId}_${Date.now()}`;
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
          provider: 'uropay',
          paymentId: resolvedPaymentId,
          orderId: resolvedOrderId,
          verified: true
        })
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'UroPay payment verified successfully! Wallet credited.',
      depositId: deposit.id,
      orderId: resolvedOrderId,
      paymentId: resolvedPaymentId,
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

// 4. Webhook Ingestion & Cryptographic Settlement
exports.handleWebhook = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const signature =
      req.headers['x-uropay-signature'] ||
      req.headers['x-signature'] ||
      req.headers['x-provider-signature'] ||
      req.headers['x-hub-signature-256'];

    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    // Cryptographic signature check
    const sigCheck = paymentAdapter.verifyWebhookSignature({
      rawBody,
      signature
    });

    if (!sigCheck.isValid) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: sigCheck.reason
      });
    }

    const event = paymentAdapter.parseWebhookEvent(req.body, req.headers);

    if (!event.eventId) {
      return res.status(400).json({
        success: false,
        message: 'Missing unique event ID in webhook payload.'
      });
    }

    // Event Deduplication: check if already processed
    const existingEvent = await client.query(
      'SELECT id FROM payment_webhook_events WHERE provider = $1 AND event_id = $2',
      ['uropay', event.eventId]
    );

    if (existingEvent.rows.length > 0) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Duplicate webhook event received; safely ignored (idempotent)',
        eventId: event.eventId
      });
    }

    // Handle payment failed event
    if (event.eventType.includes('fail') || event.status === 'failed') {
      if (event.orderId) {
        await client.query(
          "UPDATE deposits SET status = 'FAILED', admin_note = 'Payment failed via UroPay webhook' WHERE provider_order_id = $1 AND status = 'PENDING'",
          [event.orderId]
        );
        await client.query(
          "UPDATE payments SET status = 'failed' WHERE order_id = $1",
          [event.orderId]
        );
      }
      await client.query(
        `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, 'FAILED_EVENT_RECORDED')`,
        ['uropay', event.eventId, event.eventType, req.body]
      );
      return res.status(200).json({
        success: true,
        message: 'Payment failure event recorded safely.'
      });
    }

    await client.query('BEGIN');

    // Find associated deposit record
    let depositQuery;
    let queryParams;

    if (event.orderId) {
      depositQuery = 'SELECT * FROM deposits WHERE provider_order_id = $1 FOR UPDATE';
      queryParams = [event.orderId];
    } else if (event.paymentId) {
      depositQuery = 'SELECT * FROM deposits WHERE provider_payment_id = $1 FOR UPDATE';
      queryParams = [event.paymentId];
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Webhook payload missing order_id or payment_id reference.'
      });
    }

    const depositRes = await client.query(depositQuery, queryParams);
    if (depositRes.rows.length === 0) {
      await client.query(
        `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, 'UNMATCHED_DEPOSIT')`,
        ['uropay', event.eventId, event.eventType, req.body]
      );
      await client.query('COMMIT');
      return res.status(404).json({
        success: false,
        message: 'No matching deposit record found for provider reference.'
      });
    }

    const deposit = depositRes.rows[0];

    // Deduplication check: if deposit is already SUCCESS, skip
    if (deposit.status === 'SUCCESS') {
      await client.query(
        `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, 'DUPLICATE_SETTLEMENT_PREVENTED')`,
        ['uropay', event.eventId, event.eventType, req.body]
      );
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Deposit already in SUCCESS state; duplicate ledger credit prevented.'
      });
    }

    // Transition deposit and payment status to SUCCESS / captured
    await client.query(
      `UPDATE deposits 
       SET status = 'SUCCESS',
           payment_provider = 'uropay',
           provider_payment_id = $1,
           verified_at = NOW(),
           verification_data = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [event.paymentId, req.body, deposit.id]
    );

    if (event.orderId) {
      await client.query(
        `UPDATE payments 
         SET status = 'captured',
             payment_id = $1,
             verified_at = NOW(),
             updated_at = NOW()
         WHERE order_id = $2`,
        [event.paymentId, event.orderId]
      );
    }

    // Atomically credit the wallet ledger
    const userWallet = await walletService.getUserBalance(deposit.user_id);
    const currentBalance = Number(userWallet.availableBalance);
    const depositAmount = Number(deposit.amount);
    const newBalance = (currentBalance + depositAmount).toFixed(2);

    const txRef = `URO_DEP_${deposit.id}_${Date.now()}`;
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
          provider: 'uropay',
          paymentId: event.paymentId,
          orderId: event.orderId,
          eventId: event.eventId,
          viaWebhook: true
        })
      ]
    );

    // Record webhook event as PROCESSED
    await client.query(
      `INSERT INTO payment_webhook_events (provider, event_id, event_type, payload, status)
       VALUES ($1, $2, $3, $4, 'PROCESSED')`,
      ['uropay', event.eventId, event.eventType, req.body]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Deposit verified and authoritative ledger credited via UroPay webhook',
      depositId: deposit.id,
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
