import React, { useState } from 'react';
import { 
  ArrowLeft, 
  TrendingUp, 
  ShieldCheck, 
  FileText, 
  Lock, 
  AlertTriangle, 
  HelpCircle, 
  Mail, 
  MapPin, 
  Building2, 
  CheckCircle2, 
  Send 
} from 'lucide-react';
import { COMPANY_INFO, FAQ_ITEMS } from '../data/mockData';

export default function LegalPage({ initialTab = 'about', onReturn }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [ticketData, setTicketData] = useState({ name: '', email: '', category: 'General Inquiry', message: '' });
  const [ticketSubmitted, setTicketSubmitted] = useState(false);

  const handleTicketSubmit = (e) => {
    e.preventDefault();
    if (!ticketData.name || !ticketData.email || !ticketData.message) return;
    setTicketSubmitted(true);
    setTimeout(() => {
      setTicketSubmitted(false);
      setTicketData({ name: '', email: '', category: 'General Inquiry', message: '' });
    }, 4500);
  };

  return (
    <div className="legal-page-layout">
      {/* Top Header Navigation */}
      <header className="rules-header-bar">
        <div className="container rules-nav-inner">
          <button className="btn btn-secondary btn-sm" onClick={onReturn}>
            <ArrowLeft size={16} />
            <span>Back to Site</span>
          </button>

          <div className="brand-logo" onClick={onReturn} style={{ cursor: 'pointer' }}>
            <div className="logo-icon-wrap">
              <TrendingUp className="logo-svg" size={20} />
            </div>
            <span className="brand-name">
              Grow<span className="brand-highlight">More</span>
            </span>
          </div>

          <div className="header-status-pill">
            <ShieldCheck size={14} className="text-cyan" />
            <span>Official Policy Documentation</span>
          </div>
        </div>
      </header>

      <div className="container legal-body-grid">
        {/* Left Navigation Sidebar */}
        <aside className="legal-sidebar">
          <div className="sidebar-title">Documentation</div>
          <nav className="legal-nav-stack">
            <button 
              className={`legal-nav-item ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              <Building2 size={16} />
              <span>About GrowMore</span>
            </button>

            <button 
              className={`legal-nav-item ${activeTab === 'terms' ? 'active' : ''}`}
              onClick={() => setActiveTab('terms')}
            >
              <FileText size={16} />
              <span>Terms & Conditions</span>
            </button>

            <button 
              className={`legal-nav-item ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              <Lock size={16} />
              <span>Privacy Policy</span>
            </button>

            <button 
              className={`legal-nav-item ${activeTab === 'risk' ? 'active' : ''}`}
              onClick={() => setActiveTab('risk')}
            >
              <AlertTriangle size={16} />
              <span>Risk Disclosure</span>
            </button>

            <button 
              className={`legal-nav-item ${activeTab === 'refund' ? 'active' : ''}`}
              onClick={() => setActiveTab('refund')}
            >
              <ShieldCheck size={16} />
              <span>Refund & Cancellation</span>
            </button>

            <button 
              className={`legal-nav-item ${activeTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveTab('faq')}
            >
              <HelpCircle size={16} />
              <span>FAQ Knowledge Hub</span>
            </button>

            <button 
              className={`legal-nav-item ${activeTab === 'contact' ? 'active' : ''}`}
              onClick={() => setActiveTab('contact')}
            >
              <Mail size={16} />
              <span>Contact & Support</span>
            </button>
          </nav>
        </aside>

        {/* Right Main Content Pane */}
        <main className="legal-main-pane glass-card">
          {/* TAB 1: ABOUT GROWMORE */}
          {activeTab === 'about' && (
            <div>
              <div className="badge badge-cyan">Company Overview</div>
              <h1 className="legal-doc-title">About GrowMore</h1>
              <p className="legal-lead">
                GrowMore is a modern financial technology platform dedicated to delivering transparent, 
                high-yield capital growth solutions and automated portfolio management.
              </p>

              <div className="company-location-card">
                <MapPin size={24} className="text-cyan flex-shrink-0" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                    Corporate Headquarters: {COMPANY_INFO.location}
                  </h3>
                  <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                    Operational support and technical engineering based in Dubai International Financial Centre (DIFC) and Bengaluru.
                  </p>
                </div>
              </div>

              <h3 className="legal-subheading">Our Mission</h3>
              <p className="legal-p">
                GrowMore bridges institutional capital allocation models with retail accessibility. 
                Through our structured plans (Starter, Silver, Gold), investors benefit from fixed-term predictability, 
                dual-wallet segregation, and rapid banking settlement rails.
              </p>

              <h3 className="legal-subheading">Dual-Wallet Architecture</h3>
              <p className="legal-p">
                We enforce strict accounting separation: the Top Up Wallet manages incoming funds dedicated solely to plan activations, 
                while the Withdraw Wallet holds unlocked capital and yields ready for same-day IMPS/NEFT bank withdrawals.
              </p>
            </div>
          )}

          {/* TAB 2: TERMS AND CONDITIONS */}
          {activeTab === 'terms' && (
            <div>
              <div className="badge">Legal Agreement</div>
              <h1 className="legal-doc-title">Terms & Conditions</h1>
              <p className="legal-lead">
                These terms govern your membership and financial operations on the GrowMore platform.
              </p>

              <h3 className="legal-subheading">1. Membership & Account Operations</h3>
              <p className="legal-p">
                All investors must be at least 18 years of age. Accounts require mobile verification and valid government KYC documents 
                (PAN/Aadhaar) to perform deposits and bank withdrawals.
              </p>

              <h3 className="legal-subheading">2. Plan Allocations & Lock-in Periods</h3>
              <p className="legal-p">
                Capital committed to any tier (Starter: 30 days, Silver: 90 days, Gold: 365 days) is locked for the duration specified. 
                Returns are accrued and settled automatically to your Withdraw Wallet upon cycle maturity.
              </p>

              <h3 className="legal-subheading">3. Anti-Fraud & Compliance</h3>
              <p className="legal-p">
                GrowMore adheres to global Anti-Money Laundering (AML) standards. Suspicious transaction patterns or attempts to manipulate 
                the 1-level referral system will result in immediate account freeze and compliance audit.
              </p>

              <h3 className="legal-subheading">4. Intellectual Property</h3>
              <p className="legal-p">
                The GrowMore trademark, logo, visual design, calculators, and proprietary platform interfaces are protected intellectual property.
              </p>
            </div>
          )}

          {/* TAB 3: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div>
              <div className="badge badge-cyan">Data Protection</div>
              <h1 className="legal-doc-title">Privacy Policy</h1>
              <p className="legal-lead">
                GrowMore enforces bank-grade data security protocols to protect your personal and financial data.
              </p>

              <h3 className="legal-subheading">1. Data Encryption</h3>
              <p className="legal-p">
                All network requests, credentials, and banking identifiers are transmitted via 256-bit SSL encrypted channels 
                and stored with salted SHA-256 hash security.
              </p>

              <h3 className="legal-subheading">2. Zero Third-Party Monetization</h3>
              <p className="legal-p">
                We never sell, rent, or lease investor contact details or financial histories to third-party advertisers or brokers.
              </p>

              <h3 className="legal-subheading">3. Audit & Access Controls</h3>
              <p className="legal-p">
                System access is restricted to authorized compliance personnel through multi-factor authentication (MFA) and immutable access logs.
              </p>
            </div>
          )}

          {/* TAB 4: RISK DISCLOSURE */}
          {activeTab === 'risk' && (
            <div>
              <div className="badge" style={{ borderColor: 'var(--amber-accent)', color: 'var(--amber-accent)' }}>
                Risk Advisory
              </div>
              <h1 className="legal-doc-title">Risk Disclosure</h1>
              <p className="legal-lead">
                Please review this comprehensive risk framework before committing capital to growth tiers.
              </p>

              <div className="risk-highlight-callout">
                <AlertTriangle size={24} className="text-amber flex-shrink-0" />
                <div>
                  <strong>Important Notice:</strong> All financial and digital asset investments carry market dynamics. 
                  Investors should only commit capital within their individual risk tolerance.
                </div>
              </div>

              <h3 className="legal-subheading">1. Capital Commitment</h3>
              <p className="legal-p">
                Plan subscriptions require capital commitment for the chosen term. Early premature liquidations before the lock-in date 
                may be subject to standard treasury adjustment fees.
              </p>

              <h3 className="legal-subheading">2. Fixed Yield Framework</h3>
              <p className="legal-p">
                Plan payouts are calculated based on locked contract terms (10% monthly basis). Funds are managed under strict treasury 
                reserve ratios to guarantee scheduled payouts.
              </p>
            </div>
          )}

          {/* TAB 5: REFUND & CANCELLATION */}
          {activeTab === 'refund' && (
            <div>
              <div className="badge">Cancellation Terms</div>
              <h1 className="legal-doc-title">Refund & Cancellation Policy</h1>
              <p className="legal-lead">
                Clear rules regarding wallet balances, plan cancellations, and withdrawal execution.
              </p>

              <h3 className="legal-subheading">1. Unallocated Wallet Balances</h3>
              <p className="legal-p">
                Any deposited funds remaining unallocated in your Top Up Wallet can be refunded back to the original source bank account 
                upon request within 24 to 48 hours.
              </p>

              <h3 className="legal-subheading">2. Active Plan Terms</h3>
              <p className="legal-p">
                Once a plan is activated, funds enter the active investment cycle. Principal and profits become fully withdrawable 
                on the maturity date.
              </p>
            </div>
          )}

          {/* TAB 6: FAQ HUB */}
          {activeTab === 'faq' && (
            <div>
              <div className="badge badge-cyan">Knowledge Base</div>
              <h1 className="legal-doc-title">Frequently Asked Questions</h1>
              <p className="legal-lead">
                Answers to key questions regarding platform operations, returns, deposits, and app access.
              </p>

              <div className="legal-faq-stack">
                {FAQ_ITEMS.map((item, idx) => (
                  <div key={idx} className="legal-faq-card">
                    <h4>{item.question}</h4>
                    <p className="text-muted">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: CONTACT & SUPPORT */}
          {activeTab === 'contact' && (
            <div>
              <div className="badge badge-cyan">Investor Care</div>
              <h1 className="legal-doc-title">Contact & Helpdesk</h1>
              <p className="legal-lead">
                Have questions regarding investments, enterprise partnerships, or account verification? Our team is available 24/7.
              </p>

              <div className="contact-info-grid">
                <div className="ci-box">
                  <Mail size={20} className="text-cyan" />
                  <div>
                    <div className="ci-label">Support Email</div>
                    <div className="ci-val">{COMPANY_INFO.supportEmail}</div>
                  </div>
                </div>
                <div className="ci-box">
                  <MapPin size={20} className="text-purple" />
                  <div>
                    <div className="ci-label">Headquarters</div>
                    <div className="ci-val">{COMPANY_INFO.location}</div>
                  </div>
                </div>
                <div className="ci-box">
                  <Building2 size={20} className="text-cyan" />
                  <div>
                    <div className="ci-label">Status</div>
                    <div className="ci-val">{COMPANY_INFO.operationalStatus}</div>
                  </div>
                </div>
              </div>

              <div className="demo-ticket-card glass-card" style={{ marginTop: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>Submit a Priority Support Ticket</h3>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Our investor relationship desk will review your ticket and reply within 2 business hours.
                </p>

                {ticketSubmitted ? (
                  <div className="form-success-alert">
                    <CheckCircle2 size={24} className="text-cyan" />
                    <div>
                      <h4>Ticket Submitted Successfully!</h4>
                      <p>Your ticket #{Math.floor(100000 + Math.random() * 900000)} has been logged. Our desk is reviewing it.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleTicketSubmit}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Your Name</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. Arjun Sharma"
                          required
                          value={ticketData.name}
                          onChange={(e) => setTicketData({ ...ticketData, name: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input 
                          type="email" 
                          className="form-input" 
                          placeholder="name@example.com"
                          required
                          value={ticketData.email}
                          onChange={(e) => setTicketData({ ...ticketData, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Inquiry Category</label>
                      <select 
                        className="form-input form-select"
                        value={ticketData.category}
                        onChange={(e) => setTicketData({ ...ticketData, category: e.target.value })}
                      >
                        <option value="General Inquiry">General Platform Inquiry</option>
                        <option value="Investment Plans">Investment Plans & Yields</option>
                        <option value="Dual Wallet">Deposit / Withdrawal Support</option>
                        <option value="Mobile App">Mobile App Support</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Message Details</label>
                      <textarea 
                        rows="4" 
                        className="form-input form-textarea" 
                        placeholder="Describe your inquiry..."
                        required
                        value={ticketData.message}
                        onChange={(e) => setTicketData({ ...ticketData, message: e.target.value })}
                      ></textarea>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      <Send size={16} />
                      <span>Submit Priority Ticket</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
