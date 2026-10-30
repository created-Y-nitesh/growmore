/**
 * Currency and Calculation Utilities for GrowMore
 */

/**
 * Format number into Indian Rupee representation (e.g. ₹1,000, ₹10,000, ₹1,216.67)
 * Rounds to two decimal places when fractional, and keeps clean integer display.
 * @param {number|string} amount
 * @returns {string}
 */
export const formatRupees = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '₹0';
  const hasDecimals = Math.abs(num - Math.round(num)) > 0.001;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  }).format(num);
};

/**
 * Simple-Interest Proportional Calculation (10% per 30 days / monthly)
 * 
 * Formula:
 * - monthlyPeriods = durationInDays / 30
 * - illustrativeReturn = principal * 0.10 * (durationInDays / 30)
 * - illustrativeTotal = principal + illustrativeReturn
 * 
 * Examples for ₹1,000:
 * - 30 days: return ₹100, total ₹1,100
 * - 90 days: return ₹300, total ₹1,300
 * - 120 days: return ₹400, total ₹1,400
 * - 180 days: return ₹600, total ₹1,600
 * - 365 days: return ₹1,216.67, total ₹2,216.67
 * - 2 years (730 days): return ₹2,433.33, total ₹3,433.33
 * - 5 years (1825 days): return ₹6,083.33, total ₹7,083.33
 * 
 * @param {number|string} principal
 * @param {number|string} durationDays
 * @param {number} monthlyRate - Default 0.10 (10% per 30 days)
 */
export const calculateIllustrativeReturns = (principal, durationDays = 30, monthlyRate = 0.10) => {
  const amount = Math.max(0, Number(principal) || 0);
  const days = Math.max(0, Number(durationDays) || 30);
  const monthlyPeriods = days / 30;
  
  // Proportional simple interest calculation
  const rawReturn = amount * monthlyRate * (days / 30);
  const illustrativeReturn = Math.round(rawReturn * 100) / 100;
  const illustrativeTotal = Math.round((amount + illustrativeReturn) * 100) / 100;

  return {
    amount,
    durationDays: days,
    monthlyPeriods,
    monthlyRatePercent: monthlyRate * 100,
    illustrativeReturn,
    illustrativeTotal
  };
};

/**
 * Validate email address format
 * @param {string} email
 * @returns {boolean}
 */
export const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
};

