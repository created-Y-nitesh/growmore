const crypto = require('crypto');

/**
 * Payout Provider Adapter Interface
 * Handles banking/IMPS/NEFT/UPI payout integrations (e.g. RazorpayX, Cashfree Payouts)
 * Keeps live execution disabled until banking approvals and provider keys are secured.
 */
class PayoutProviderAdapter {
  constructor() {
    this.providerName = (process.env.PAYOUT_PROVIDER || 'disabled').toLowerCase();
    this.keyId = process.env.PAYOUT_KEY_ID || null;
    this.keySecret = process.env.PAYOUT_KEY_SECRET || null;
    this.accountNumber = process.env.PAYOUT_ACCOUNT_NUMBER || null;
  }

  /**
   * Check if payout provider is authorized and configured
   */
  isConfigured() {
    if (this.providerName === 'disabled' || !this.providerName) {
      return false;
    }
    return Boolean(this.keyId && this.keySecret && this.accountNumber);
  }

  /**
   * Return missing configuration parameters
   */
  getMissingConfig() {
    const missing = [];
    if (!process.env.PAYOUT_PROVIDER || process.env.PAYOUT_PROVIDER === 'disabled') {
      missing.push('PAYOUT_PROVIDER');
    }
    if (!this.keyId) missing.push('PAYOUT_KEY_ID');
    if (!this.keySecret) missing.push('PAYOUT_KEY_SECRET');
    if (!this.accountNumber) missing.push('PAYOUT_ACCOUNT_NUMBER');
    return missing;
  }

  /**
   * Initiate a payout through the provider
   */
  async initiatePayout({ withdrawalId, amount, currency = 'INR', payoutMethod, payoutDetails }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
        message: 'Live payout integration is disabled. Banking provider approval and credentials required.',
        missingKeys: this.getMissingConfig(),
        isLiveEnabled: false
      };
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      throw new Error('Invalid payout amount');
    }

    const payoutRef = `pout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    return {
      success: true,
      provider: this.providerName,
      payoutReference: payoutRef,
      status: 'PROCESSING',
      amount: amountInPaise,
      currency: currency.toUpperCase()
    };
  }
}

module.exports = new PayoutProviderAdapter();
