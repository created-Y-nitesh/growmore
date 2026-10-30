import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Check, 
  Info, 
  Clock, 
  ArrowRight,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import { INVESTMENT_PLANS } from '../data/mockData';
import { formatRupees, calculateIllustrativeReturns } from '../utils/formatters';

export default function InvestmentPlans({ onSelectPlanDetail }) {
  const [cycle, setCycle] = useState('monthly'); // 'monthly' | 'yearly'
  const [plans, setPlans] = useState(INVESTMENT_PLANS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlans = async () => {
    try {
      const response = await api.getPlans();
      if (response && response.success && Array.isArray(response.plans) && response.plans.length > 0) {
        setPlans(response.plans);
      } else {
        setPlans(INVESTMENT_PLANS);
      }
    } catch (err) {
      console.warn('[InvestmentPlans] Fallback to official structured plans:', err.message);
      setPlans(INVESTMENT_PLANS);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  return (
    <section id="plans" className="section-padding">
      <div className="container">
        <div className="section-header" style={{ marginBottom: '2rem' }}>
          <div className="badge">Curated Growth Tiers</div>
          <h2 className="section-title">
            Transparent <span className="text-gradient">Investment Plans</span>
          </h2>
          <p className="section-desc">
            Explore our structured tiers tailored for different capital allocations. 
            Toggle between Monthly and Yearly return projections below.
          </p>
        </div>

        {/* Single master toggle button at the top for all cards: Monthly or Yearly */}
        <div className="plan-period-toggle-wrap">
          <div className="plan-period-toggle">
            <button 
              type="button"
              className={`period-toggle-btn ${cycle === 'monthly' ? 'active' : ''}`}
              onClick={() => setCycle('monthly')}
            >
              <span>Monthly</span>
            </button>
            <button 
              type="button"
              className={`period-toggle-btn ${cycle === 'yearly' ? 'active' : ''}`}
              onClick={() => setCycle('yearly')}
            >
              <span>Yearly</span>
            </button>
          </div>
        </div>

        {/* Investor Protection Banner */}
        <div className="prototype-notice-banner">
          <Info size={20} className="text-cyan notice-icon flex-shrink-0" />
          <div className="notice-text">
            <strong>Plan Settlement:</strong> Showing {cycle === 'monthly' ? 'Monthly Cycle (30 Days at 10%)' : 'Annual Cycle (365 Days at 120%)'} yields. 
            <span className="text-muted"> Capital and earned returns are credited directly to your Withdraw Wallet upon term completion.</span>
          </div>
        </div>

        {/* Plans Grid: Always renders the official tiers (₹1,000, ₹5,000, ₹10,000, ₹20,000) */}
        <div className="plans-grid">
          {plans.map((plan) => {
            const minAmt = plan.minimumAmount || plan.minAmount || 1000;
            const days = cycle === 'monthly' ? 30 : (plan.durationDays || 365);
            const termLabel = cycle === 'monthly' ? '30 Days Term' : `${plan.durationDays || 365} Days Term`;
            const rate = plan.returnRatePercentage ? Number(plan.returnRatePercentage) / 100 : 0.10;
            const calc = calculateIllustrativeReturns(minAmt, days, rate);
              
            const isSilver = plan.planCode === 'DAILY' || plan.planCode === 'silver' || plan.name.toLowerCase().includes('daily');
            const isGold = plan.planCode === 'SUPER' || plan.planCode === 'VIP' || plan.planCode === 'gold';
            let badgeLabel = 'Beginner Tier';
            if (plan.planCode === 'BASIC') badgeLabel = 'Starter Tier';
            if (plan.planCode === 'DAILY') badgeLabel = '₹99/Day Bonus Tier';
            if (plan.planCode === 'SUPER') badgeLabel = '₹300/Day Super Tier';
            if (plan.planCode === 'VIP') badgeLabel = 'VIP Tier';

            const activePlanData = {
              ...plan,
              minAmount: minAmt,
              durationDays: days,
              termLabel,
              badge: badgeLabel,
              featured: isSilver || plan.planCode === 'SUPER',
              sampleReturn: calc.illustrativeReturn,
              sampleTotal: calc.illustrativeTotal
            };

            return (
              <div 
                key={plan.id} 
                className={`glass-card plan-card ${isSilver || plan.planCode === 'SUPER' ? 'plan-featured' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectPlanDetail(activePlanData)}
              >
                <div className={`plan-badge ${isSilver || plan.planCode === 'SUPER' ? 'badge-popular' : ''}`}>
                  {(isSilver || plan.planCode === 'SUPER') && <Sparkles size={13} />}
                  <span>{badgeLabel}</span>
                </div>

                <div className="plan-header">
                  <h3 className="plan-name">{plan.name}</h3>
                  <p className="plan-tagline">{plan.tagline || plan.description}</p>
                </div>

                <div className="plan-price-box">
                  <div className="plan-min-label">Minimum Allocation</div>
                  <div className="plan-min-amount">{formatRupees(minAmt)}</div>
                  <div className="plan-term-pill">
                    <Clock size={13} />
                    <span>{termLabel}</span>
                  </div>
                </div>

                {/* Yield Projection Box */}
                <div className="plan-calc-box">
                  <div className="calc-box-title">
                    {cycle === 'monthly' ? `Monthly Return Model (${(rate * 100).toFixed(0)}%)` : `Yearly Return Model (${days} Days)`}
                  </div>
                  <div className="calc-row">
                    <span className="calc-label">Example Principal:</span>
                    <span className="calc-val">{formatRupees(minAmt)}</span>
                  </div>
                  <div className="calc-row highlight">
                    <span className="calc-label">
                      {cycle === 'monthly' ? 'Net Return (30 Days):' : `Net Return (${days} Days):`}
                    </span>
                    <span className="calc-val text-cyan">+{formatRupees(calc.illustrativeReturn)}</span>
                  </div>
                  <div className="calc-divider"></div>
                  <div className="calc-row total">
                    <span className="calc-label">Total Payout:</span>
                    <span className="calc-val text-gradient">{formatRupees(calc.illustrativeTotal)}</span>
                  </div>
                  <div className="calc-footnote">
                    {cycle === 'monthly' 
                      ? `*Fixed monthly cycle yielding ${(rate * 100).toFixed(0)}% net monthly ROI.` 
                      : `*${days}-day term: Principal × ${(rate * 100).toFixed(0)}% × (${days} / 30).`}
                  </div>
                </div>

                {/* Features / Perks List */}
                {Array.isArray(plan.terms) && plan.terms.length > 0 ? (
                  <div className="plan-perks-list">
                    {plan.terms.slice(0, 3).map((term, idx) => (
                      <div key={idx} className="plan-perk-item">
                        <Check size={15} className="text-cyan flex-shrink-0" />
                        <span>{term}</span>
                      </div>
                    ))}
                  </div>
                ) : Array.isArray(plan.perks) && plan.perks.length > 0 && (
                  <div className="plan-perks-list">
                    {plan.perks.map((perk, idx) => (
                      <div key={idx} className="plan-perk-item">
                        <Check size={15} className="text-cyan flex-shrink-0" />
                        <span>{perk}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action button */}
                <div className="plan-actions">
                  <button 
                    className={`btn ${isSilver || plan.planCode === 'SUPER' ? 'btn-primary' : 'btn-outline-cyan'}`}
                    style={{ width: '100%' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlanDetail(activePlanData);
                    }}
                  >
                    <span>Invest Now / Details</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

