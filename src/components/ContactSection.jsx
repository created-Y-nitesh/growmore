import React, { useState } from 'react';
import { 
  Mail, 
  MapPin, 
  Phone, 
  Send, 
  CheckCircle2, 
  MessageSquare,
  Clock
} from 'lucide-react';

export default function ContactSection() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', subject: '', message: '' });
    }, 4000);
  };

  return (
    <section id="contact" className="section-padding">
      <div className="container">
        <div className="section-header">
          <div className="badge badge-cyan">
            <Mail size={13} />
            <span>Get In Touch</span>
          </div>
          <h2 className="section-title">
            Connect with <span className="text-gradient">GrowMore</span>
          </h2>
          <p className="section-desc">
            Have questions regarding our investment plans, institutional architecture, or onboarding? 
            Our digital support desk is always open.
          </p>
        </div>

        <div className="contact-grid">
          {/* Left Info Column */}
          <div className="glass-card contact-info-card">
            <h3 className="ci-heading">Support & Investor Helpdesk</h3>
            <p className="ci-desc">
              We welcome inquiries from investors, institutions, and enterprise partners across the GrowMore 
              fintech ecosystem.
            </p>

            <div className="ci-list">
              <div className="ci-item">
                <div className="ci-icon-box">
                  <Mail size={18} className="text-cyan" />
                </div>
                <div>
                  <div className="ci-label">Email Support</div>
                  <div className="ci-value">support@growmore.app</div>
                </div>
              </div>

              <div className="ci-item">
                <div className="ci-icon-box">
                  <Phone size={18} className="text-purple" />
                </div>
                <div>
                  <div className="ci-label">Help Desk (Toll Free)</div>
                  <div className="ci-value">1800-200-GROWMORE</div>
                </div>
              </div>

              <div className="ci-item">
                <div className="ci-icon-box">
                  <MapPin size={18} className="text-cyan" />
                </div>
                <div>
                  <div className="ci-label">Headquarters</div>
                  <div className="ci-value">Fintech Valley, Bengaluru, Karnataka, India</div>
                </div>
              </div>

              <div className="ci-item">
                <div className="ci-icon-box">
                  <Clock size={18} className="text-purple" />
                </div>
                <div>
                  <div className="ci-label">Operational Hours</div>
                  <div className="ci-value">Monday – Saturday: 9:00 AM – 7:00 PM IST</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Form Column */}
          <div className="glass-card contact-form-card">
            <h3 className="cf-heading">Send Us a Direct Message</h3>
            
            {submitted ? (
              <div className="form-success-alert">
                <CheckCircle2 size={24} className="text-cyan" />
                <div>
                  <h4>Message Received!</h4>
                  <p>Thank you for reaching out. Our investor support desk will review your message within 2 business hours.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-form">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="ct-name">Your Name</label>
                    <input 
                      id="ct-name"
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Rahul Verma"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ct-email">Email Address</label>
                    <input 
                      id="ct-email"
                      type="email" 
                      className="form-input" 
                      placeholder="name@example.com"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ct-subject">Inquiry Subject</label>
                  <input 
                    id="ct-subject"
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Question regarding Starter Plan"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ct-message">Your Message</label>
                  <textarea 
                    id="ct-message"
                    rows="4" 
                    className="form-input form-textarea" 
                    placeholder="Write your question or feedback..."
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  ></textarea>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <Send size={16} />
                  <span>Send Message</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
