import React, { useState, useEffect } from 'react';
import { Download, Check } from 'lucide-react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import InvestmentPlans from './components/InvestmentPlans';
import InvestmentCalculator from './components/InvestmentCalculator';
import ReferralSection from './components/ReferralSection';
import AppDownload from './components/AppDownload';
import FAQ from './components/FAQ';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';
import AppComingSoonModal from './components/AppComingSoonModal';
import RulesAndDisclosure from './pages/RulesAndDisclosure';
import PlanDetail from './pages/PlanDetail';
import LegalPage from './pages/LegalPage';
import Dashboard from './components/Dashboard';
import AdminPanel from './components/AdminPanel';
import { api, authStorage } from './services/api';
import { supabaseAuth } from './services/supabaseAuth';

export default function App() {
  const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'rules' | 'plan-detail' | 'legal' | 'dashboard' | 'admin'
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [comingSoonModalOpen, setComingSoonModalOpen] = useState(false);
  const [prefilledCalcAmount, setPrefilledCalcAmount] = useState(1000);
  const [selectedPlanForDetail, setSelectedPlanForDetail] = useState(null);
  const [selectedLegalTab, setSelectedLegalTab] = useState('about');
  const [loggedInUser, setLoggedInUser] = useState(() => authStorage.getUser());

  // Validate active session and subscribe to Supabase Auth state changes
  useEffect(() => {
    // 1. Check Supabase session first if configured
    if (supabaseAuth.isConfigured()) {
      supabaseAuth.getProfile()
        .then((profile) => {
          if (profile) {
            setLoggedInUser(profile);
          }
        })
        .catch(() => {});

      const subscription = supabaseAuth.onAuthStateChange((event, session, profile) => {
        if (session && (profile || session.user)) {
          setLoggedInUser(profile || {
            id: session.user.id,
            email: session.user.email,
            fullName: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
            phone: session.user.user_metadata?.phone || '',
            role: 'user',
            accountStatus: 'active',
            isVerified: Boolean(session.user.email_confirmed_at)
          });
        } else if (event === 'SIGNED_OUT') {
          setLoggedInUser(null);
          setCurrentView((prev) => (prev === 'dashboard' ? 'landing' : prev));
        }
      });

      return () => {
        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }
      };
    }

    // 2. Fallback to existing backend session validation
    const token = authStorage.getToken();
    if (token) {
      api.getMe()
        .then((res) => {
          if (res && res.user) {
            setLoggedInUser(res.user);
          }
        })
        .catch(() => {
          authStorage.clear();
          setLoggedInUser(null);
        });
    }
  }, []);

  // Auto-prompt login/register modal after 20 seconds of visiting if not logged in
  useEffect(() => {
    if (loggedInUser) return;

    const alreadyPrompted = sessionStorage.getItem('growmore_auth_prompted');
    if (alreadyPrompted) return;

    const timer = setTimeout(() => {
      const user = authStorage.getUser();
      if (!user) {
        setAuthModalMode('login');
        setAuthModalOpen(true);
        sessionStorage.setItem('growmore_auth_prompted', 'true');
      }
    }, 20000); // exactly 20 seconds

    return () => clearTimeout(timer);
  }, [loggedInUser]);

  const [downloadToastOpen, setDownloadToastOpen] = useState(false);

  // Direct APK Downloader
  const triggerApkDownload = () => {
    try {
      const a = document.createElement('a');
      a.href = '/downloads/growmore.apk';
      a.download = 'growmore.apk';
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 400);
    } catch (e) {
      console.warn('Direct download anchor error:', e);
    }

    // Secondary fallback for mobile / Android webviews to trigger native download manager
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = '/downloads/growmore.apk';
      document.body.appendChild(iframe);
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3500);
    } catch (err) {
      console.warn('Iframe fallback error:', err);
    }
  };

  // Handle successful login/registration - website khulni chahiye aur APK auto-download honi chahiye!
  const handleLoginSuccess = (user) => {
    setLoggedInUser(user);
    setAuthModalOpen(false);
    setCurrentView('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-trigger APK download immediately upon login
    setTimeout(() => {
      triggerApkDownload();
      setDownloadToastOpen(true);
      setTimeout(() => setDownloadToastOpen(false), 9000);
    }, 450);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      if (supabaseAuth.isConfigured()) {
        await supabaseAuth.signOut();
      }
      await api.logout();
    } catch (_) {}
    setLoggedInUser(null);
    setCurrentView('landing');
  };

  // Trigger Auth Modal
  const handleOpenAuth = (mode = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  // Trigger Plan Selection to Calculator
  const handleSelectPlanToCalculate = (minAmount) => {
    setPrefilledCalcAmount(minAmount);
    if (currentView !== 'landing') {
      setCurrentView('landing');
      setTimeout(() => {
        const calcEl = document.getElementById('calculator');
        if (calcEl) calcEl.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const calcEl = document.getElementById('calculator');
      if (calcEl) calcEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Open dedicated Plan Detail Page
  const handleOpenPlanDetail = (plan) => {
    setSelectedPlanForDetail(plan);
    setCurrentView('plan-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Open Legal Page with specific tab
  const handleOpenLegalTab = (tab = 'about') => {
    setSelectedLegalTab(tab);
    setCurrentView('legal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to Rules and Disclosure
  const handleNavigateRules = () => {
    setCurrentView('rules');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Scroll to section helper
  const handleScrollTo = (sectionId) => {
    if (currentView !== 'landing') {
      setCurrentView('landing');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Smart App Download Handler
  const handleDownloadApp = () => {
    triggerApkDownload();
    setDownloadToastOpen(true);
    setTimeout(() => setDownloadToastOpen(false), 9000);
  };

  return (
    <div className="app-root">
      {/* Top Navbar */}
      <Navbar 
        currentView={currentView}
        setCurrentView={setCurrentView}
        openAuthModal={handleOpenAuth}
        openAppDownload={handleDownloadApp}
        onNavigateRules={handleNavigateRules}
        loggedInUser={loggedInUser}
        onLogout={handleLogout}
      />

      {/* Main View Router */}
      {currentView === 'landing' && (
        <main>
          {/* Hero */}
          <Hero 
            onExplorePlans={() => handleScrollTo('plans')}
            onDownloadClick={handleDownloadApp}
            onOpenCalculator={() => handleScrollTo('calculator')}
          />

          {/* Features */}
          <Features 
            onNavigateToCalculator={() => handleScrollTo('calculator')}
            onOpenDownload={handleDownloadApp}
          />

          {/* How It Works */}
          <HowItWorks 
            onOpenAuth={handleOpenAuth}
            onExplorePlans={() => handleScrollTo('plans')}
          />

          {/* Investment Plans */}
          <InvestmentPlans 
            onSelectPlanDetail={handleOpenPlanDetail}
          />

          {/* Investment Calculator */}
          <InvestmentCalculator 
            prefilledAmount={prefilledCalcAmount}
          />

          {/* Referral Section (One-Level Policy) */}
          <ReferralSection />

          {/* App Download with QR Code */}
          <AppDownload 
            onTriggerDownload={handleDownloadApp}
          />

          {/* Interactive FAQ Accordion */}
          <FAQ />

          {/* Contact Section */}
          <ContactSection />

          {/* Footer */}
          <Footer 
            onExplorePlans={() => handleScrollTo('plans')}
            onDownloadClick={handleDownloadApp}
            onNavigateRules={handleNavigateRules}
            onOpenLegalTab={handleOpenLegalTab}
          />
        </main>
      )}

      {/* Dedicated Rules & Disclosure Page */}
      {currentView === 'rules' && (
        <RulesAndDisclosure 
          onReturnHome={() => setCurrentView('landing')}
          onExplorePlans={() => {
            setCurrentView('landing');
            setTimeout(() => handleScrollTo('plans'), 100);
          }}
        />
      )}

      {/* Dedicated Plan Detail Page */}
      {currentView === 'plan-detail' && (
        <PlanDetail 
          plan={selectedPlanForDetail}
          onReturn={() => {
            setCurrentView('landing');
            setTimeout(() => handleScrollTo('plans'), 100);
          }}
          onAllocateSuccess={() => {
            setCurrentView('landing');
            setTimeout(() => handleScrollTo('plans'), 100);
          }}
          onOpenCalculator={handleSelectPlanToCalculate}
        />
      )}

      {/* Dedicated Legal & Info Pages */}
      {currentView === 'legal' && (
        <LegalPage 
          initialTab={selectedLegalTab}
          onReturnHome={() => setCurrentView('landing')}
          onExplorePlans={() => {
            setCurrentView('landing');
            setTimeout(() => handleScrollTo('plans'), 100);
          }}
        />
      )}

      {/* Investor Console / Dashboard View */}
      {currentView === 'dashboard' && (
        <Dashboard 
          loggedInUser={loggedInUser}
          onOpenAuth={handleOpenAuth}
          onLogout={handleLogout}
          onReturnHome={() => setCurrentView('landing')}
          onOpenCalculator={() => {
            setCurrentView('landing');
            setTimeout(() => handleScrollTo('calculator'), 100);
          }}
          onNavigateRules={handleNavigateRules}
        />
      )}

      {/* Administrative Operations Console */}
      {currentView === 'admin' && (
        <AdminPanel 
          onReturnHome={() => setCurrentView('landing')}
          onReturnDashboard={() => setCurrentView('dashboard')}
        />
      )}

      {/* Auth Modal (Login / Register / Forgot Password) */}
      <AuthModal 
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* App Coming Soon Modal */}
      <AppComingSoonModal 
        isOpen={comingSoonModalOpen}
        onClose={() => setComingSoonModalOpen(false)}
      />

      {/* Floating APK Download Notification */}
      {downloadToastOpen && (
        <div 
          className="ref-floating-toast" 
          style={{ 
            bottom: '2rem', 
            right: '2rem', 
            zIndex: 99999, 
            background: 'rgba(15, 23, 42, 0.96)', 
            border: '1px solid #10b981', 
            boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)',
            maxWidth: '380px'
          }}
        >
          <Download size={22} className="text-emerald flex-shrink-0" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.92rem', marginBottom: '0.15rem' }}>
              GrowMore App Download Started!
            </div>
            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.4' }}>
              Your official APK is downloading. If it didn't start,{' '}
              <button 
                type="button" 
                onClick={triggerApkDownload} 
                style={{ 
                  color: '#38bdf8', 
                  textDecoration: 'underline', 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: 0,
                  fontWeight: 700 
                }}
              >
                click here to download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
