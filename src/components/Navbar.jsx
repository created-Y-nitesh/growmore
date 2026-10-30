import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Smartphone, 
  Menu, 
  X, 
  User, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export default function Navbar({ 
  currentView, 
  setCurrentView, 
  openAuthModal, 
  openAppDownload,
  onNavigateRules,
  loggedInUser,
  onLogout
}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', href: '#home', isAnchor: true },
    { label: 'Features', href: '#features', isAnchor: true },
    { label: 'Investment Plans', href: '#plans', isAnchor: true },
    { label: 'Calculator', href: '#calculator', isAnchor: true },
    { label: 'How It Works', href: '#how-it-works', isAnchor: true },
    { label: 'Rules & Disclosure', isView: 'rules' },
    { label: 'Download App', href: '#download', isAnchor: true },
    { label: 'Contact', href: '#contact', isAnchor: true },
  ];

  const handleLinkClick = (e, link) => {
    e.preventDefault();
    setMobileMenuOpen(false);

    if (link.isView === 'rules') {
      if (onNavigateRules) onNavigateRules();
      return;
    }

    if (currentView !== 'landing') {
      setCurrentView('landing');
      setTimeout(() => {
        const el = document.querySelector(link.href);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.querySelector(link.href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
      <div className="container nav-container">
        {/* Brand Logo - Clean without fintech badge */}
        <a 
          href="#home" 
          className="brand-logo"
          onClick={(e) => {
            e.preventDefault();
            setCurrentView('landing');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <div className="logo-icon-wrap">
            <TrendingUp className="logo-svg" size={24} />
          </div>
          <span className="brand-name">
            Grow<span className="brand-highlight">More</span>
          </span>
        </a>

        {/* Desktop Navigation Links */}
        <div className="nav-menu">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href || '#'}
              className={`nav-link ${currentView === 'rules' && link.isView === 'rules' ? 'active-link' : ''}`}
              onClick={(e) => handleLinkClick(e, link)}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Action Controls */}
        <div className="nav-actions">
          {loggedInUser ? (
            <>
              {loggedInUser.role === 'admin' && (
                <button 
                  className="btn btn-secondary btn-sm"
                  style={{ borderColor: '#10b981', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}
                  onClick={() => setCurrentView('admin')}
                  title="Admin Operations"
                >
                  <ShieldCheck size={15} />
                  <span>Admin</span>
                </button>
              )}

              <button 
                className="btn btn-primary btn-sm"
                onClick={() => setCurrentView('dashboard')}
              >
                <TrendingUp size={15} />
                <span>Console ({(loggedInUser.fullName || loggedInUser.name || 'Investor').split(' ')[0]})</span>
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={onLogout}
                title="Sign Out"
              >
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => openAuthModal('login')}
              >
                <User size={15} />
                <span>Login</span>
              </button>

              <button 
                className="btn btn-primary btn-sm"
                onClick={() => openAuthModal('register')}
              >
                <span>Sign Up</span>
                <ArrowRight size={15} />
              </button>
            </>
          )}

          {/* Mobile menu trigger */}
          <button 
            className="mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer">
          <div className="mobile-drawer-content">
            <div className="mobile-nav-links">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href || '#'}
                  className="mobile-nav-link"
                  onClick={(e) => handleLinkClick(e, link)}
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="mobile-drawer-actions">
              <button 
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAppDownload();
                }}
              >
                <Smartphone size={18} />
                <span>Download Android App</span>
              </button>

              {loggedInUser ? (
                <div style={{ display: 'grid', gridTemplateColumns: loggedInUser.role === 'admin' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.5rem' }}>
                  {loggedInUser.role === 'admin' && (
                    <button 
                      className="btn btn-secondary"
                      style={{ borderColor: '#10b981', color: '#10b981' }}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setCurrentView('admin');
                      }}
                    >
                      Admin
                    </button>
                  )}
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setCurrentView('dashboard');
                    }}
                  >
                    Console
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openAuthModal('login');
                    }}
                  >
                    Login
                  </button>
                  <button 
                    className="btn btn-outline-cyan"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openAuthModal('register');
                    }}
                  >
                    Register
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
