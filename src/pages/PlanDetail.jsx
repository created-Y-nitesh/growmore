import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Calculator, 
  Wallet,
  TrendingUp,
  X
} from 'lucide-react';
import { formatRupees } from '../utils/formatters';
import { api, authStorage } from '../services/api';

export default function PlanDetail({ plan, onReturn, onAllocateSuccess, onOpenCalculator }) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocationDone, setAllocationDone] = useState(false);
  const [allocationMsg, setAllocationMsg] = useState('');
  const [allocError, setAllocError] = useState('');

  if (!plan) return null;

  const handleConfirmAllocation = async () => {
    setAllocError('');
    const token = authStorage.getToken();
    if (!token) {
      setAllocError('Please log in or register your investor account first to allocate capital.');
      return;
    }

    setIsAllocating(true);
    try {
      const response = await api.createInvestment({
        planId: plan.id,
        principalAmount: plan.minAmount
      });

      setAllocationDone(true);
      setAllocationMsg(response.message || 'Investment processed successfully.');
      setTimeout(() => {
        setShowConfirmModal(false);
        if (onAllocateSuccess) {
          onAllocateSuccess(response.investment);
        }
      }, 2000);
    } catch (err) {
      setAllocError(err.message || 'Failed to submit investment request.');
    } finally {
      setIsAllocating(false);
    }
  };

  return (
    <div className="plan-detail-page">
      {/* Top Bar */}
      <div className="rules-header-bar">
        <div className="container rules-nav-inner">
          <button className="btn btn-secondary btn-sm" onClick={onReturn}>
            <ArrowLeft size={16} />
            <span>Back to Plans</span>
          </button>

          <div className="brand-logo" onClick={onReturn} style={{ cursor: 'pointer' }}>
            <div className="logo-icon-wrap">
              <TrendingUp className="logo-svg" size={20} />
            </div>
            <span className="brand-name">
              Grow<span className="brand-highlight">More</span>
            </span>
          </div>

          <div></div>
        </div>
      </div>

      <div className="container plan-detail-content">
        <div className="plan-detail-layout-grid">
          {/* Main Plan Overview */}
          <div className="plan-detail-main">
            <div className="badge badge-cyan">{plan.badge}</div>
            <h1 className="plan-detail-title">{plan.name}</h1>
            <p className="plan-detail-tagline">{plan.tagline}</p>

            {/* Price & Term Header */}
            <div className="plan-detail-price-card glass-card">
              <div className="pd-stat">
                <span className="pd-label">Minimum Investment</span>
                <span className="pd-val">{formatRupees(plan.minAmount)}</span>
              </div>
              <div className="pd-stat">
                <span className="pd-label">Fixed Holding Term</span>
                <span className="pd-val text-cyan">{plan.durationDays} Days</span>
              </div>
              <div className="pd-stat">
                <span className="pd-label">Cycle Yield Rate</span>
                <span className="pd-val text-purple">10.0% Monthly Basis</span>
              </div>
            </div>

            {/* Return Breakdown */}
            <div className="glass-card pd-card">
              <h3 className="pd-section-heading">Plan Settlement Projection</h3>
              <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>
                Yield schedule based on minimum capital allocation of {formatRupees(plan.minAmount)}.
              </p>

              <div className="pd-calc-table">
                <div className="pd-calc-row">
                  <span>Investment Principal:</span>
                  <strong>{formatRupees(plan.minAmount)}</strong>
                </div>
                <div className="pd-calc-row">
                  <span>Net Return (10%):</span>
                  <strong className="text-cyan">+{formatRupees(plan.sampleReturn)}</strong>
                </div>
                <div className="pd-calc-divider"></div>
                <div className="pd-calc-row total">
                  <span>Total Maturity Payout:</span>
                  <strong className="text-gradient">{formatRupees(plan.sampleTotal)}</strong>
                </div>
              </div>

              <div className="pd-calc-footnote">
                *Note: Capital and profits are credited directly into your Withdraw Wallet upon term completion.
              </div>
            </div>

            {/* Applicable Conditions & Rules */}
            <div className="glass-card pd-card">
              <h3 className="pd-section-heading">Applicable Plan Conditions</h3>
              <div className="pd-conditions-list">
                {(Array.isArray(plan.terms) ? plan.terms : []).map((term, idx) => (
                  <div key={idx} className="pd-cond-item">
                    <CheckCircle2 size={16} className="text-cyan flex-shrink-0" />
                    <span>{term}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Disclosure */}
            <div className="glass-card pd-card alert-border">
              <div className="pd-risk-header">
                <ShieldAlert size={20} className="text-amber" />
                <h3 className="pd-section-heading" style={{ margin: 0, color: '#fbbf24' }}>
                  Capital Commitment & Risk Notice
                </h3>
              </div>
              <p className="text-muted" style={{ fontSize: '0.88rem', marginTop: '0.5rem', lineHeight: '1.6' }}>
                Allocating capital to any tier locks funds for the duration specified. GrowMore operates under 
                transparent investment rules and ensures prompt payout upon term maturity.
              </p>
            </div>
          </div>

          {/* Sidebar Action Card */}
          <div className="plan-detail-sidebar">
            <div className="glass-card pd-action-card">
              <div className="card-badge">INVESTMENT TIER ACTIVATION</div>
              <h3 className="pd-side-title">{plan.name}</h3>

              <div className="pd-summary-list">
                <div className="pd-sum-item">
                  <span className="text-muted">Required Allocation:</span>
                  <strong>{formatRupees(plan.minAmount)}</strong>
                </div>
                <div className="pd-sum-item">
                  <span className="text-muted">Holding Duration:</span>
                  <strong>{plan.durationDays} Days</strong>
                </div>
                <div className="pd-sum-item">
                  <span className="text-muted">Total Maturity Payout:</span>
                  <strong className="text-cyan">{formatRupees(plan.sampleTotal)}</strong>
                </div>
                <div className="pd-sum-item">
                  <span className="text-muted">Platform Management Fee:</span>
                  <strong className="text-emerald">₹0 (Zero Fee)</strong>
                </div>
              </div>

              <div className="pd-wallet-note">
                <Wallet size={16} className="text-cyan flex-shrink-0" />
                <span>Deducts capital from your available Top Up Wallet balance.</span>
              </div>

              <button 
                className="btn btn-primary btn-lg" 
                style={{ width: '100%', marginTop: '1.25rem' }}
                onClick={() => setShowConfirmModal(true)}
              >
                <span>Proceed to Activation</span>
                <ArrowRight size={18} />
              </button>

              <button 
                className="btn btn-secondary btn-sm" 
                style={{ width: '100%', marginTop: '0.65rem' }}
                onClick={onReturn}
              >
                Back to All Plans
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => !isAllocating && setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            {allocationDone ? (
              <div className="allocation-success-view">
                <div className="success-icon-wrap">
                  <CheckCircle2 size={48} className="text-cyan" />
                </div>
                <h3>Plan Allocation Registered!</h3>
                <p className="text-muted" style={{ margin: '0.5rem 0 1rem 0' }}>
                  {allocationMsg || `Your allocation to ${plan.name} has been successfully registered.`}
                </p>
                <div className="alloc-meta-pill">
                  <span>Allocated: {formatRupees(plan.minAmount)}</span>
                  <span>•</span>
                  <span>Duration: {plan.durationDays} Days</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="badge badge-cyan">CAPITAL ALLOCATION</div>
                <h3 className="modal-title" style={{ marginTop: '0.4rem', marginBottom: '0.5rem' }}>
                  Confirm Plan Activation
                </h3>
                <p className="text-muted" style={{ fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                  You are activating <strong>{plan.name}</strong> with a capital allocation of <strong>{formatRupees(plan.minAmount)}</strong> from your GrowMore Top Up Wallet.
                </p>

                {allocError && (
                  <div className="auth-alert error" style={{ marginBottom: '1rem' }}>
                    <AlertCircle size={16} />
                    <span>{allocError}</span>
                  </div>
                )}

                <div className="modal-notice-box">
                  <ShieldAlert size={16} className="text-cyan flex-shrink-0" />
                  <span>
                    Your principal will be locked for {plan.durationDays} days and yield 10% returns credited upon cycle maturity.
                  </span>
                </div>

                <div className="modal-confirm-actions">
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setShowConfirmModal(false)}
                    disabled={isAllocating}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleConfirmAllocation}
                    disabled={isAllocating}
                  >
                    {isAllocating ? 'Allocating Capital...' : `Confirm ${formatRupees(plan.minAmount)} Activation`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
