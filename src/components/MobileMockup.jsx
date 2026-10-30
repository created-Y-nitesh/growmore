import React, { useState } from 'react';
import { 
  TrendingUp, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  ShieldCheck, 
  Bell, 
  ChevronRight,
  Sparkles,
  PieChart
} from 'lucide-react';
import { formatRupees } from '../utils/formatters';

export default function MobileMockup({ onExplorePlans, onDownloadClick }) {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [demoBalance, setDemoBalance] = useState(26400);

  return (
    <div className="phone-wrapper float-anim">
      {/* Decorative Outer Glow Orbs */}
      <div className="phone-glow-orb purple-orb"></div>
      <div className="phone-glow-orb cyan-orb"></div>

      {/* Floating Widget 1 */}
      <div className="floating-badge badge-top-left">
        <div className="pulse-dot"></div>
        <div>
          <div className="fb-label">Net Monthly Yield</div>
          <div className="fb-val text-gradient">+10.0% Fixed</div>
        </div>
      </div>

      {/* Floating Widget 2 */}
      <div className="floating-badge badge-bottom-right">
        <ShieldCheck size={20} className="text-cyan" />
        <div>
          <div className="fb-label">Platform Security</div>
          <div className="fb-val" style={{ color: '#22d3ee' }}>AES 256-Bit SSL</div>
        </div>
      </div>

      {/* Phone Chassis */}
      <div className="phone-chassis">
        {/* Speaker & Camera Notch */}
        <div className="phone-notch">
          <div className="notch-speaker"></div>
          <div className="notch-camera"></div>
        </div>

        {/* Screen Content */}
        <div className="phone-screen">
          {/* Status Bar */}
          <div className="phone-status-bar">
            <span>09:41</span>
            <div className="status-icons">
              <span>5G</span>
              <div className="battery-icon">
                <div className="battery-fill"></div>
              </div>
            </div>
          </div>

          {/* App Header */}
          <div className="app-header">
            <div className="app-user-meta">
              <div className="app-avatar">AS</div>
              <div>
                <div className="app-user-greeting">Welcome back,</div>
                <div className="app-user-name">Arjun Sharma</div>
              </div>
            </div>
            <div className="app-header-action">
              <Bell size={16} />
            </div>
          </div>

          {/* Balance Card */}
          <div className="app-balance-card">
            <div className="abc-header">
              <span className="abc-title">Total Portfolio Value</span>
              <span className="abc-tag">LIVE</span>
            </div>
            <div className="abc-amount">{formatRupees(demoBalance)}</div>
            <div className="abc-gain">
              <TrendingUp size={14} />
              <span>+₹2,400 (Net Profit)</span>
            </div>

            {/* Quick Actions */}
            <div className="app-quick-actions">
              <button 
                className="quick-btn"
                onClick={() => setDemoBalance(prev => prev + 1000)}
                title="Simulate Deposit"
              >
                <ArrowDownLeft size={16} />
                <span>Deposit</span>
              </button>
              <button 
                className="quick-btn active"
                onClick={onExplorePlans}
                title="Explore Plans"
              >
                <ArrowUpRight size={16} />
                <span>Invest</span>
              </button>
              <button 
                className="quick-btn"
                onClick={onDownloadClick}
                title="Download App"
              >
                <Sparkles size={16} />
                <span>App APK</span>
              </button>
            </div>
          </div>

          {/* Mini Chart Mockup */}
          <div className="app-chart-preview">
            <div className="chart-header">
              <span>Performance Trend</span>
              <span className="chart-period">Past 30 Days</span>
            </div>
            <div className="svg-chart-wrap">
              <svg viewBox="0 0 200 60" className="mock-sparkline">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path 
                  d="M0 45 Q 30 35, 60 40 T 110 25 T 160 15 T 200 8 L 200 60 L 0 60 Z" 
                  fill="url(#lineGrad)" 
                />
                <path 
                  d="M0 45 Q 30 35, 60 40 T 110 25 T 160 15 T 200 8" 
                  fill="none" 
                  stroke="#22d3ee" 
                  strokeWidth="2.5" 
                />
                <circle cx="200" cy="8" r="4" fill="#06b6d4" />
              </svg>
            </div>
          </div>

          {/* Active Plans Micro-list */}
          <div className="app-section-title">
            <span>Active Plans (3)</span>
            <span className="see-all-link" onClick={onExplorePlans}>View All</span>
          </div>

          <div className="app-plan-item" onClick={onExplorePlans}>
            <div className="plan-icon starter">
              <Sparkles size={16} />
            </div>
            <div className="plan-info">
              <div className="plan-row">
                <span className="plan-name">Starter Plan</span>
                <span className="plan-amount">₹1,000</span>
              </div>
              <div className="plan-sub">30 Days • +₹100 (10% Yield)</div>
            </div>
            <ChevronRight size={14} className="text-muted" />
          </div>

          <div className="app-plan-item" onClick={onExplorePlans}>
            <div className="plan-icon silver">
              <PieChart size={16} />
            </div>
            <div className="plan-info">
              <div className="plan-row">
                <span className="plan-name">Silver Plan</span>
                <span className="plan-amount">₹5,000</span>
              </div>
              <div className="plan-sub">90 Days • +₹1,500 (30% Yield)</div>
            </div>
            <ChevronRight size={14} className="text-muted" />
          </div>

          {/* App Bottom Navigation Bar */}
          <div className="app-bottom-nav">
            <div className={`abn-item ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => setActiveTab('portfolio')}>
              <Wallet size={16} />
              <span>Wallet</span>
            </div>
            <div className={`abn-item ${activeTab === 'plans' ? 'active' : ''}`} onClick={onExplorePlans}>
              <TrendingUp size={16} />
              <span>Plans</span>
            </div>
            <div className={`abn-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
              <RefreshCw size={16} />
              <span>Activity</span>
            </div>
          </div>
        </div>

        {/* Home Indicator */}
        <div className="phone-home-indicator"></div>
      </div>
    </div>
  );
}
