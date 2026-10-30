import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  HelpCircle, 
  ArrowRight, 
  ShieldAlert, 
  CheckCircle2, 
  RotateCcw,
  AlertTriangle,
  Info
} from 'lucide-react';
import { formatRupees, calculateIllustrativeReturns } from '../utils/formatters';

export default function InvestmentCalculator({ prefilledAmount }) {
  const [amountInput, setAmountInput] = useState('1000');
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [calcResults, setCalcResults] = useState(() => calculateIllustrativeReturns(1000, 30));
  const [errorMessage, setErrorMessage] = useState('');

  // Seven duration options: 30d, 90d, 120d, 180d, 365d (1yr), 2yrs (730d), 5yrs (1825d)
  const durationOptions = [
    { days: 30, label: '30 Days', description: '1 Month' },
    { days: 90, label: '90 Days', description: '3 Months' },
    { days: 120, label: '120 Days', description: '4 Months' },
    { days: 180, label: '180 Days', description: '6 Months' },
    { days: 365, label: '365 Days', description: '1 Year' },
    { days: 730, label: '2 Years', description: '730 Days' },
    { days: 1825, label: '5 Years', description: '1,825 Days' }
  ];

  const presets = [500, 1000, 5000, 10000, 25000, 50000, 100000];

  // Helper to re-evaluate calculation for ANY amount
  const updateCalculation = (amt, days) => {
    const numericAmount = parseFloat(amt);
    if (isNaN(numericAmount) || numericAmount < 0) {
      setErrorMessage('Please enter a valid amount.');
      return false;
    }
    setErrorMessage('');
    const results = calculateIllustrativeReturns(numericAmount, days);
    setCalcResults(results);
    return true;
  };

  // Sync when prefilledAmount changes from outside (e.g. Plan cards)
  useEffect(() => {
    if (prefilledAmount && prefilledAmount > 0) {
      setAmountInput(String(prefilledAmount));
      updateCalculation(prefilledAmount, selectedDuration);
    }
  }, [prefilledAmount]);

  // Handle amount input change with live recalculation for ANY entered amount
  const handleAmountChange = (e) => {
    const val = e.target.value;
    setAmountInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setErrorMessage('');
      setCalcResults(calculateIllustrativeReturns(num, selectedDuration));
    } else if (val === '') {
      setErrorMessage('');
      setCalcResults(calculateIllustrativeReturns(0, selectedDuration));
    }
  };

  // Handle duration change with immediate recalculation
  const handleDurationSelect = (days) => {
    setSelectedDuration(days);
    const num = parseFloat(amountInput);
    if (!isNaN(num) && num >= 0) {
      setErrorMessage('');
      setCalcResults(calculateIllustrativeReturns(num, days));
    }
  };

  // Quick Preset Click
  const handlePresetClick = (val) => {
    setAmountInput(String(val));
    setErrorMessage('');
    setCalcResults(calculateIllustrativeReturns(val, selectedDuration));
  };

  // Explicit Calculate Button Click
  const handleCalculate = (e) => {
    if (e) e.preventDefault();
    updateCalculation(amountInput, selectedDuration);
  };

  // Reset to default
  const handleReset = () => {
    setAmountInput('1000');
    setSelectedDuration(30);
    setErrorMessage('');
    setCalcResults(calculateIllustrativeReturns(1000, 30));
  };

  // Human-readable duration description
  const currentDurationObj = durationOptions.find(d => d.days === selectedDuration) || durationOptions[0];

  return (
    <section id="calculator" className="section-padding bg-darker">
      <div className="container">
        <div className="section-header">
          <div className="badge badge-cyan">
            <Calculator size={13} />
            <span>Interactive Simulator</span>
          </div>
          <h2 className="section-title">
            Working <span className="text-gradient">Investment Calculator</span>
          </h2>
          <p className="section-desc">
            Calculate your capital growth with precision. Test custom allocation amounts 
            starting from ₹1,000 across selectable durations with our 10% monthly yield model.
          </p>
        </div>

        <div className="calc-container-grid">
          {/* Left Column: Calculator Controls & Inputs */}
          <div className="glass-card calc-input-card">
            <div className="card-header-clean">
              <div className="card-badge">INPUT PARAMETERS</div>
              <button className="reset-btn" onClick={handleReset} title="Reset to defaults">
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>

            <form onSubmit={handleCalculate}>
              {/* Amount Input */}
              <div className="form-group">
                <label className="form-label" htmlFor="calc-amount">
                  <span>Investment Amount (Rupees)</span>
                  <span className="label-sub">Any custom amount</span>
                </label>
                <div className="input-currency-wrap">
                  <span className="currency-prefix">₹</span>
                  <input
                    id="calc-amount"
                    type="number"
                    min="0"
                    step="any"
                    className={`form-input ${errorMessage ? 'input-error' : ''}`}
                    value={amountInput}
                    onChange={handleAmountChange}
                    placeholder="Enter any amount (e.g. 500, 1000, 25000...)"
                  />
                </div>
                {errorMessage && (
                  <div className="error-alert">
                    <ShieldAlert size={14} />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Quick Preset Buttons */}
              <div className="presets-group">
                <span className="presets-label">Quick Presets:</span>
                <div className="presets-row">
                  {presets.map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`preset-chip ${Number(amountInput) === val ? 'active' : ''}`}
                      onClick={() => handlePresetClick(val)}
                    >
                      {formatRupees(val)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration Selector (7 Options) */}
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <div className="form-label-row">
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    <span>Select Duration Horizon</span>
                    <span className="label-sub">7 Options Available</span>
                  </label>
                </div>
                <div className="duration-grid duration-grid-expanded">
                  {durationOptions.map((opt) => (
                    <button
                      key={opt.days}
                      type="button"
                      className={`duration-card ${selectedDuration === opt.days ? 'selected' : ''}`}
                      onClick={() => handleDurationSelect(opt.days)}
                    >
                      <div className="duration-days">{opt.label}</div>
                      <div className="duration-desc">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate Indicator (10% per 30 days) */}
              <div className="rate-display-box">
                <div className="rate-info">
                  <span className="rate-title">Illustrative Monthly Rate</span>
                  <span className="rate-explanation">
                    10% per 30-day period (proportional simple interest)
                  </span>
                </div>
                <div className="rate-value text-gradient">10.0% / mo</div>
              </div>

              {/* Calculate Action Button */}
              <button 
                type="submit" 
                className="btn btn-primary btn-lg" 
                style={{ width: '100%', marginTop: '1.5rem' }}
              >
                <Calculator size={18} />
                <span>Calculate Returns</span>
                <ArrowRight size={18} />
              </button>
            </form>
          </div>

          {/* Right Column: Calculated Outputs & Breakdown */}
          <div className="glass-card calc-output-card">
            <div className="card-header-clean">
              <div className="card-badge cyan">CALCULATION OUTPUT</div>
              <span className="calc-status-pill">
                <CheckCircle2 size={13} />
                <span>Computed Live</span>
              </span>
            </div>

            {/* Main Total Highlight */}
            <div className="total-highlight-banner">
              <div className="th-label">Total Payout Amount</div>
              <div className="th-amount text-gradient">
                {formatRupees(calcResults.illustrativeTotal)}
              </div>
              <div className="th-meta">
                Based on {formatRupees(calcResults.amount)} principal across {currentDurationObj.label} ({calcResults.durationDays} days)
              </div>
            </div>

            {/* Line Item Breakdown */}
            <div className="breakdown-list">
              <div className="breakdown-item">
                <div className="bi-meta">
                  <span className="bi-title">Investment Amount</span>
                  <span className="bi-desc">Entered principal</span>
                </div>
                <div className="bi-val">{formatRupees(calcResults.amount)}</div>
              </div>

              <div className="breakdown-item">
                <div className="bi-meta">
                  <span className="bi-title">Selected Duration</span>
                  <span className="bi-desc">
                    {calcResults.durationDays} days ÷ 30 = {(calcResults.monthlyPeriods).toFixed(2).replace(/\.00$/, '')} monthly periods
                  </span>
                </div>
                <div className="bi-val text-cyan font-semibold">
                  {currentDurationObj.label}
                </div>
              </div>

              <div className="breakdown-item highlight-cyan">
                <div className="bi-meta">
                  <span className="bi-title">Estimated Return</span>
                  <span className="bi-desc">Principal × 0.10 × ({calcResults.durationDays} / 30)</span>
                </div>
                <div className="bi-val text-cyan">
                  +{formatRupees(calcResults.illustrativeReturn)}
                </div>
              </div>

              <div className="breakdown-item total-row">
                <div className="bi-meta">
                  <span className="bi-title">Total Payout Amount</span>
                  <span className="bi-desc">Principal + Earned Return</span>
                </div>
                <div className="bi-val text-gradient font-bold">
                  {formatRupees(calcResults.illustrativeTotal)}
                </div>
              </div>
            </div>

            {/* Regulatory Transparency Note */}
            <div className="calc-rule-explanation">
              <Info size={18} className="text-cyan flex-shrink-0" />
              <p>
                <strong>Calculation Basis:</strong> Yield calculation is 10% per 30 calendar days (monthly). 
                Proportional simple interest applied: <code>principal × 0.10 × (days / 30)</code>.
              </p>
            </div>

            {/* Investor Disclosure */}
            <div className="calc-mandatory-disclaimer">
              <AlertTriangle size={18} className="text-amber flex-shrink-0" />
              <p>
                “All investment activities involve market dynamics. Projected payouts are calculated based on locked plan terms. 
                Investors are advised to review holding terms and risk guidelines before deploying capital.”
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
