import React from 'react';
import { 
  ShieldAlert, 
  BookOpen, 
  Workflow, 
  Wallet, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  HelpCircle, 
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  Lock,
  Cpu
} from 'lucide-react';
import { RULES_AND_DISCLOSURES } from '../data/mockData';

export default function RulesAndDisclosure({ onReturnHome, onExplorePlans }) {
  return (
    <div className="rules-page-layout">
      {/* Header bar */}
      <div className="rules-header-bar">
        <div className="container rules-nav-inner">
          <button className="btn btn-secondary btn-sm" onClick={onReturnHome}>
            <ArrowLeft size={16} />
            <span>Back to Home</span>
          </button>
          
          <div className="brand-logo" onClick={onReturnHome} style={{ cursor: 'pointer' }}>
            <div className="logo-icon-wrap">
              <TrendingUp className="logo-svg" size={20} />
            </div>
            <span className="brand-name">
              Grow<span className="brand-highlight">More</span>
            </span>
          </div>

          <button className="btn btn-primary btn-sm" onClick={onExplorePlans}>
            <span>View Plans</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="rules-hero-section">
        <div className="container">
          <div className="badge badge-cyan">
            <BookOpen size={14} />
            <span>Official Operating Framework</span>
          </div>
          <h1 className="rules-hero-title">
            Rules & <span className="text-gradient">Disclosure</span>
          </h1>
          <p className="rules-hero-subtitle">
            A comprehensive, transparent guide to GrowMore's operational architecture, risk 
            disclosures, dual-wallet separation, and eight core platform standards.
          </p>
        </div>
      </div>

      <div className="container rules-content-container">
        {/* Section A: Read Before Participating */}
        <section className="rules-section-card glass-card">
          <div className="r-card-header">
            <div className="r-icon-box purple">
              <ShieldAlert size={22} />
            </div>
            <div>
              <span className="r-step-tag">SECTION A</span>
              <h2 className="r-section-title">{RULES_AND_DISCLOSURES.readBefore.title}</h2>
            </div>
          </div>
          <div className="r-card-body">
            <p className="r-text-lead">{RULES_AND_DISCLOSURES.readBefore.content}</p>
            <div className="r-checklist-grid">
              <div className="r-checklist-item">
                <CheckCircle2 size={16} className="text-cyan" />
                <span>Verify Minimum Amount (Starter: ₹1,000, Silver: ₹5,000, Gold: ₹10,000)</span>
              </div>
              <div className="r-checklist-item">
                <CheckCircle2 size={16} className="text-cyan" />
                <span>Examine applicable lockup terms & holding durations</span>
              </div>
              <div className="r-checklist-item">
                <CheckCircle2 size={16} className="text-cyan" />
                <span>Review 10% monthly yield calculation models</span>
              </div>
              <div className="r-checklist-item">
                <CheckCircle2 size={16} className="text-cyan" />
                <span>Assess personal risk tolerance before allocating funds</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section B: The Operating Flow */}
        <section className="rules-section-card glass-card">
          <div className="r-card-header">
            <div className="r-icon-box cyan">
              <Workflow size={22} />
            </div>
            <div>
              <span className="r-step-tag">SECTION B</span>
              <h2 className="r-section-title">{RULES_AND_DISCLOSURES.operatingFlow.title}</h2>
            </div>
          </div>
          <div className="r-card-body">
            <p className="r-text-muted" style={{ marginBottom: '1.5rem' }}>
              The 5-step operational lifecycle outlining how funds, plan subscriptions, and 
              payouts must transition across verified nodes:
            </p>

            <div className="operating-steps-grid">
              {RULES_AND_DISCLOSURES.operatingFlow.steps.map((st) => (
                <div key={st.num} className="op-step-box">
                  <div className="op-step-num">{st.num}</div>
                  <h3 className="op-step-title">{st.title}</h3>
                  <p className="op-step-desc">{st.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section C: Risk Disclosure */}
        <section className="rules-section-card glass-card alert-border">
          <div className="r-card-header">
            <div className="r-icon-box amber">
              <AlertTriangle size={22} />
            </div>
            <div>
              <span className="r-step-tag amber-text">SECTION C</span>
              <h2 className="r-section-title">{RULES_AND_DISCLOSURES.riskDisclosure.title}</h2>
            </div>
          </div>
          <div className="r-card-body">
            <div className="risk-highlight-callout">
              <AlertTriangle size={24} className="text-amber flex-shrink-0" />
              <div>
                <strong>Risk Advisory:</strong> Digital finance and investments carry market dynamics and capital risk. 
                Past performances do not guarantee future yields.
              </div>
            </div>
            <p className="r-text-body" style={{ marginTop: '1.25rem' }}>
              {RULES_AND_DISCLOSURES.riskDisclosure.content}
            </p>
            
            <div className="mining-clarification-box">
              <Cpu size={18} className="text-cyan flex-shrink-0" />
              <span>
                <strong>Treasury Framework:</strong> GrowMore operates strictly on audited digital liquidity and fixed-yield treasury allocations.
              </span>
            </div>
          </div>
        </section>

        {/* Section D: Dual Wallet Separation */}
        <section className="rules-section-card glass-card">
          <div className="r-card-header">
            <div className="r-icon-box blue">
              <Wallet size={22} />
            </div>
            <div>
              <span className="r-step-tag">SECTION D</span>
              <h2 className="r-section-title">{RULES_AND_DISCLOSURES.walletSeparation.title}</h2>
            </div>
          </div>
          <div className="r-card-body">
            <p className="r-text-body">{RULES_AND_DISCLOSURES.walletSeparation.content}</p>

            <div className="wallets-comparison-grid">
              <div className="wallet-spec-card">
                <div className="wsc-badge purple">TOP UP WALLET</div>
                <h4>Purpose: Plan Allocations</h4>
                <ul>
                  <li>Dedicated to newly deposited funds</li>
                  <li>Used exclusively to subscribe to investment plans</li>
                  <li>Non-withdrawable until plan maturation and settlement</li>
                  <li>Requires automated payment verification receipt</li>
                </ul>
              </div>

              <div className="wallet-spec-card">
                <div className="wsc-badge cyan">WITHDRAW WALLET</div>
                <h4>Purpose: Liquid Payouts</h4>
                <ul>
                  <li>Receives unlocked capital and matured returns</li>
                  <li>Eligible for bank IMPS or UPI payout requests</li>
                  <li>Subject to minimum withdrawal limits and checks</li>
                  <li>Audited by immutable server ledger prior to transfer</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Section E: Platform Standards */}
        <section className="rules-section-card glass-card">
          <div className="r-card-header">
            <div className="r-icon-box purple">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <span className="r-step-tag">SECTION E</span>
              <h2 className="r-section-title">Platform Standards (8 Core Principles)</h2>
            </div>
          </div>
          <div className="r-card-body">
            <div className="standards-grid">
              {RULES_AND_DISCLOSURES.platformStandards.map((std) => (
                <div key={std.num} className="standard-item-card">
                  <div className="std-num">{std.num}</div>
                  <h4 className="std-title">{std.title}</h4>
                  <p className="std-desc">{std.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section F: Referral Policy */}
        <section className="rules-section-card glass-card">
          <div className="r-card-header">
            <div className="r-icon-box cyan">
              <Users size={22} />
            </div>
            <div>
              <span className="r-step-tag">SECTION F</span>
              <h2 className="r-section-title">{RULES_AND_DISCLOSURES.referralPolicy.title}</h2>
            </div>
          </div>
          <div className="r-card-body">
            <p className="r-text-body">{RULES_AND_DISCLOSURES.referralPolicy.content}</p>
            <div className="one-level-pill">
              <CheckCircle2 size={16} className="text-cyan" />
              <span>Strict 1-Level Referral System — Zero MLM or Pyramid Structures</span>
            </div>
          </div>
        </section>

        {/* Section G: Important Disclaimer */}
        <section className="rules-section-card glass-card disclaimer-bg">
          <div className="r-card-header">
            <div className="r-icon-box red">
              <Lock size={22} />
            </div>
            <div>
              <span className="r-step-tag red-text">SECTION G</span>
              <h2 className="r-section-title">{RULES_AND_DISCLOSURES.disclaimer.title}</h2>
            </div>
          </div>
          <div className="r-card-body">
            <p className="r-text-body font-semibold">
              {RULES_AND_DISCLOSURES.disclaimer.content}
            </p>
          </div>
        </section>
      </div>

      {/* Footer Call to Action */}
      <div className="rules-bottom-cta container">
        <div className="glass-card cta-inner">
          <div>
            <h3>Ready to Explore the Platform?</h3>
            <p className="text-muted">Review our Starter (₹1,000), Silver (₹5,000), and Gold (₹10,000) structured plans.</p>
          </div>
          <div className="cta-actions">
            <button className="btn btn-secondary" onClick={onReturnHome}>
              Return to Homepage
            </button>
            <button className="btn btn-primary" onClick={onExplorePlans}>
              <span>Explore Investment Plans</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
