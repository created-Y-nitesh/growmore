/**
 * Return Calculation & Financial Projection Service
 * Mathematical calculations strictly avoid raw JS floating point drift.
 * All live return crediting remains disabled until financial & compliance approvals are confirmed.
 */

// Round half-up to exact paise / 2 decimals
function roundHalfUp(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates estimated return based on plan snapshot terms.
 * Supports configurable rate and duration days.
 * Formula: principal * (ratePercentage / 100) * (durationDays / 30.0)
 */
function calculateEstimatedReturn({ principalAmount, returnRatePercentage = 10.0, durationDays = 30 }) {
  const principal = parseFloat(principalAmount);
  const rate = parseFloat(returnRatePercentage);
  const days = parseInt(durationDays, 10);

  if (isNaN(principal) || principal <= 0) return 0.00;
  if (isNaN(rate) || rate <= 0) return 0.00;
  if (isNaN(days) || days <= 0) return 0.00;

  // Exact arithmetic using minor units (cents/paise) to prevent floating point inaccuracies
  // (principal * 100) * (rate * 100) * days / (10000 * 30)
  const principalMinor = Math.round(principal * 100);
  const rateBps = Math.round(rate * 100); // 10% = 1000 bps

  const totalReturnMinor = Math.round((principalMinor * rateBps * days) / (10000 * 30));
  const estimatedReturn = totalReturnMinor / 100;

  return roundHalfUp(estimatedReturn);
}

/**
 * Checks whether live return crediting is authorized by compliance configuration.
 * Always defaults to FALSE until an approved financial model is certified.
 */
function isLiveCreditingEnabled() {
  return process.env.ENABLE_LIVE_RETURN_CREDITING === 'true';
}

/**
 * Audit calculation for investment return entries.
 * Returns structured estimate and idempotency details without fabricating money.
 */
function generateReturnAuditDescriptor(investment, periodKey = 'CYCLE_MATURITY') {
  const terms = investment.terms_snapshot || {};
  const rate = parseFloat(terms.returnRate || investment.return_rate_percentage || 10.00);
  const days = parseInt(terms.durationDays || investment.duration_days || 30, 10);
  const principal = parseFloat(investment.principal_amount);

  const calculatedYield = calculateEstimatedReturn({
    principalAmount: principal,
    returnRatePercentage: rate,
    durationDays: days
  });

  const idempotencyKey = `RET-${investment.id}-${periodKey}`;

  return {
    investmentId: investment.id,
    userId: investment.user_id,
    principalBase: principal,
    rateApplied: rate,
    durationDays: days,
    calculatedYield,
    idempotencyKey,
    calculationPeriod: periodKey,
    isEstimate: !isLiveCreditingEnabled(),
    status: isLiveCreditingEnabled() ? 'CREDITED' : 'CALCULATED',
    auditNotes: isLiveCreditingEnabled()
      ? 'Live compliance approved settlement'
      : 'Projected yield estimate only. Live money crediting remains safely disabled.'
  };
}

function calculateSimpleReturn({ principal, annualRatePercentage = 10.0, days = 30 }) {
  const yieldAmount = calculateEstimatedReturn({
    principalAmount: principal,
    returnRatePercentage: annualRatePercentage,
    durationDays: days
  });
  return {
    returnAmount: yieldAmount.toFixed(2),
    rateApplied: annualRatePercentage,
    days
  };
}

module.exports = {
  roundHalfUp,
  calculateEstimatedReturn,
  calculateSimpleReturn,
  isLiveCreditingEnabled,
  generateReturnAuditDescriptor
};
