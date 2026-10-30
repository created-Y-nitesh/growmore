import React from 'react';
import { 
  TrendingUp, 
  ShieldCheck, 
  MapPin, 
  Building2, 
  Mail, 
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { COMPANY_INFO } from '../data/mockData';

export default function Footer({ 
  onExplorePlans, 
  onDownloadClick, 
  onNavigateRules,
  onOpenLegalTab 
}) {
  return (
    <footer className="footer-section">
      <div className="container">
        {/* Main Footer Row */}
        <div className="footer-top-grid">
          {/* Brand & Proposed Location Info */}
          <div className="footer-col brand-col">
            <div className="brand-logo footer-logo">
              <div className="logo-icon-wrap">
                <TrendingUp className="logo-svg" size={22} />
              </div>
              <span className="brand-name">
                Grow<span className="brand-highlight">More</span>
              </span>
            </div>

            <p className="footer-about-text">
              GrowMore is an advanced digital asset and wealth platform offering transparent 
              investment tiers, real-time analytics, and secure banking settlements.
            </p>

            {/* Location Notice */}
            <div className="footer-location-block">
              <div className="fl-row">
                <MapPin size={15} className="text-cyan flex-shrink-0" />
                <span>Headquarters: Dubai International Financial Centre (DIFC), UAE</span>
              </div>
              <div className="fl-row">
                <Building2 size={15} className="text-purple flex-shrink-0" />
                <span>Operations Desk: Fintech Valley, Bengaluru, India</span>
              </div>
            </div>

            <div className="footer-security-pill" style={{ marginTop: '1rem' }}>
              <ShieldCheck size={16} className="text-cyan" />
              <span>Enterprise Grade • 256-Bit SSL Encrypted</span>
            </div>
          </div>

          {/* Nav Quick Links */}
          <div className="footer-col">
            <h4 className="footer-heading">Platform</h4>
            <ul className="footer-links">
              <li><a href="#home">Home Overview</a></li>
              <li><a href="#features">Core Features</a></li>
              <li><a href="#plans" onClick={onExplorePlans}>Investment Plans</a></li>
              <li><a href="#calculator">Investment Calculator</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li>
                <button className="footer-text-btn highlight-link" onClick={onNavigateRules}>
                  Rules & Disclosure
                </button>
              </li>
            </ul>
          </div>

          {/* Legal Pages */}
          <div className="footer-col">
            <h4 className="footer-heading">Legal & Compliance</h4>
            <ul className="footer-links">
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('terms')}>
                  Terms & Conditions
                </button>
              </li>
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('privacy')}>
                  Privacy Policy
                </button>
              </li>
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('risk')}>
                  Risk Disclosure
                </button>
              </li>
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('refund')}>
                  Refund & Cancellation
                </button>
              </li>
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('about')}>
                  About GrowMore
                </button>
              </li>
            </ul>
          </div>

          {/* Support & Community */}
          <div className="footer-col">
            <h4 className="footer-heading">Ecosystem & Support</h4>
            <ul className="footer-links">
              <li>
                <a href="#download" onClick={onDownloadClick}>Download Android App</a>
              </li>
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('faq')}>
                  FAQ Knowledge Hub
                </button>
              </li>
              <li>
                <button className="footer-text-btn" onClick={() => onOpenLegalTab('contact')}>
                  Support & Contact Desk
                </button>
              </li>
              <li>
                <a href="#referrals">1-Level Referral System</a>
              </li>
            </ul>

            <div className="footer-social-placeholders">
              <span className="social-label">Connect:</span>
              <div className="social-dots">
                <span className="s-dot" title="X / Twitter (Placeholder)">𝕏</span>
                <span className="s-dot" title="LinkedIn (Placeholder)">in</span>
                <span className="s-dot" title="Telegram (Placeholder)">✈</span>
                <span className="s-dot" title="GitHub (Placeholder)">git</span>
              </div>
            </div>
          </div>
        </div>

        {/* Disclaimer Warning Box */}
        <div className="footer-disclaimer-box">
          <AlertTriangle size={18} className="text-amber flex-shrink-0" />
          <p>
            <strong>Regulatory Disclaimer:</strong> GrowMore is a premier wealth technology platform. 
            All capital allocations and projected returns are governed by official scheme terms. 
            Investments carry market risks; please review holding periods and terms before deploying capital.
          </p>
        </div>

        {/* Bottom Copyright Row */}
        <div className="footer-bottom-bar">
          <div className="copyright-text">
            © {new Date().getFullYear()} <strong>GrowMore Technologies</strong>. All rights reserved.
          </div>
          <div className="footer-sub-links">
            <span>Corporate Office: DIFC, Dubai, UAE & Bengaluru, India</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
