import React, { useState } from 'react';
import { 
  Gift, 
  Copy, 
  Check, 
  MessageSquare, 
  Link as LinkIcon, 
  Sparkles, 
  Wallet, 
  TrendingUp, 
  ShieldCheck, 
  Coins, 
  ArrowRight,
  Info,
  CheckCircle2,
  Percent,
  Calculator
} from 'lucide-react';
import { formatRupees } from '../utils/formatters';

export default function ReferralSection() {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastText, setToastText] = useState('');
  const [calcAmount, setCalcAmount] = useState(100000);

  const referralCode = 'GM-ALEX9824';
  const promoCode = 'GROWMORE2026';
  const referralUrl = `https://growmore.app/join/${referralCode}`;
  const shareMessage = `🚀 Join me on GrowMore! Start investing with transparent returns. Use my referral code ${referralCode} to get started: ${referralUrl}`;

  const showToast = (msg) => {
    setToastText(msg);
    setTimeout(() => setToastText(''), 3000);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(referralCode);
    setCopiedCode(true);
    showToast(`Referral code ${referralCode} copied!`);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(referralUrl);
    setCopiedLink(true);
    showToast('Referral link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent('Join GrowMore with my exclusive code ' + referralCode + '!')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareSMS = () => {
    const smsUrl = `sms:?body=${encodeURIComponent(shareMessage)}`;
    window.location.href = smsUrl;
  };

  const handleShareInstagram = () => {
    navigator.clipboard?.writeText(referralUrl);
    showToast('Link copied! Open Instagram to share in DM or Bio.');
    setTimeout(() => {
      window.open('https://www.instagram.com/direct/inbox/', '_blank', 'noopener,noreferrer');
    }, 600);
  };

  const ladderTiers = [
    { deposit: 10000, reward: 500, label: 'Standard', popular: false, icon: '🪙' },
    { deposit: 50000, reward: 2500, label: 'Growing', popular: false, icon: '💵' },
    { deposit: 100000, reward: 5000, label: 'POPULAR!', popular: true, icon: '🏆' },
    { deposit: 200000, reward: 10000, label: 'Super Boost', popular: false, icon: '🚀' }
  ];

  // 5% calculation
  const calculatedEarning = Math.round(Number(calcAmount || 0) * 0.05);

  return (
    <section id="referrals" className="section-padding ref-section-wrapper">
      <div className="container">
        {/* Toast notification */}
        {toastText && (
          <div className="ref-floating-toast">
            <Check size={16} />
            <span>{toastText}</span>
          </div>
        )}

        {/* Main Hero Card */}
        <div className="ref-hero-banner">
          <div className="ref-hero-glow"></div>
          
          <div className="ref-badge-top">
            <div className="ref-icon-circle-pulse">
              <Gift size={28} className="text-white" />
            </div>
            <h2 className="ref-hero-title">Invite Friends & Grow Together</h2>
            <p className="ref-hero-subtitle">
              Share your unique referral link with friends. Whenever they deposit, flat <strong>5%</strong> is credited directly to your GrowMore Wallet!
            </p>
          </div>

          {/* Code & URL Box */}
          <div className="ref-code-card">
            <div className="ref-code-header">
              <div className="ref-code-meta">
                <span className="ref-label-caps">Your Unique Referral Code</span>
                <span className="ref-unique-pill">UNIQUE</span>
              </div>
              <button 
                type="button" 
                className={`ref-copy-btn ${copiedCode ? 'copied' : ''}`}
                onClick={handleCopyCode}
              >
                {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="ref-code-body">
              <div className="ref-code-big">{referralCode}</div>
              <div className="ref-promo-text">Promo Code: <strong>{promoCode}</strong></div>
            </div>

            {/* Direct Link Bar */}
            <div className="ref-url-bar">
              <div className="ref-url-display">
                <LinkIcon size={16} className="text-cyan flex-shrink-0" />
                <span className="ref-url-string">{referralUrl}</span>
              </div>
              <button 
                type="button" 
                className="ref-url-copy-action"
                onClick={handleCopyLink}
              >
                {copiedLink ? 'Link Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>

          {/* Instant Referral Options */}
          <div className="ref-social-container">
            <h3 className="ref-social-heading">Instant Referral Options</h3>
            <div className="ref-social-grid">
              {/* WhatsApp */}
              <button 
                type="button" 
                className="ref-social-card card-whatsapp"
                onClick={handleShareWhatsApp}
              >
                <div className="ref-social-icon-box">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </div>
                <div className="ref-social-info">
                  <span className="ref-social-name">WhatsApp</span>
                  <span className="ref-social-sub">Share on Chat</span>
                </div>
              </button>

              {/* Message / SMS */}
              <button 
                type="button" 
                className="ref-social-card card-message"
                onClick={handleShareSMS}
              >
                <div className="ref-social-icon-box">
                  <MessageSquare size={24} />
                </div>
                <div className="ref-social-info">
                  <span className="ref-social-name">Message</span>
                  <span className="ref-social-sub">Direct SMS</span>
                </div>
              </button>

              {/* Telegram */}
              <button 
                type="button" 
                className="ref-social-card card-telegram"
                onClick={handleShareTelegram}
              >
                <div className="ref-social-icon-box">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.458c.538-.196 1.006.128.832.96z"/>
                  </svg>
                </div>
                <div className="ref-social-info">
                  <span className="ref-social-name">Telegram</span>
                  <span className="ref-social-sub">Group / DM</span>
                </div>
              </button>

              {/* Instagram */}
              <button 
                type="button" 
                className="ref-social-card card-instagram"
                onClick={handleShareInstagram}
              >
                <div className="ref-social-icon-box">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
                <div className="ref-social-info">
                  <span className="ref-social-name">Instagram</span>
                  <span className="ref-social-sub">Direct DM / Bio</span>
                </div>
              </button>

              {/* Copy Link */}
              <button 
                type="button" 
                className="ref-social-card card-copylink"
                onClick={handleCopyLink}
              >
                <div className="ref-social-icon-box">
                  <LinkIcon size={24} />
                </div>
                <div className="ref-social-info">
                  <span className="ref-social-name">Copy Link</span>
                  <span className="ref-social-sub">Direct URL</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Step-by-Step Earning Journey Section */}
        <div className="ref-journey-card glass-card">
          <div className="ref-journey-header">
            <div className="ref-journey-tags">
              <span className="journey-tag-orange">🎨 CARTOON REWARD JOURNEY</span>
              <span className="journey-tag-green">FLAT 5% CASH</span>
            </div>
            <h3 className="ref-journey-title">
              How You Earn ₹5,000 Real Cash! 🤑
            </h3>
            <p className="ref-journey-subtitle">
              Follow this fun cartoon step-by-step example where a friend invests and ₹5,000 drops directly into your wallet:
            </p>
          </div>

          {/* Alex's Story Bubble */}
          <div className="ref-story-bubble">
            <div className="ref-story-avatar">🦸‍♂️</div>
            <div className="ref-story-content">
              <strong className="text-white">Alex says:</strong>
              <p className="ref-story-text">
                "I sent my link to my friend Rahul on WhatsApp. Rahul registered and deposited ₹1,00,000. BAM! 💥 Flat 5% = ₹5,000 was credited directly to my GrowMore wallet! 100% withdrawable!"
              </p>
            </div>
          </div>

          {/* 3 Illustrated Steps */}
          <div className="ref-steps-grid">
            {/* Step 1 */}
            <div className="ref-step-item">
              <div className="ref-step-pill">STEP 1 • SHARE & INVITE</div>
              <div className="ref-step-icon-wrap">💌 🚀</div>
              <h4 className="ref-step-name">Share Your Unique Link</h4>
              <p className="ref-step-desc">
                Send your personal link to Rahul via WhatsApp or SMS in just one tap.
              </p>
              <div className="ref-step-highlight">✨ Takes only 5 seconds!</div>
            </div>

            {/* Step 2 */}
            <div className="ref-step-item">
              <div className="ref-step-pill step-pill-orange">STEP 2 • FRIEND DEPOSITS ₹1,00,000</div>
              <div className="ref-step-icon-wrap">🏦 💳</div>
              <h4 className="ref-step-name">Rahul Registers & Deposits</h4>
              <p className="ref-step-desc">
                Rahul completes his sign-up and makes an investment deposit of ₹1,00,000 into GrowMore.
              </p>
              <div className="ref-step-highlight text-amber">🪙 Deposit verified & locked securely!</div>
            </div>

            {/* Step 3 */}
            <div className="ref-step-item step-item-winner">
              <div className="ref-step-pill step-pill-gold">STEP 3 • BOOM! ₹5,000 WALLET REWARD 🏆</div>
              <div className="ref-step-icon-wrap">🎉 💰</div>
              <h4 className="ref-step-name">You Get Flat 5% (₹5,000 Direct Cash!)</h4>
              <p className="ref-step-desc">
                5% of ₹1,00,000 = ₹5,000 drops straight into your GrowMore Wallet balance!
              </p>
              <div className="ref-step-highlight text-green">⚡ Available to withdraw or reinvest immediately!</div>
            </div>
          </div>

          {/* Reward Ladder & Live Calculator */}
          <div className="ref-ladder-section">
            <div className="ref-ladder-header">
              <h4 className="ref-ladder-title">Cartoon 5% Reward Ladder 🎯</h4>
              <p className="ref-ladder-subtitle">Instant 5% cash credit for every deposit tier:</p>
            </div>

            <div className="ref-ladder-list">
              {ladderTiers.map((tier) => (
                <div 
                  key={tier.deposit} 
                  className={`ref-ladder-row ${tier.popular ? 'row-popular' : ''}`}
                  onClick={() => setCalcAmount(tier.deposit)}
                >
                  <div className="ref-ladder-left">
                    <span className="ref-ladder-tier-icon">{tier.icon}</span>
                    <span className="ref-ladder-deposit-text">
                      Friend Deposits <strong>{formatRupees(tier.deposit)}</strong>
                    </span>
                  </div>
                  <div className="ref-ladder-right">
                    <span className="ref-ladder-reward-text">
                      +{formatRupees(tier.reward)}
                    </span>
                    <span className="ref-ladder-wallet-pill">
                      {tier.popular ? 'In Wallet (POPULAR!)' : 'In Wallet'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Live Referral Amount Calculator */}
            <div className="ref-custom-calc-box">
              <div className="ref-calc-head">
                <Calculator size={18} className="text-cyan" />
                <span>Calculate Your Referral Earning</span>
              </div>
              
              <div className="ref-calc-body">
                <div className="ref-calc-input-wrap">
                  <label htmlFor="ref-calc-input" className="ref-calc-label">
                    Friend Deposits Amount (₹):
                  </label>
                  <div className="ref-calc-input-row">
                    <span className="ref-calc-symbol">₹</span>
                    <input 
                      id="ref-calc-input"
                      type="number"
                      step="any"
                      min="0"
                      className="ref-calc-field"
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="ref-calc-result-box">
                  <span className="ref-calc-res-label">You Get (Flat 5% Cash):</span>
                  <div className="ref-calc-res-amount">+{formatRupees(calculatedEarning)}</div>
                  <span className="ref-calc-res-note">Credited instantly to GrowMore Wallet</span>
                </div>
              </div>

              {/* Preset buttons */}
              <div className="ref-calc-presets">
                <span>Quick Select:</span>
                {[10000, 25000, 50000, 100000, 200000, 500000].map((preset) => (
                  <button 
                    key={preset}
                    type="button"
                    className={`ref-preset-pill ${calcAmount === preset ? 'active' : ''}`}
                    onClick={() => setCalcAmount(preset)}
                  >
                    {formatRupees(preset)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Terms & Conditions (5% Referral Policy) */}
          <div className="ref-terms-card">
            <div className="ref-terms-header">
              <ShieldCheck size={20} className="text-purple-bright" />
              <h4 className="ref-terms-title">Terms & Conditions (5% Referral Policy)</h4>
            </div>

            <div className="ref-terms-grid">
              <div className="ref-term-item">
                <div className="ref-term-icon">
                  <Percent size={18} className="text-purple-bright" />
                </div>
                <div>
                  <h5 className="ref-term-name">Flat 5% Commission on Deposit</h5>
                  <p className="ref-term-desc">
                    Whenever a user registers via your unique referral code/link and makes a deposit, you receive exactly 5% of their deposit amount.
                  </p>
                </div>
              </div>

              <div className="ref-term-item">
                <div className="ref-term-icon">
                  <Wallet size={18} className="text-cyan" />
                </div>
                <div>
                  <h5 className="ref-term-name">Instant Credit to Wallet</h5>
                  <p className="ref-term-desc">
                    The 5% referral commission is automatically added to your GrowMore main wallet as soon as the deposit is confirmed.
                  </p>
                </div>
              </div>

              <div className="ref-term-item">
                <div className="ref-term-icon">
                  <Coins size={18} className="text-amber" />
                </div>
                <div>
                  <h5 className="ref-term-name">Live Example (₹5,000 Earning)</h5>
                  <p className="ref-term-desc">
                    If your referred friend deposits ₹1,00,000, 5% of ₹1,00,000 (₹5,000) will be added directly into your wallet.
                  </p>
                </div>
              </div>

              <div className="ref-term-item">
                <div className="ref-term-icon">
                  <CheckCircle2 size={18} className="text-emerald" />
                </div>
                <div>
                  <h5 className="ref-term-name">Full Usability & Withdrawal</h5>
                  <p className="ref-term-desc">
                    Your earned wallet commission can be used directly to invest in growth plans or withdrawn to your bank account (processed within 24 to 48 hours as per standard settlement).
                  </p>
                </div>
              </div>
            </div>

            <div className="ref-policy-footer">
              <Info size={14} className="text-cyan flex-shrink-0" />
              <span>
                <strong>1-Level Policy:</strong> Direct single-tier referral model only. Multi-level marketing (MLM) and pyramid structures are strictly prohibited on GrowMore.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
