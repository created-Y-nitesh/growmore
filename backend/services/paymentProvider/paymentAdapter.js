const crypto = require('crypto');
const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * UroPay Payment Provider Adapter
 * Handles server-to-server order creation, HMAC-SHA256 request signing,
 * payment verification, and webhook signature validation.
 *
 * UroPay Merchant API Reference:
 * Default Host: https://api.uropai.in
 * Headers:
 *   X-Api-Key: Merchant API Key
 *   X-Timestamp: Current Unix epoch timestamp
 *   X-Nonce: Unique UUID/hex nonce for replay protection
 *   X-Signature: HMAC-SHA256(canonicalString, apiSecret)
 */
class UroPayPaymentAdapter {
  constructor() {
    this.providerName = 'uropay';
    this.provider = this.providerName;
    this.baseUrl = (process.env.UROPAY_BASE_URL || 'https://api.uropai.in').replace(/\/+$/, '');
    this.apiKey = process.env.UROPAY_API_KEY || process.env.PAYMENT_KEY_ID || null;
    this.apiSecret = process.env.UROPAY_API_SECRET || process.env.PAYMENT_KEY_SECRET || null;
    this.webhookSecret = process.env.UROPAY_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || null;
  }

  /**
   * Check if UroPay credentials are set
   */
  isConfigured() {
    if (!this.apiKey || !this.apiSecret) return false;
    if (this.apiKey.includes('placeholder') || this.apiKey.includes('your_') || this.apiSecret.includes('placeholder')) {
      return false;
    }
    return true;
  }

  /**
   * Check if current configuration is in Test/Sandbox Mode
   */
  isTestMode() {
    if (!this.apiKey) return false;
    return this.apiKey.startsWith('test_');
  }

  /**
   * Return missing configuration keys for administrative status
   */
  getMissingConfig() {
    const missing = [];
    if (!this.apiKey || this.apiKey.includes('placeholder') || this.apiKey.includes('your_')) {
      missing.push('UROPAY_API_KEY');
    }
    if (!this.apiSecret || this.apiSecret.includes('placeholder') || this.apiSecret.includes('your_')) {
      missing.push('UROPAY_API_SECRET');
    }
    return missing;
  }

  /**
   * Generates HMAC-SHA256 authentication headers for UroPay API requests
   * Canonical structure: METHOD\nPATH\nTIMESTAMP\nNONCE\nQUERY_STRING\nBODY
   */
  generateRequestHeaders(method, path, queryString = '', body = '') {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const bodyStr = typeof body === 'object' ? JSON.stringify(body) : (body || '');

    const canonicalString = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce,
      queryString,
      bodyStr
    ].join('\n');

    const signature = this.apiSecret
      ? crypto.createHmac('sha256', this.apiSecret).update(canonicalString).digest('hex')
      : 'unsigned_sig';

    return {
      'X-Api-Key': this.apiKey || '',
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create an official order on UroPay server-side
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {}, redirectUrl = '', customer = {} }) {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Invalid order amount: must be positive');
    }

    const tenantOrderRef = receipt || `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Live UroPay API Call (Real Money Mode)
    if (this.isConfigured()) {
      const path = '/v1/orders';
      const payload = {
        tenantOrderRef,
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        redirectUrl: redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?status=uropay_complete`,
        customer: {
          name: customer.name || 'GrowMore Investor',
          email: customer.email || 'investor@growmore.app',
          phone: customer.phone || '9999999999'
        },
        notes: {
          ...notes,
          testMode: this.isTestMode() ? 'true' : 'false'
        }
      };

      const headers = this.generateRequestHeaders('POST', path, '', payload);
      try {
        const response = await axios.post(`${this.baseUrl}${path}`, payload, {
          headers,
          timeout: 10000
        });

        const data = response.data?.data || response.data;
        const checkoutUrl = data.openUrl || data.paymentUrl || data.checkoutUrl;
        const upiIntent = data.upiIntent || `upi://pay?pa=uropay.growmore@icici&pn=GrowMore&am=${parsedAmount.toFixed(2)}&cu=INR&tr=${tenantOrderRef}&tn=GrowMore_${tenantOrderRef}`;

        return {
          success: true,
          provider: 'uropay',
          orderId: data.orderId || data.id || tenantOrderRef,
          tenantOrderRef,
          amount: parsedAmount,
          currency: currency.toUpperCase(),
          openUrl: checkoutUrl,
          paymentUrl: checkoutUrl,
          upiIntent,
          qrCode: data.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiIntent)}`,
          status: data.status || 'created',
          isTestMode: this.isTestMode(),
          apiKey: this.apiKey
        };
      } catch (sdkError) {
        logger.error('[UroPay SDK Error] Live Order creation failed:', {
          error: sdkError.response?.data || sdkError.message
        });
        const errorDetail = sdkError.response?.data?.message || sdkError.response?.data?.error || sdkError.message;
        throw new Error(`UroPay Gateway API error: ${errorDetail}`);
      }
    }

    // 2. If running automated tests, allow mock order
    if (process.env.NODE_ENV === 'test') {
      const testOrderId = `uro_test_${Date.now()}`;
      return {
        success: true,
        provider: 'uropay',
        orderId: testOrderId,
        tenantOrderRef,
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        openUrl: `https://checkout.uropai.in/pay/${testOrderId}`,
        paymentUrl: `https://checkout.uropai.in/pay/${testOrderId}`,
        upiIntent: `upi://pay?pa=uropay.growmore@icici&am=${parsedAmount.toFixed(2)}`,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=test`,
        status: 'created',
        isTestMode: true
      };
    }

    // 3. Inform RIOT to put live credentials in .env
    throw new Error('Real payment requires UroPay credentials. Please enter your real UROPAY_API_KEY and UROPAY_API_SECRET in backend/.env.');
  }

  /**
   * Verify UroPay Payment Signature
   * Signature is verified via HMAC-SHA256(order_id + "|" + payment_id, api_secret)
   */
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!orderId) {
      return {
        isValid: false,
        reason: 'Missing order reference'
      };
    }

    // If signature and secret exist, verify HMAC
    if (signature && this.apiSecret && !this.apiSecret.includes('placeholder')) {
      try {
        const generatedSignature = crypto
          .createHmac('sha256', this.apiSecret)
          .update(`${orderId}|${paymentId || orderId}`)
          .digest('hex');

        const expectedBuffer = Buffer.from(generatedSignature, 'utf8');
        const actualBuffer = Buffer.from(signature, 'utf8');

        if (expectedBuffer.length !== actualBuffer.length) {
          return {
            isValid: false,
            reason: 'Cryptographic signature length mismatch'
          };
        }

        const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
        return {
          isValid,
          reason: isValid ? null : 'Cryptographic signature verification failed'
        };
      } catch (err) {
        return {
          isValid: false,
          reason: `Verification exception: ${err.message}`
        };
      }
    }

    // In sandbox mode or UTR submission without strict signature
    return {
      isValid: true,
      reason: null
    };
  }

  /**
   * Fetch payment status directly from UroPay server-to-server
   */
  async fetchPaymentDetails(orderId) {
    if (this.isConfigured() && orderId) {
      try {
        const path = `/v1/orders/${encodeURIComponent(orderId)}`;
        const headers = this.generateRequestHeaders('GET', path, '', '');
        const response = await axios.get(`${this.baseUrl}${path}`, {
          headers,
          timeout: 8000
        });
        return response.data?.data || response.data;
      } catch (err) {
        logger.warn(`[UroPay] Payment fetch failed for ${orderId}:`, err.message);
      }
    }
    return null;
  }

  /**
   * Verify cryptographic webhook signature from UroPay
   */
  verifyWebhookSignature({ rawBody, signature, secret = null }) {
    const candidateSecrets = [
      secret,
      process.env.UROPAY_WEBHOOK_SECRET,
      this.webhookSecret,
      process.env.UROPAY_API_SECRET,
      this.apiSecret
    ].filter(Boolean);

    if (candidateSecrets.length === 0) {
      // Sandbox mode without configured secret
      return { isValid: true, reason: null };
    }

    if (!signature || !rawBody) {
      return {
        isValid: false,
        reason: 'Missing webhook signature or raw payload'
      };
    }

    try {
      const actualBuffer = Buffer.from(signature, 'utf8');

      for (const candSecret of candidateSecrets) {
        const hmac = crypto.createHmac('sha256', candSecret);
        hmac.update(rawBody);
        const expectedSignature = hmac.digest('hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
          return { isValid: true, reason: null };
        }
      }

      return {
        isValid: false,
        reason: 'Webhook signature verification failed'
      };
    } catch (err) {
      return {
        isValid: false,
        reason: `Signature check exception: ${err.message}`
      };
    }
  }

  /**
   * Parse incoming UroPay webhook payload safely
   */
  parseWebhookEvent(body, headers = {}) {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid webhook body format');
    }

    const payload = body.data || body.payload || body;
    return {
      eventId: (headers && (headers['x-uropay-event-id'] || headers['x-event-id'])) || body.eventId || body.event_id || body.id || `evt_${Date.now()}`,
      eventType: body.event || body.type || (payload.status === 'SUCCESS' ? 'payment.captured' : 'payment.status_update'),
      orderId: payload.orderId || payload.order_id || payload.tenantOrderRef || body.orderId || body.order_id || null,
      paymentId: payload.paymentId || payload.transactionId || payload.utr || payload.txId || body.paymentId || null,
      amount: payload.amount || body.amount || null,
      currency: (payload.currency || body.currency || 'INR').toUpperCase(),
      status: (payload.status || body.status || 'captured').toLowerCase(),
      rawPayload: body
    };
  }
}

module.exports = new UroPayPaymentAdapter();
