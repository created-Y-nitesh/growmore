import React from 'react';
import { 
  ArrowRight, 
  Smartphone, 
  ShieldCheck, 
  Sparkles, 
  TrendingUp, 
  CheckCircle2,
  Lock,
  Layers
} from 'lucide-react';
import MobileMockup from './MobileMockup';

export default function Hero({ onExplorePlans, onDownloadClick, onOpenCalculator }) {
  return (
    <section id="home" className="hero-section">
      <div className="container hero-container">
        {/* Left Column: Headline and Call-to-actions */}
        <div className="hero-content">
          <div className="badge badge-cyan">
            <Sparkles size={14} />
            <span>Next-Generation Fintech Platform</span>
          </div>

          <h1 className="hero-title">
            Grow Your Future with <span className="text-gradient">GrowMore</span>
          </h1>

          <p className="hero-description">
            Experience next-generation financial empowerment. GrowMore delivers intuitive 
            investment plans, real-time portfolio analytics, transparent fixed-yield tiers, 
            and a companion mobile app built for the modern digital investor.
          </p>

          <div className="hero-cta-group">
            <button 
              className="btn btn-primary btn-lg"
              onClick={onExplorePlans}
            >
              <span>Explore Plans</span>
              <ArrowRight size={18} />
            </button>

            <button 
              className="btn btn-secondary btn-lg"
              onClick={onDownloadClick}
            >
              <Smartphone size={18} />
              <span>Download App</span>
            </button>
          </div>

          {/* Value Props Pills */}
          <div className="hero-trust-row">
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-cyan" />
              <span>Starts at ₹1,000</span>
            </div>
            <div className="trust-item">
              <TrendingUp size={16} className="text-purple" />
              <span>10% Monthly Return</span>
            </div>
            <div className="trust-item">
              <ShieldCheck size={16} className="text-cyan" />
              <span>Zero Hidden Fees</span>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hero-metrics-grid">
            <div className="metric-box">
              <div className="metric-val">₹1,000</div>
              <div className="metric-sub">Min. Starting Amount</div>
            </div>
            <div className="metric-box">
              <div className="metric-val text-gradient">10%</div>
              <div className="metric-sub">Monthly Yield Rate</div>
            </div>
            <div className="metric-box">
              <div className="metric-val">3 Tiers</div>
              <div className="metric-sub">Starter, Silver & Gold</div>
            </div>
          </div>
        </div>

        {/* Right Column: Mobile App Showcase */}
        <div className="hero-mockup-wrapper">
          <MobileMockup 
            onExplorePlans={onExplorePlans}
            onDownloadClick={onDownloadClick}
          />
        </div>
      </div>
    </section>
  );
}
