import React from 'react';
import { UserPlus, Compass, Activity, ArrowRight, Check } from 'lucide-react';

export default function HowItWorks({ onOpenAuth, onExplorePlans }) {
  const steps = [
    {
      step: '01',
      title: 'Create Account',
      subtitle: 'Fast 60-Second Setup',
      desc: 'Register in seconds with basic credentials and preview a streamlined verification flow designed for modern digital privacy.',
      icon: <UserPlus size={28} className="text-purple" />,
      actionText: 'Start Registration',
      action: () => onOpenAuth('register'),
      highlights: ['No paperwork needed', 'Instant digital access', 'Privacy-first architecture']
    },
    {
      step: '02',
      title: 'Explore Plans',
      subtitle: 'Pick Your Growth Horizon',
      desc: 'Review our Starter (₹1,000), Silver (₹5,000), and Gold (₹10,000) structured plans. Use the calculator to test sample returns.',
      icon: <Compass size={28} className="text-cyan" />,
      actionText: 'View All Plans',
      action: onExplorePlans,
      highlights: ['Transparent minimums', 'Selectable terms', 'Fixed yield terms']
    },
    {
      step: '03',
      title: 'Track Your Growth',
      subtitle: 'Clear Financial Visibility',
      desc: 'Monitor your investments with live performance tracking, automated maturity payouts, and verified banking settlements.',
      icon: <Activity size={28} className="text-purple" />,
      actionText: 'Explore Horizons',
      action: onExplorePlans,
      highlights: ['Transparent models', 'Real-time projections', 'Zero hidden fees']
    }
  ];

  return (
    <section id="how-it-works" className="section-padding bg-darker">
      <div className="container">
        <div className="section-header">
          <div className="badge badge-cyan">Simple 3-Step Process</div>
          <h2 className="section-title">
            How <span className="text-gradient">GrowMore</span> Works
          </h2>
          <p className="section-desc">
            A frictionless journey from initial registration to exploring curated investment plans. 
            Three straightforward steps to complete financial visibility.
          </p>
        </div>

        <div className="steps-grid">
          {steps.map((item, idx) => (
            <div key={idx} className="glass-card step-card">
              <div className="step-card-header">
                <span className="step-number">{item.step}</span>
                <div className="step-icon-box">{item.icon}</div>
              </div>

              <div className="step-sub">{item.subtitle}</div>
              <h3 className="step-title">{item.title}</h3>
              <p className="step-desc">{item.desc}</p>

              <div className="step-highlights">
                {item.highlights.map((h, i) => (
                  <div key={i} className="step-hl-item">
                    <Check size={14} className="text-cyan" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>

              <button className="btn btn-secondary btn-sm step-btn" onClick={item.action}>
                <span>{item.actionText}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
