import React from 'react';
import { 
  Navigation, 
  UserCheck, 
  History, 
  Calculator, 
  ShieldCheck, 
  Smartphone,
  TrendingUp,
  Cpu
} from 'lucide-react';

export default function Features({ onNavigateToCalculator, onOpenDownload }) {
  const features = [
    {
      icon: <Navigation size={26} className="text-cyan" />,
      title: 'Simple Navigation',
      description: 'Clean, distraction-free architecture designed for quick access to your portfolio, returns, and investment options across any device.',
      badge: 'Intuitive UX'
    },
    {
      icon: <UserCheck size={26} className="text-purple" />,
      title: 'Account Management',
      description: 'Streamlined profile controls, biometric-ready security previews, and clear verification status to keep you in total control.',
      badge: 'Secure & Clean'
    },
    {
      icon: <History size={26} className="text-cyan" />,
      title: 'Transaction History',
      description: 'Real-time ledger tracking deposits, investment allocations, yield payouts, and withdrawals with transparent timestamps.',
      badge: 'Audit Ready'
    },
    {
      icon: <Calculator size={26} className="text-purple" />,
      title: 'Interactive Calculator',
      description: 'Instant calculation of 10% returns across selectable durations, giving you complete clarity before deploying any capital.',
      badge: 'Transparent',
      action: { label: 'Try Calculator', onClick: onNavigateToCalculator }
    },
    {
      icon: <TrendingUp size={26} className="text-cyan" />,
      title: 'Tiered Investment Plans',
      description: 'Choose between Starter (₹1,000), Silver (₹5,000), and Gold (₹10,000) structured plans tailored to your financial journey.',
      badge: 'Flexible Tiers'
    },
    {
      icon: <Smartphone size={26} className="text-purple" />,
      title: 'Mobile Companion App',
      description: 'Take your investments everywhere. Designed natively for Android smartphones with touch ID, push notifications, and fast syncing.',
      badge: 'Android APK',
      action: { label: 'Get APK', onClick: onOpenDownload }
    }
  ];

  return (
    <section id="features" className="section-padding">
      <div className="container">
        <div className="section-header">
          <div className="badge">Platform Architecture</div>
          <h2 className="section-title">
            Engineered for <span className="text-gradient">Simplicity & Growth</span>
          </h2>
          <p className="section-desc">
            Everything you need to track, manage, and project your financial horizons with 
            unmatched visual clarity and modern security paradigms.
          </p>
        </div>

        <div className="features-grid">
          {features.map((feature, idx) => (
            <div key={idx} className="glass-card feature-card">
              <div className="feature-icon-wrapper">
                {feature.icon}
              </div>
              <div className="feature-badge">{feature.badge}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
              
              {feature.action && (
                <button 
                  className="feature-action-btn"
                  onClick={feature.action.onClick}
                >
                  <span>{feature.action.label}</span>
                  <span>→</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
