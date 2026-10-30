import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  PieChart, 
  Layers, 
  RefreshCw, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  Copy, 
  Share2, 
  Search, 
  Send, 
  Smartphone, 
  CreditCard, 
  Building2, 
  User, 
  LogOut, 
  BookOpen, 
  HelpCircle,
  ArrowRight,
  Info,
  Bell,
  CheckCheck,
  X,
  Lock,
  FileText,
  UploadCloud,
  Eye,
  Zap,
  ExternalLink,
  QrCode
} from 'lucide-react';
import { INVESTMENT_PLANS, RULES_AND_DISCLOSURES } from '../data/mockData';
import { formatRupees } from '../utils/formatters';
import { api, authStorage } from '../services/api';
import { supabaseAuth } from '../services/supabaseAuth';

export default function Dashboard({ 
  onReturnHome, 
  onOpenCalculator, 
  onNavigateRules,
  loggedInUser,
  onOpenAuth,
  onLogout
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Notifications State & Interactive View
  const [notifications, setNotifications] = useState([
    {
      id: 'n_1',
      title: 'Portfolio Snapshot',
      time: '15m ago',
      description: 'Your investment holdings gained +1.4% this week based on latest market evaluations.',
      category: 'Portfolio',
      actionLabel: 'View Portfolio',
      targetTab: 'overview',
      isRead: false
    },
    {
      id: 'n_2',
      title: 'Refer & Earn Launched',
      time: '2h ago',
      description: 'Invite your friends to GrowMore and earn rewards when they start their wealth journey.',
      category: 'Promotions',
      actionLabel: 'Invite Friends',
      targetTab: 'referral',
      isRead: false
    },
    {
      id: 'n_3',
      title: 'New ESG Curated Plan Added',
      time: '1d ago',
      description: 'Explore the Green Energy & ESG Fund focusing on sustainable renewable growth.',
      category: 'Investments',
      actionLabel: 'Explore Plan',
      targetTab: 'plans',
      isRead: true
    }
  ]);
  const [showNotificationsView, setShowNotificationsView] = useState(false);
  const [selectedNotifFilter, setSelectedNotifFilter] = useState('All');
  const [activeNotifDetail, setActiveNotifDetail] = useState(null);

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  const markAllNotifsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotificationCardClick = (notif) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    setActiveNotifDetail(notif);
  };
  
  // Real authenticated user profile — no fabricated customer identity
  const [userProfile, setUserProfile] = useState(() => {
    return loggedInUser || authStorage.getUser() || null;
  });

  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    const active = loggedInUser || authStorage.getUser();
    if (active) {
      setUserProfile(active);
      setEditFullName(active.fullName || active.full_name || '');
      setEditPhone(active.phone || '');
      setEditDob(active.dob ? active.dob.split('T')[0] : '');
    } else {
      setUserProfile(null);
    }
  }, [loggedInUser]);

  useEffect(() => {
    if (supabaseAuth.isConfigured()) {
      supabaseAuth.getProfile()
        .then((prof) => {
          if (prof) {
            setUserProfile(prof);
            setEditFullName(prof.fullName || prof.full_name || '');
            setEditPhone(prof.phone || '');
            setEditDob(prof.dob ? prof.dob.split('T')[0] : '');
          }
        })
        .catch(() => {});
    } else if (authStorage.getToken()) {
      api.getProfile()
        .then((res) => {
          if (res && res.profile) {
            setUserProfile(res.profile);
            setEditFullName(res.profile.full_name || res.profile.fullName || '');
            setEditPhone(res.profile.phone || '');
            setEditDob(res.profile.dob ? res.profile.dob.split('T')[0] : '');
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });

    if (!editFullName.trim()) {
      setProfileMsg({ type: 'error', text: 'Full name cannot be blank.' });
      return;
    }

    setIsUpdatingProfile(true);
    try {
      if (supabaseAuth.isConfigured()) {
        await supabaseAuth.updateProfile({
          full_name: editFullName.trim(),
          phone: editPhone.trim(),
          dob: editDob || null
        });
      } else {
        await api.updateProfile({
          full_name: editFullName.trim(),
          phone: editPhone.trim(),
          dob: editDob || null
        });
      }

      setUserProfile((prev) => ({
        ...prev,
        fullName: editFullName.trim(),
        full_name: editFullName.trim(),
        phone: editPhone.trim(),
        dob: editDob || null
      }));

      setProfileMsg({ type: 'success', text: 'Profile updated successfully in secure database.' });
      setTimeout(() => setProfileMsg({ type: '', text: '' }), 4500);
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Real authoritative wallet state from PostgreSQL wallet_ledger
  const [wallets, setWallets] = useState({
    availableBalance: 0,
    topUpWallet: 0,
    withdrawWallet: 0,
    principalLocked: 0,
    interestBalance: 0,
    dailyEarningBalance: 0,
    canWithdrawInterest: false,
    canWithdrawDailyEarning: false,
    minInterestWithdrawal: 500,
    minDailyEarningWithdrawal: 1000,
    hasDailyPlan: false,
    hasSuperPlan: false,
    totalPortfolio: 0,
    totalInvested: 0,
    illustrativeEarnings: 0,
    pendingWithdrawals: 0,
    pendingDeposits: 0,
    currency: 'INR'
  });
  const [withdrawSource, setWithdrawSource] = useState('interest'); // 'interest' | 'daily_earning'

  // Real backend investments, transactions, deposits, and withdrawals
  const [activePlans, setActivePlans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [depositsList, setDepositsList] = useState([]);
  const [withdrawalsList, setWithdrawalsList] = useState([]);

  // KYC Verification State
  const [kycDocuments, setKycDocuments] = useState([]);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMsg, setKycMsg] = useState({ type: '', text: '' });
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [isUploadingAadhaar, setIsUploadingAadhaar] = useState(false);
  const [panNumber, setPanNumber] = useState('');
  const [panFile, setPanFile] = useState(null);
  const [isUploadingPan, setIsUploadingPan] = useState(false);
  const [selfieFile, setSelfieFile] = useState(null);
  const [isUploadingSelfie, setIsUploadingSelfie] = useState(false);

  // Fetch real authoritative data from backend
  const refreshAllData = async () => {
    try {
      setIsLoadingData(true);
      const [walletRes, invsRes, txnsRes, depsRes, wdrsRes, kycRes] = await Promise.all([
        api.getWallet().catch(() => null),
        api.getMyInvestments().catch(() => null),
        api.getTransactions().catch(() => null),
        api.getMyDeposits().catch(() => null),
        api.getMyWithdrawals().catch(() => null),
        api.getMyKycDocuments().catch(() => null)
      ]);

      if (kycRes && kycRes.documents) {
        setKycDocuments(kycRes.documents);
      }

      if (walletRes && walletRes.wallet) {
        const w = walletRes.wallet;
        setWallets({
          availableBalance: w.availableBalance || 0,
          topUpWallet: w.availableBalance || 0,
          withdrawWallet: w.totalWithdrawable || ((w.interestBalance || 0) + (w.dailyEarningBalance || 0)),
          principalLocked: w.principalLocked || w.lockedInInvestments || 0,
          interestBalance: w.interestBalance || 0,
          dailyEarningBalance: w.dailyEarningBalance || 0,
          canWithdrawInterest: w.canWithdrawInterest || false,
          canWithdrawDailyEarning: w.canWithdrawDailyEarning || false,
          minInterestWithdrawal: w.minInterestWithdrawal || 500,
          minDailyEarningWithdrawal: w.minDailyEarningWithdrawal || 1000,
          hasDailyPlan: w.hasDailyPlan || false,
          hasSuperPlan: w.hasSuperPlan || false,
          totalPortfolio: w.totalPortfolio || 0,
          totalInvested: w.principalLocked || w.lockedInInvestments || 0,
          illustrativeEarnings: w.estimatedReturns || 0,
          pendingWithdrawals: w.pendingWithdrawals || 0,
          pendingDeposits: w.pendingDeposits || 0,
          currency: w.currency || 'INR'
        });
      }

      if (invsRes && invsRes.investments) {
        setActivePlans(invsRes.investments.map(inv => ({
          id: `INV-${inv.id}`,
          rawId: inv.id,
          name: inv.planName,
          invested: inv.principalAmount,
          startDate: inv.startDate ? new Date(inv.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending activation',
          maturityDate: inv.maturityDate ? new Date(inv.maturityDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : `${inv.durationDays} Days lock-in`,
          durationDays: inv.durationDays,
          illustrativeGain: inv.expectedReturnAmount,
          status: inv.status.charAt(0).toUpperCase() + inv.status.slice(1)
        })));
      }

      if (txnsRes && txnsRes.transactions) {
        setTransactions(txnsRes.transactions.map(t => ({
          id: t.id,
          type: t.type,
          wallet: t.wallet,
          amount: t.amount,
          method: t.metadata && t.metadata.planName ? `Plan: ${t.metadata.planName}` : (t.metadata && t.metadata.paymentChannel ? t.metadata.paymentChannel : t.type),
          date: new Date(t.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          status: t.status === 'COMPLETED' ? 'Completed' : (t.status === 'PENDING' ? 'Pending' : t.status)
        })));
      }

      if (depsRes && depsRes.deposits) {
        setDepositsList(depsRes.deposits);
      }

      if (wdrsRes && wdrsRes.withdrawals) {
        setWithdrawalsList(wdrsRes.withdrawals);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Fetch KYC documents
  const fetchKycDocuments = async () => {
    try {
      setKycLoading(true);
      const res = await api.getMyKycDocuments();
      if (res && res.documents) {
        setKycDocuments(res.documents);
      }
    } catch (e) {
      console.warn('KYC fetch error', e);
    } finally {
      setKycLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'kyc') {
      fetchKycDocuments();
    }
  }, [activeTab]);

  // Handle KYC Document Upload
  const handleUploadKyc = async (type, file, docNumber = '') => {
    if (!file) {
      setKycMsg({ type: 'error', text: `Please choose a document file to upload for ${type.toUpperCase()}.` });
      return;
    }

    if (type === 'aadhaar') {
      const cleanNum = docNumber.replace(/\s+/g, '');
      if (!cleanNum || cleanNum.length !== 12 || !/^\d{12}$/.test(cleanNum)) {
        setKycMsg({ type: 'error', text: 'Please enter a valid 12-digit Aadhaar number.' });
        return;
      }
    }

    if (type === 'pan') {
      const cleanPan = docNumber.toUpperCase().trim();
      if (!cleanPan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
        setKycMsg({ type: 'error', text: 'Please enter a valid 10-character PAN number (e.g. ABCDE1234F).' });
        return;
      }
    }

    setKycMsg({ type: '', text: '' });
    if (type === 'aadhaar') setIsUploadingAadhaar(true);
    if (type === 'pan') setIsUploadingPan(true);
    if (type === 'selfie') setIsUploadingSelfie(true);

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('documentType', type);
      if (docNumber) {
        formData.append('documentNumber', docNumber.trim());
      }

      const res = await api.uploadKycDocument(formData);
      setKycMsg({ type: 'success', text: res.message || `${type.toUpperCase()} uploaded successfully for compliance verification.` });
      
      if (type === 'aadhaar') { setAadhaarFile(null); setAadhaarNumber(''); }
      if (type === 'pan') { setPanFile(null); setPanNumber(''); }
      if (type === 'selfie') { setSelfieFile(null); }

      await fetchKycDocuments();
      await refreshAllData();
    } catch (err) {
      setKycMsg({ type: 'error', text: err.message || `Failed to upload ${type}.` });
    } finally {
      if (type === 'aadhaar') setIsUploadingAadhaar(false);
      if (type === 'pan') setIsUploadingPan(false);
      if (type === 'selfie') setIsUploadingSelfie(false);
    }
  };

  // Open secure signed URL for KYC document preview
  const handleViewKycDocument = async (docId) => {
    try {
      const res = await api.getKycDocumentById(docId);
      if (res && res.document && res.document.signedUrl) {
        window.open(res.document.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        setKycMsg({ type: 'error', text: 'Could not generate secure view link for document.' });
      }
    } catch (err) {
      setKycMsg({ type: 'error', text: err.message || 'Failed to open document view.' });
    }
  };

  // Top Up Wallet form
  const [topUpAmount, setTopUpAmount] = useState('5000');
  const [topUpRef, setTopUpRef] = useState(`UTR-${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  const [topUpMethod, setTopUpMethod] = useState('UroPay (Instant UPI / QR)');
  const [topUpStatusMsg, setTopUpStatusMsg] = useState('');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

  // UroPay Checkout & Verification State
  const [uropayModalOpen, setUropayModalOpen] = useState(false);
  const [uropayOrder, setUropayOrder] = useState(null);
  const [uropayUtr, setUropayUtr] = useState('');
  const [uropayVerifying, setUropayVerifying] = useState(false);
  const [uropayVerifyMsg, setUropayVerifyMsg] = useState('');

  const handleVerifyUroPayPayment = async () => {
    if (!uropayOrder) return;
    try {
      setUropayVerifying(true);
      setUropayVerifyMsg('Verifying payment status with UroPay gateway...');

      const verifyRes = await api.verifyPayment({
        orderId: uropayOrder.orderId,
        depositId: uropayOrder.depositId,
        utr: uropayUtr.trim() || undefined,
        paymentId: uropayUtr.trim() || `pay_${Date.now()}`
      });

      if (verifyRes.success) {
        setUropayVerifyMsg('Payment successfully verified! Your wallet has been credited.');
        await refreshAllData();
        setTimeout(() => {
          setUropayModalOpen(false);
          setUropayOrder(null);
          setUropayUtr('');
          setUropayVerifyMsg('');
          setTopUpStatusMsg('Deposit successful! Top Up Wallet credited.');
        }, 2200);
      } else {
        setUropayVerifyMsg(verifyRes.message || 'Payment not yet confirmed. Please verify transaction ID or try again.');
      }
    } catch (err) {
      setUropayVerifyMsg(err.message || 'Verification failed. Please check transaction ID or try again.');
    } finally {
      setUropayVerifying(false);
    }
  };

  // Withdrawal form
  const [withdrawAmount, setWithdrawAmount] = useState('1000');
  const [withdrawMethod, setWithdrawMethod] = useState('HDFC Bank (A/C •••• 4091)');
  const [withdrawStatusMsg, setWithdrawStatusMsg] = useState('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  // Support ticket form
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMsg, setTicketMsg] = useState('');
  const [ticketSubmitted, setTicketSubmitted] = useState(false);

  // Transaction filter & search
  const [filterType, setFilterType] = useState('All');
  const [searchTxn, setSearchTxn] = useState('');

  const referralLink = `https://growmore.app/join?ref=${userProfile.referralCode || 'GM-INVESTOR'}`;

  const handleCopyReferral = () => {
    navigator.clipboard?.writeText(referralLink);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2500);
  };

  const handleTopUpSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(topUpAmount);
    if (!amt || amt < 100) {
      setTopUpStatusMsg('Minimum deposit amount is ₹100.');
      return;
    }

    setIsSubmittingDeposit(true);
    setTopUpStatusMsg('');

    try {
      setTopUpStatusMsg('Initializing secure UroPay real money checkout...');
      const orderData = await api.createPaymentOrder({
        amount: amt,
        purpose: 'wallet_topup'
      });

      if (!orderData || !orderData.orderId) {
        throw new Error('Failed to generate UroPay order from backend.');
      }

      setUropayOrder(orderData);
      setUropayModalOpen(true);
      setTopUpStatusMsg('UroPay order initialized. Complete payment in checkout window.');
    } catch (err) {
      setTopUpStatusMsg(`Error: ${err.message || 'Failed to initialize UroPay checkout.'}`);
    } finally {
      setIsSubmittingDeposit(false);
    }
  };


  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(withdrawAmount);

    if (withdrawSource === 'interest') {
      if (!amt || amt < 500) {
        setWithdrawStatusMsg('Minimum interest withdrawal is ₹500.');
        return;
      }
      if (amt > wallets.interestBalance) {
        setWithdrawStatusMsg(`Insufficient interest balance (${formatRupees(wallets.interestBalance)} available in Interest Wallet).`);
        return;
      }
    } else if (withdrawSource === 'daily_earning') {
      const minDaily = wallets.minDailyEarningWithdrawal || (wallets.hasSuperPlan ? 3000 : 1000);
      if (!amt || amt < minDaily) {
        setWithdrawStatusMsg(`Minimum withdrawal for Daily Earnings is ${formatRupees(minDaily)}.`);
        return;
      }
      if (amt > wallets.dailyEarningBalance) {
        setWithdrawStatusMsg(`Insufficient daily earnings balance (${formatRupees(wallets.dailyEarningBalance)} available in Daily Earnings Wallet).`);
        return;
      }
    }

    setIsSubmittingWithdraw(true);
    try {
      const res = await api.createWithdrawal({
        amount: amt,
        sourceWallet: withdrawSource,
        payoutMethod: withdrawMethod,
        payoutDetails: { method: withdrawMethod, sourceWallet: withdrawSource }
      });
      setWithdrawStatusMsg(res.message || `Withdrawal request placed for ₹${amt}. Funds are reserved.`);
      setWithdrawAmount('');
      await refreshAllData();
      setTimeout(() => setWithdrawStatusMsg(''), 6000);
    } catch (err) {
      setWithdrawStatusMsg(`Error: ${err.message || 'Failed to submit withdrawal request.'}`);
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const handleInvestInPlan = async (plan) => {
    if (wallets.topUpWallet < plan.minAmount) {
      alert(`Insufficient available balance (${formatRupees(wallets.topUpWallet)}). Please deposit at least ${formatRupees(plan.minAmount)} first via Top Up Wallet tab.`);
      return;
    }

    try {
      const res = await api.createInvestment({
        planId: plan.id,
        principalAmount: plan.minAmount
      });
      alert(res.message || `Success: Activated ${plan.name} with ${formatRupees(plan.minAmount)} capital.`);
      await refreshAllData();
    } catch (err) {
      alert(`Allocation error: ${err.message || 'Unable to allocate plan.'}`);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesType = filterType === 'All' || t.type.toLowerCase().includes(filterType.toLowerCase());
    const matchesSearch = t.id.toLowerCase().includes(searchTxn.toLowerCase()) || 
                          t.method.toLowerCase().includes(searchTxn.toLowerCase()) ||
                          t.type.toLowerCase().includes(searchTxn.toLowerCase());
    return matchesType && matchesSearch;
  });

  if (showNotificationsView) {
    const filteredNotifs = notifications.filter(n => {
      if (selectedNotifFilter === 'All') return true;
      if (selectedNotifFilter === 'Unread') return !n.isRead;
      return n.category.toLowerCase() === selectedNotifFilter.toLowerCase();
    });

    return (
      <div className="notifications-fullpage-screen" style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#070B1A',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden'
      }}>
        {/* Full-Page Header */}
        <header style={{
          background: 'rgba(11, 16, 38, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '0.9rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={() => setShowNotificationsView(false)} 
              className="dash-icon-btn"
              title="Back to Dashboard"
              style={{ width: '40px', height: '40px', borderRadius: '12px' }}
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Notifications
              </h1>
              {unreadNotifCount > 0 && (
                <span style={{
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color: '#FFFFFF',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  boxShadow: '0 0 10px rgba(124, 58, 237, 0.4)'
                }}>
                  {unreadNotifCount} new
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={markAllNotifsRead}
              disabled={unreadNotifCount === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: unreadNotifCount > 0 ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                border: unreadNotifCount > 0 ? '1px solid rgba(124, 58, 237, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: unreadNotifCount > 0 ? '#c084fc' : '#64748b',
                padding: '0.45rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: unreadNotifCount > 0 ? 'pointer' : 'default',
                transition: 'all 0.2s ease'
              }}
            >
              <CheckCheck size={16} />
              <span>Mark all as read</span>
            </button>
          </div>
        </header>

        {/* Scrollable Container with centered responsive constraint */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Filter Chips Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              overflowX: 'auto',
              paddingBottom: '0.25rem'
            }}>
              {['All', 'Unread', 'Portfolio', 'Promotions', 'Investments'].map(cat => {
                const isSelected = selectedNotifFilter.toLowerCase() === cat.toLowerCase();
                const countBadge = cat === 'All' ? notifications.length : (cat === 'Unread' ? unreadNotifCount : null);
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedNotifFilter(cat)}
                    style={{
                      background: isSelected ? 'linear-gradient(135deg, #7c3aed, #9333ea)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#FFFFFF' : '#94a3b8',
                      border: isSelected ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '999px',
                      padding: '0.4rem 0.9rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span>{cat}</span>
                    {countBadge !== null && (
                      <span style={{
                        background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '999px',
                        fontSize: '0.72rem'
                      }}>
                        {countBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Notifications List */}
            {filteredNotifs.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '20px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(124, 58, 237, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem auto',
                  color: '#a855f7'
                }}>
                  <Bell size={28} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#FFFFFF' }}>
                  No Notifications
                </h3>
                <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  You are completely caught up! We will alert you whenever new updates about your portfolio or plans arrive.
                </p>
                {selectedNotifFilter !== 'All' && (
                  <button
                    onClick={() => setSelectedNotifFilter('All')}
                    style={{
                      marginTop: '1.25rem',
                      background: 'rgba(124, 58, 237, 0.15)',
                      border: '1px solid rgba(124, 58, 237, 0.35)',
                      color: '#c084fc',
                      padding: '0.5rem 1rem',
                      borderRadius: '10px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Show All Notifications
                  </button>
                )}
              </div>
            ) : (
              filteredNotifs.map(item => {
                const isUnread = !item.isRead;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationCardClick(item)}
                    style={{
                      width: '100%',
                      background: isUnread ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isUnread ? '1px solid rgba(168, 85, 247, 0.38)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderLeft: isUnread ? '4px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '16px',
                      padding: '1.15rem 1.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      transition: 'all 0.2s ease',
                      boxShadow: isUnread ? '0 4px 20px rgba(124, 58, 237, 0.15)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = isUnread ? 'rgba(168, 85, 247, 0.38)' : 'rgba(255, 255, 255, 0.06)';
                    }}
                  >
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: item.category === 'Portfolio' 
                        ? 'rgba(16, 185, 129, 0.15)' 
                        : item.category === 'Promotions'
                          ? 'rgba(139, 92, 246, 0.15)'
                          : 'rgba(6, 182, 212, 0.15)',
                      color: item.category === 'Portfolio'
                        ? '#34d399'
                        : item.category === 'Promotions'
                          ? '#c084fc'
                          : '#22d3ee',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {item.category === 'Portfolio' ? <TrendingUp size={20} /> : item.category === 'Promotions' ? <Share2 size={20} /> : <Layers size={20} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.98rem', fontWeight: isUnread ? 700 : 600, color: '#FFFFFF' }}>
                            {item.title}
                          </span>
                          {isUnread && (
                            <span style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor: '#a855f7',
                              boxShadow: '0 0 6px #a855f7'
                            }} />
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {item.time}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                        {item.description}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#94a3b8',
                          fontWeight: 600
                        }}>
                          {item.category}
                        </span>

                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.8rem',
                          color: '#c084fc',
                          fontWeight: 600
                        }}>
                          {item.actionLabel || 'View Details'}
                          <ArrowRight size={13} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

          </div>
        </div>

        {/* Detail Modal if clicked */}
        {activeNotifDetail && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}>
            <div style={{
              background: '#0c1024',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '20px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(124, 58, 237, 0.15)',
                    color: '#c084fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Bell size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                      {activeNotifDetail.title}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {activeNotifDetail.category} • {activeNotifDetail.time}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveNotifDetail(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '0.25rem'
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                {activeNotifDetail.description}
              </p>

              <div style={{
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                fontSize: '0.82rem',
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <ShieldCheck size={16} />
                <span>Verified platform transaction and real-time ledger sync.</span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => setActiveNotifDetail(null)}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                    padding: '0.65rem',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    const tab = activeNotifDetail.targetTab || 'overview';
                    setActiveNotifDetail(null);
                    setShowNotificationsView(false);
                    setActiveTab(tab);
                  }}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '0.65rem',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {activeNotifDetail.actionLabel || 'Go to Section'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Protected Route Guard: Never allow unauthenticated visitors or fake customer identities
  if (!userProfile) {
    return (
      <div className="dashboard-layout" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="glass-card" style={{ maxWidth: '440px', width: '100%', padding: '2.5rem', textAlign: 'center', borderRadius: '24px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(108, 56, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#a78bfa' }}>
            <Lock size={30} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.6rem', color: '#FFFFFF' }}>Authentication Required</h2>
          <p className="text-muted" style={{ fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            Please sign in to access your GrowMore investor console, portfolio ledger, and profile settings.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button 
              className="btn btn-primary btn-lg" 
              onClick={() => onOpenAuth ? onOpenAuth('login') : null}
              style={{ width: '100%', background: 'linear-gradient(135deg, #6C38FF, #9333ea)' }}
            >
              <User size={16} />
              <span>Log In to Console</span>
            </button>
            <button className="btn btn-secondary" onClick={onReturnHome} style={{ width: '100%' }}>
              <ArrowLeft size={16} />
              <span>Return to Homepage</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const customerInitials = (userProfile.fullName || userProfile.name || userProfile.email || 'CU').slice(0, 2).toUpperCase();
  const customerDisplayName = userProfile.fullName || userProfile.name || (userProfile.email ? userProfile.email.split('@')[0] : 'Customer');

  return (
    <div className="dashboard-layout">
      {/* Top Navbar */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div className="dash-left-group">
            <button className="btn btn-secondary btn-sm" onClick={onReturnHome} title="Return to Homepage">
              <ArrowLeft size={16} />
              <span>Back to Site</span>
            </button>

            <div className="brand-logo dash-brand" onClick={onReturnHome} style={{ cursor: 'pointer' }}>
              <div className="logo-icon-wrap">
                <TrendingUp className="logo-svg" size={20} />
              </div>
              <span className="brand-name">
                Grow<span className="brand-highlight">More</span>
              </span>
              <span className="version-pill">INVESTOR CONSOLE</span>
            </div>
          </div>

          <div className="dash-right-group">
            <div className="dash-wallet-pill">
              <Wallet size={16} className="text-cyan" />
              <div className="dwp-text">
                <span className="dwp-label">Top Up Wallet:</span>
                <span className="dwp-val">{formatRupees(wallets.topUpWallet)}</span>
              </div>
            </div>

            <div className="dash-wallet-pill" style={{ borderColor: 'rgba(139, 92, 246, 0.4)' }}>
              <ArrowUpRight size={16} className="text-purple" />
              <div className="dwp-text">
                <span className="dwp-label">Withdraw Wallet:</span>
                <span className="dwp-val text-purple">{formatRupees(wallets.withdrawWallet)}</span>
              </div>
            </div>

            <div className="dash-user-badge" onClick={() => setActiveTab('kyc')} style={{ cursor: 'pointer' }} title="Identity & KYC Verification">
              <div className="dub-avatar">{customerInitials}</div>
              <div className="dub-info">
                <span className="dub-name">{customerDisplayName}</span>
                <span className="dub-role" style={{
                  color: userProfile.kyc_status === 'APPROVED' ? '#10b981' : (userProfile.kyc_status === 'REJECTED' ? '#ef4444' : '#f59e0b'),
                  fontWeight: 600
                }}>
                  {userProfile.kyc_status === 'APPROVED' ? '✓ KYC Verified' : (userProfile.kyc_status === 'REJECTED' ? '⚠ KYC Action Req.' : (userProfile.kyc_status === 'UNDER_REVIEW' || userProfile.kyc_status === 'PENDING' ? '⏳ KYC In Review' : 'KYC Pending'))}
                </span>
              </div>
            </div>

            <button 
              className="dash-icon-btn" 
              style={{ position: 'relative' }}
              onClick={() => setShowNotificationsView(true)} 
              title="Notifications"
            >
              <Bell size={18} />
              {unreadNotifCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 6px #ef4444'
                }} />
              )}
            </button>

            <button className="dash-icon-btn" onClick={onLogout ? onLogout : onReturnHome} title="Sign Out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Security Status Stripe */}
      <div className="dash-disclaimer-stripe" style={{ background: 'rgba(6, 182, 212, 0.08)', borderColor: 'rgba(6, 182, 212, 0.25)' }}>
        <ShieldCheck size={16} className="text-cyan flex-shrink-0" />
        <span style={{ color: '#bae6fd' }}>
          <strong>Secure Production Session:</strong> 256-bit SSL encrypted connection • Instant UPI & IMPS banking settlement nodes active.
        </span>
      </div>

      <div className="dash-body container">
        {/* Horizontal Navigation Tabs */}
        <div className="dash-nav-tabs">
          <button 
            className={`dash-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <PieChart size={16} />
            <span>Overview</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'topup' ? 'active' : ''}`}
            onClick={() => setActiveTab('topup')}
          >
            <ArrowDownLeft size={16} />
            <span>Top Up Wallet</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'withdraw' ? 'active' : ''}`}
            onClick={() => setActiveTab('withdraw')}
          >
            <ArrowUpRight size={16} />
            <span>Withdraw Wallet</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => setActiveTab('plans')}
          >
            <TrendingUp size={16} />
            <span>Investment Plans</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <RefreshCw size={16} />
            <span>Transaction Ledger</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'referral' ? 'active' : ''}`}
            onClick={() => setActiveTab('referral')}
          >
            <Share2 size={16} />
            <span>Referrals (5%)</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'rules' ? 'active' : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            <BookOpen size={16} />
            <span>Rules & Terms</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => setActiveTab('support')}
          >
            <HelpCircle size={16} />
            <span>Helpdesk</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={16} />
            <span>Profile</span>
          </button>
          <button 
            className={`dash-tab ${activeTab === 'kyc' ? 'active' : ''}`}
            onClick={() => setActiveTab('kyc')}
          >
            <FileText size={16} />
            <span>KYC Verification</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="dash-tab-content">
            {/* Top Stat Overview Cards — Partitioned Wallets */}
            <div className="stat-cards-grid">
              <div className="glass-card stat-card glow-purple">
                <div className="stat-header">
                  <span className="stat-title">Total Portfolio Value</span>
                  <div className="stat-icon-wrap purple"><Wallet size={18} /></div>
                </div>
                <div className="stat-val text-gradient">{formatRupees(wallets.totalPortfolio)}</div>
                <div className="stat-sub text-cyan">All Active Assets & Earnings</div>
              </div>

              {/* 1. Locked Principal Card */}
              <div className="glass-card stat-card">
                <div className="stat-header">
                  <span className="stat-title">Locked Principal (365 Days)</span>
                  <div className="stat-icon-wrap blue"><Layers size={18} /></div>
                </div>
                <div className="stat-val text-cyan">{formatRupees(wallets.principalLocked || wallets.totalInvested)}</div>
                <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontSize: '0.78rem', fontWeight: 600 }}>
                  <Lock size={12} />
                  <span>365-Day Lock (Cannot withdraw early)</span>
                </div>
              </div>

              {/* 2. Interest Balance Card */}
              <div className="glass-card stat-card">
                <div className="stat-header">
                  <span className="stat-title">Interest Balance (Monthly ROI)</span>
                  <div className="stat-icon-wrap purple"><TrendingUp size={18} /></div>
                </div>
                <div className="stat-val text-purple">{formatRupees(wallets.interestBalance)}</div>
                <div className="stat-sub">
                  {wallets.interestBalance >= 500 ? (
                    <button className="link-action text-emerald font-semibold" onClick={() => { setWithdrawSource('interest'); setActiveTab('withdraw'); }}>
                      Withdraw Interest (Min ₹500) →
                    </button>
                  ) : (
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                      Withdrawal unlocks at ₹500
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Daily Earnings Card */}
              <div className="glass-card stat-card">
                <div className="stat-header">
                  <span className="stat-title">Daily Earnings</span>
                  <div className="stat-icon-wrap cyan"><Sparkles size={18} /></div>
                </div>
                <div className="stat-val text-gradient">{formatRupees(wallets.dailyEarningBalance)}</div>
                <div className="stat-sub">
                  {(wallets.hasDailyPlan || wallets.hasSuperPlan) && wallets.dailyEarningBalance >= (wallets.hasSuperPlan ? 3000 : 1000) ? (
                    <button className="link-action text-emerald font-semibold" onClick={() => { setWithdrawSource('daily_earning'); setActiveTab('withdraw'); }}>
                      Withdraw Daily Earnings →
                    </button>
                  ) : (
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                      {wallets.hasSuperPlan ? 'Unlocks at ₹3,000 accumulated' : 'Unlocks at ₹1,000 accumulated'}
                    </span>
                  )}
                </div>
              </div>

              {/* 4. Top Up Wallet (Deposit) */}
              <div className="glass-card stat-card">
                <div className="stat-header">
                  <span className="stat-title">Top Up Wallet (Deposit)</span>
                  <div className="stat-icon-wrap cyan"><ArrowDownLeft size={18} /></div>
                </div>
                <div className="stat-val text-cyan">{formatRupees(wallets.topUpWallet)}</div>
                <div className="stat-sub">
                  <button className="link-action" onClick={() => setActiveTab('topup')}>
                    Deposit Funds →
                  </button>
                </div>
              </div>
            </div>

            {/* Active Plans Table */}
            <div className="glass-card dash-panel" style={{ marginTop: '2rem' }}>
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">Active Investment Positions</h3>
                  <p className="panel-desc">Ongoing locked growth contracts & maturity schedule</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('plans')}>
                  <span>Explore New Plans</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              <div className="table-responsive">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Plan ID</th>
                      <th>Plan Tier</th>
                      <th>Invested Capital</th>
                      <th>Start Date</th>
                      <th>Maturity Date</th>
                      <th>Expected Yield</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePlans.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                          No active investment plans found. Use the Investment Plans tab to activate a tier.
                        </td>
                      </tr>
                    ) : (
                      activePlans.map((ap) => (
                        <tr key={ap.id}>
                          <td><code>{ap.id}</code></td>
                          <td className="font-semibold">{ap.name}</td>
                          <td>{formatRupees(ap.invested)}</td>
                          <td className="text-muted">{ap.startDate}</td>
                          <td className="text-cyan">{ap.maturityDate}</td>
                          <td className="text-cyan font-semibold">
                            +{formatRupees(ap.illustrativeGain)}
                          </td>
                          <td>
                            <span className="status-pill completed">{ap.status}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TOP UP WALLET FLOW */}
        {activeTab === 'topup' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Top Up Wallet — Fund Deposit</h2>
              <p className="text-muted">
                Deposit capital into your Top Up Wallet to activate investment tiers. 
                Funds in this wallet are strictly dedicated to plan subscriptions.
              </p>
            </div>

            <div className="dash-split-grid">
              {/* Top Up Form */}
              <div className="glass-card dash-panel">
                <div className="panel-header">
                  <div className="badge badge-cyan">INSTANT DEPOSIT</div>
                  <h3 className="panel-title">Add Funds to Top Up Wallet</h3>
                </div>

                {topUpStatusMsg && (
                  <div className="auth-alert success" style={{ marginBottom: '1rem' }}>
                    <CheckCircle2 size={16} />
                    <span>{topUpStatusMsg}</span>
                  </div>
                )}

                <form onSubmit={handleTopUpSubmit}>
                  <div className="form-group">
                    <label className="form-label">Deposit Amount (₹)</label>
                    <div className="input-currency-wrap">
                      <span className="currency-prefix">₹</span>
                      <input 
                        type="number"
                        min="500"
                        step="500"
                        className="form-input"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        placeholder="Enter amount (min ₹500)"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Payment Method (Real Money Gateway)</label>
                    <div className="pay-method-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                      <div 
                        className={`pay-method-box purple-active`}
                        onClick={() => setTopUpMethod('UroPay (Instant UPI / QR)')}
                      >
                        <Zap size={20} className="text-purple" />
                        <span>UroPay Live Gateway</span>
                        <span style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700, letterSpacing: '0.5px' }}>OFFICIAL GATEWAY</span>
                      </div>
                      <div 
                        className={`pay-method-box active`}
                        onClick={() => setTopUpMethod('UroPay (Instant UPI / QR)')}
                      >
                        <Smartphone size={20} className="text-cyan" />
                        <span>UPI & QR Scan</span>
                        <span style={{ fontSize: '0.62rem', color: '#6ee7b7', fontWeight: 600 }}>GPay / PhonePe / Paytm</span>
                      </div>
                      <div 
                        className={`pay-method-box active`}
                        onClick={() => setTopUpMethod('UroPay (Instant UPI / QR)')}
                      >
                        <CreditCard size={20} className="text-purple" />
                        <span>Cards & Banking</span>
                        <span style={{ fontSize: '0.62rem', color: '#93c5fd', fontWeight: 600 }}>Debit / Net Banking</span>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    padding: '0.9rem 1.1rem',
                    background: 'rgba(108, 56, 255, 0.09)',
                    border: '1px solid rgba(108, 56, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.83rem',
                    color: '#d8b4fe',
                    lineHeight: 1.5,
                    marginBottom: '1.25rem'
                  }}>
                    <div style={{ fontWeight: 600, color: '#FFFFFF', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Zap size={16} color="#10b981" />
                      <span>UroPay Real Money Gateway</span>
                    </div>
                    Payments are processed live via UroPay. You can scan the dynamic UPI QR code or pay via Google Pay, PhonePe, Paytm, BHIM, Debit Card, or Net Banking. Funds are credited automatically upon cryptographic verification.
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary btn-lg" 
                    style={{ 
                      width: '100%', 
                      marginTop: '0.5rem',
                      background: topUpMethod.includes('UroPay') ? 'linear-gradient(135deg, #6C38FF, #10b981)' : undefined
                    }}
                    disabled={isSubmittingDeposit}
                  >
                    {isSubmittingDeposit ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Connecting to UroPay...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownLeft size={16} />
                        <span>
                          {topUpMethod.includes('UroPay') ? 'Pay with UroPay Gateway — ' : 'Confirm Deposit of '}
                          {formatRupees(topUpAmount || 0)}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Top Up Wallet Overview */}
              <div className="glass-card dash-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">Top Up Wallet Balance</h3>
                    <p className="panel-desc">Dedicated solely to plan subscriptions</p>
                  </div>
                  <div className="status-pill completed">Active Node</div>
                </div>

                <div className="wallet-balance-box">
                  <div className="wbb-label">Available for Subscriptions</div>
                  <div className="wbb-val text-gradient">{formatRupees(wallets.topUpWallet)}</div>
                </div>

                <h4 style={{ fontSize: '0.95rem', margin: '1.25rem 0 0.75rem 0' }}>Recent Deposit Requests</h4>
                <div className="mini-tx-list">
                  {depositsList.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.82rem', padding: '1rem 0' }}>No deposit requests submitted yet.</p>
                  ) : (
                    depositsList.slice(0, 5).map(dep => (
                      <div key={dep.id} className="mini-tx-item">
                        <div>
                          <strong>{dep.providerReference || `DEP-${dep.id}`}</strong>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{dep.paymentProvider}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="text-cyan font-bold">+{formatRupees(dep.amount)}</div>
                          <span className={`status-pill ${dep.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {dep.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WITHDRAW WALLET FLOW */}
        {activeTab === 'withdraw' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Withdraw Wallet — Payout Request</h2>
              <p className="text-muted">
                Withdraw your unlocked matured returns, principal payouts, and referral earnings to your verified bank account.
              </p>
            </div>

            <div className="dash-split-grid">
              {/* Withdrawal Request Form */}
              <div className="glass-card dash-panel">
                <div className="panel-header">
                  <div className="badge">LIQUID SETTLEMENT</div>
                  <h3 className="panel-title">Request Bank Withdrawal</h3>
                </div>

                {withdrawStatusMsg && (
                  <div className={`auth-alert ${withdrawStatusMsg.includes('Insufficient') ? 'error' : 'success'}`} style={{ marginBottom: '1rem' }}>
                    {withdrawStatusMsg.includes('Insufficient') ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    <span>{withdrawStatusMsg}</span>
                  </div>
                )}

                {userProfile.kyc_status !== 'APPROVED' && (
                  <div style={{
                    padding: '0.85rem 1rem',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    color: '#fcd34d',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertCircle size={16} />
                      <span><strong>KYC Identity Advisory:</strong> Complete Aadhaar & PAN verification for guaranteed 24 to 48 hours settlement.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('kyc')}
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', color: '#fcd34d', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                    >
                      Verify KYC →
                    </button>
                  </div>
                )}

                <form onSubmit={handleWithdrawSubmit}>
                  {/* Strict Principal Lock Advisory */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    color: '#fca5a5',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <Lock size={16} className="flex-shrink-0" />
                    <span><strong>Principal Lock Policy:</strong> Invested principal ({formatRupees(wallets.principalLocked || wallets.totalInvested)}) is strictly locked for 365 days. Only interest returns and daily bonuses are withdrawable.</span>
                  </div>

                  {/* Wallet Source Selector */}
                  <div className="form-group">
                    <label className="form-label">Withdrawal Source Wallet</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => { setWithdrawSource('interest'); setWithdrawAmount(''); }}
                        className={`btn ${withdrawSource === 'interest' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '0.75rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}
                      >
                        <strong style={{ fontSize: '0.88rem' }}>Interest Wallet</strong>
                        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Available: {formatRupees(wallets.interestBalance)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#6ee7b7' }}>Min ₹500 Payout</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setWithdrawSource('daily_earning'); setWithdrawAmount(''); }}
                        className={`btn ${withdrawSource === 'daily_earning' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '0.75rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}
                      >
                        <strong style={{ fontSize: '0.88rem' }}>Daily Earnings</strong>
                        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Available: {formatRupees(wallets.dailyEarningBalance)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#6ee7b7' }}>{wallets.hasSuperPlan ? 'Min ₹3,000 Payout' : 'Min ₹1,000 Payout'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="form-label-row">
                      <label className="form-label">Withdrawal Amount (₹)</label>
                      <span className="label-sub">
                        Eligible: {formatRupees(withdrawSource === 'interest' ? wallets.interestBalance : wallets.dailyEarningBalance)}
                      </span>
                    </div>
                    <div className="input-currency-wrap">
                      <span className="currency-prefix">₹</span>
                      <input 
                        type="number"
                        min={withdrawSource === 'interest' ? 500 : (wallets.minDailyEarningWithdrawal || 1000)}
                        max={withdrawSource === 'interest' ? wallets.interestBalance : wallets.dailyEarningBalance}
                        step="100"
                        className="form-input"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder={
                          withdrawSource === 'interest' 
                            ? 'Enter interest amount (min ₹500)' 
                            : `Enter daily bonus amount (min ${formatRupees(wallets.minDailyEarningWithdrawal || 1000)})`
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Settlement Destination Account</label>
                    <select 
                      className="form-input form-select"
                      value={withdrawMethod}
                      onChange={(e) => setWithdrawMethod(e.target.value)}
                    >
                      <option value="HDFC Bank (A/C •••• 4091)">
                        Primary HDFC Bank (A/C •••• 4091)
                      </option>
                      <option value="ICICI Bank (A/C •••• 9102)">
                        ICICI Bank (A/C •••• 9102)
                      </option>
                      <option value="UPI ID (arjun@okhdfcbank)">
                        Primary UPI ID (arjun@okhdfcbank)
                      </option>
                    </select>
                  </div>

                  {/* Settlement Summary */}
                  <div className="settlement-preview-box">
                    <div className="sp-row">
                      <span>Requested Amount:</span>
                      <strong>{formatRupees(withdrawAmount || 0)}</strong>
                    </div>
                    <div className="sp-row">
                      <span>Settlement Processing Window:</span>
                      <strong className="text-cyan">24 to 48 Hours (Manual Review & Disbursal)</strong>
                    </div>
                    <div className="sp-row">
                      <span>Platform Transfer Fee:</span>
                      <strong className="text-muted">₹0.00 (Zero Fee)</strong>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-secondary btn-lg" style={{ width: '100%', marginTop: '1.25rem' }}>
                    <ArrowUpRight size={16} />
                    <span>Submit Withdrawal Request</span>
                  </button>
                </form>
              </div>

              {/* Withdraw Wallet Overview */}
              <div className="glass-card dash-panel">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">Withdraw Wallet Balance</h3>
                    <p className="panel-desc">Liquid payouts eligible for bank settlement</p>
                  </div>
                  <div className="status-pill completed">Verified</div>
                </div>

                <div className="wallet-balance-box">
                  <div className="wbb-label">Liquid Available Balance</div>
                  <div className="wbb-val text-gradient">{formatRupees(wallets.withdrawWallet)}</div>
                </div>

                <h4 style={{ fontSize: '0.95rem', margin: '1.25rem 0 0.75rem 0' }}>Recent Withdrawal Requests</h4>
                <div className="mini-tx-list">
                  {withdrawalsList.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.82rem', padding: '1rem 0' }}>No withdrawal requests submitted yet.</p>
                  ) : (
                    withdrawalsList.slice(0, 5).map(wdr => (
                      <div key={wdr.id} className="mini-tx-item">
                        <div>
                          <strong>{wdr.payoutReference || `WDR-${wdr.id}`}</strong>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{wdr.payoutMethod}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="text-rose font-bold">-{formatRupees(wdr.amount)}</div>
                          <span className={`status-pill ${wdr.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {wdr.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INVESTMENT PLANS */}
        {activeTab === 'plans' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Select an Investment Plan</h2>
              <p className="text-muted">
                Allocate capital from your Top Up Wallet ({formatRupees(wallets.topUpWallet)} available) 
                into structured tiers. Each tier yields fixed transparent returns upon lock-in completion.
              </p>
            </div>

            <div className="plans-grid">
              {INVESTMENT_PLANS.map((plan) => (
                <div key={plan.id} className={`glass-card plan-card ${plan.featured ? 'plan-featured' : ''}`}>
                  <div className="plan-badge">{plan.badge}</div>
                  <h3 className="plan-name">{plan.name}</h3>
                  <p className="plan-tagline">{plan.tagline}</p>

                  <div className="plan-price-box">
                    <div className="plan-min-label">Required Capital Entry</div>
                    <div className="plan-min-amount">{formatRupees(plan.minAmount)}</div>
                    <div className="plan-term-pill">{plan.termLabel}</div>
                  </div>

                  <div className="plan-calc-box">
                    <div className="calc-row">
                      <span className="calc-label">Expected Yield:</span>
                      <span className="calc-val text-cyan">+{formatRupees(plan.sampleReturn)}</span>
                    </div>
                    <div className="calc-row total">
                      <span className="calc-label">Total Maturity Payout:</span>
                      <span className="calc-val text-gradient">{formatRupees(plan.sampleTotal)}</span>
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1.25rem' }}
                    onClick={() => handleInvestInPlan(plan)}
                  >
                    <span>Activate {formatRupees(plan.minAmount)} with Top Up Wallet</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: TRANSACTION HISTORY */}
        {activeTab === 'transactions' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Transaction Ledger & Audit Trail</h2>
              <p className="text-muted">
                All deposits, allocations, and payout settlements across both wallets.
              </p>
            </div>

            <div className="glass-card dash-panel">
              <div className="tx-filter-bar">
                <div className="tx-search-wrap">
                  <Search size={16} className="text-muted" />
                  <input 
                    type="text" 
                    placeholder="Search by ID, method, or wallet..."
                    value={searchTxn}
                    onChange={(e) => setSearchTxn(e.target.value)}
                    className="tx-search-input"
                  />
                </div>

                <div className="tx-filter-chips">
                  {['All', 'Top Up', 'Allocation', 'Yield', 'Withdrawal'].map((cat) => (
                    <button
                      key={cat}
                      className={`tx-chip ${filterType === cat ? 'active' : ''}`}
                      onClick={() => setFilterType(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-responsive">
                <table className="dash-table full-table">
                  <thead>
                    <tr>
                      <th>Transaction ID</th>
                      <th>Type</th>
                      <th>Wallet</th>
                      <th>Method / Details</th>
                      <th>Timestamp</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                          No matching transactions found.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td><code>{tx.id}</code></td>
                          <td>
                            <span className={`tx-type-pill ${tx.type.toLowerCase().replace(/\s+/g, '-')}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td><span className="text-muted">{tx.wallet}</span></td>
                          <td>{tx.method}</td>
                          <td className="text-muted">{tx.date}</td>
                          <td className="font-semibold">
                            {tx.type.includes('Withdrawal') ? (
                              <span className="text-rose">-{formatRupees(tx.amount)}</span>
                            ) : (
                              <span className="text-cyan">+{formatRupees(tx.amount)}</span>
                            )}
                          </td>
                          <td>
                            <span className={`status-pill ${tx.status.toLowerCase().replace(/\s+/g, '-')}`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: REFERRALS */}
        {activeTab === 'referral' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Direct 1-Level Referral Program</h2>
              <p className="text-muted">
                Earn flat 5% instant cash credited directly to your Withdraw Wallet whenever an invited friend makes a deposit.
              </p>
            </div>

            <div className="glass-card dash-panel">
              <div className="referral-box-grid">
                <div className="rf-left">
                  <div className="badge badge-cyan">YOUR UNIQUE INVITE CODE</div>
                  <h3 className="rf-title">Invite Friends & Earn Flat 5%</h3>
                  <p className="rf-desc">
                    Share your personal link via WhatsApp, Telegram, or SMS. As soon as your friend registers and makes a deposit, 5% is credited straight into your Withdraw Wallet balance.
                  </p>

                  <div className="referral-input-group">
                    <code className="referral-code">{userProfile.referralCode || 'GM-ALEX9824'}</code>
                    <button className="btn btn-primary btn-sm" onClick={handleCopyReferral}>
                      {copiedReferral ? (
                        <>
                          <Check size={14} />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="rf-metrics">
                  <div className="rf-metric-item">
                    <div className="rf-m-val text-gradient">8</div>
                    <div className="rf-m-lbl">Friends Registered</div>
                  </div>
                  <div className="rf-metric-item">
                    <div className="rf-m-val text-cyan">₹6,500</div>
                    <div className="rf-m-lbl">5% Cash Commissions Earned</div>
                  </div>
                  <div className="rf-metric-item">
                    <div className="rf-m-val">Level 1</div>
                    <div className="rf-m-lbl">Strict Single-Tier Policy</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: RULES & TERMS */}
        {activeTab === 'rules' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Rules & Regulatory Standards</h2>
              <p className="text-muted">
                Institutional policies governing account operations, capital security, and settlements.
              </p>
            </div>

            <div className="glass-card dash-panel">
              <div className="rules-preview-grid">
                <div className="rp-item">
                  <h4>Dual Wallet Architecture</h4>
                  <p className="text-muted">
                    Funds in the Top Up Wallet are strictly dedicated to plan activations, while the 
                    Withdraw Wallet holds matured liquid returns and referral cash.
                  </p>
                </div>
                <div className="rp-item">
                  <h4>Automated Bank Settlements</h4>
                  <p className="text-muted">
                    Withdrawals are disbursed directly to verified bank accounts via automated IMPS and NEFT rails.
                  </p>
                </div>
                <div className="rp-item">
                  <h4>Transparent Fixed Yields</h4>
                  <p className="text-muted">
                    All tier parameters—holding durations, minimum entries, and fixed monthly yields—are strictly bound by plan contracts.
                  </p>
                </div>
                <div className="rp-item">
                  <h4>Strict Anti-MLM Policy</h4>
                  <p className="text-muted">
                    GrowMore strictly enforces a clean 1-level referral architecture. Pyramid and multi-tier hierarchies are prohibited.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button className="btn btn-primary" onClick={onNavigateRules}>
                  <span>Open Full Rules & Disclosure Document</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: HELPDESK */}
        {activeTab === 'support' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Priority Helpdesk & Support</h2>
              <p className="text-muted">
                Direct inquiry channel for questions regarding plan activations, deposits, or payouts.
              </p>
            </div>

            <div className="glass-card dash-panel">
              {ticketSubmitted ? (
                <div className="form-success-alert">
                  <CheckCircle2 size={24} className="text-cyan" />
                  <div>
                    <h4>Support Ticket Dispatched!</h4>
                    <p>Ticket #{Math.floor(100000 + Math.random() * 900000)} has been created. Our desk will contact you within 2 hours.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setTicketSubmitted(true); }}>
                  <div className="form-group">
                    <label className="form-label">Subject</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Inquiry regarding bank payout settlement"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Message Details</label>
                    <textarea 
                      rows="4" 
                      className="form-input form-textarea" 
                      placeholder="Provide full details regarding your inquiry..."
                      value={ticketMsg}
                      onChange={(e) => setTicketMsg(e.target.value)}
                      required
                    ></textarea>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    <Send size={16} />
                    <span>Submit Priority Support Ticket</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* TAB 9: PROFILE SETTINGS */}
        {activeTab === 'profile' && (
          <div className="dash-tab-content">
            <div className="tab-intro">
              <h2>Customer Profile & Identity Settings</h2>
              <p className="text-muted">
                Manage your verified customer identity and contact information. Protected by Row-Level Security (RLS).
              </p>
            </div>

            {profileMsg.text && (
              <div 
                className={`auth-alert ${profileMsg.type === 'error' ? 'error' : 'success'}`} 
                style={{ marginBottom: '1.25rem', maxWidth: '820px' }}
              >
                {profileMsg.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <div className="dash-split-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(360px, 1.25fr)' }}>
              {/* Account Identity Card (Read-Only Immutable Attributes) */}
              <div className="glass-card dash-panel">
                <div className="panel-header">
                  <div className="badge badge-purple">SECURITY VERIFIED</div>
                  <h3 className="panel-title">Account Identity</h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div className="profile-avatar-large" style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #6C38FF, #9333ea)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF' }}>
                    {customerInitials}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#FFFFFF' }}>{customerDisplayName}</h4>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{userProfile.email}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Customer ID</span>
                    <code style={{ fontSize: '0.78rem', color: '#c084fc', background: 'rgba(108, 56, 255, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                      {userProfile.id ? String(userProfile.id).slice(0, 16) + '...' : 'SEC-UUID'}
                    </code>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Account Role</span>
                    <span className="badge" style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                      {userProfile.role || 'user'} (Immutable)
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Account Status</span>
                    <span className="status-pill completed">
                      {userProfile.accountStatus || 'ACTIVE'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Email Verification</span>
                    <span className={`status-pill ${userProfile.isVerified ? 'completed' : 'pending'}`}>
                      {userProfile.isVerified ? 'Verified' : 'Pending Verification'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0' }}>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>KYC Identity (Aadhaar/PAN)</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('kyc')}
                      className={`status-pill ${userProfile.kyc_status === 'APPROVED' ? 'completed' : (userProfile.kyc_status === 'REJECTED' ? 'error' : 'pending')}`}
                      style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      title="Manage KYC in KYC Verification tab"
                    >
                      <span>{userProfile.kyc_status === 'APPROVED' ? 'Approved' : (userProfile.kyc_status || 'Pending')}</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', padding: '0.85rem', background: 'rgba(108, 56, 255, 0.08)', borderRadius: '12px', border: '1px solid rgba(108, 56, 255, 0.2)', fontSize: '0.78rem', color: '#d8b4fe', lineHeight: 1.5 }}>
                  <ShieldCheck size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: 'text-bottom' }} />
                  <strong>Row Level Security Guard:</strong> Customers are strictly forbidden from modifying account roles, verification status, or wallet balances.
                </div>
              </div>

              {/* Editable Profile Form */}
              <div className="glass-card dash-panel">
                <div className="panel-header">
                  <div className="badge badge-cyan">PERMITTED FIELDS</div>
                  <h3 className="panel-title">Update Contact & Personal Details</h3>
                </div>

                <form onSubmit={handleUpdateProfile}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input 
                      type="text"
                      className="form-input"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      placeholder="Enter your full legal name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Registered Email</label>
                    <input 
                      type="email"
                      className="form-input"
                      value={userProfile.email || ''}
                      disabled
                      style={{ opacity: 0.65, cursor: 'not-allowed', background: 'rgba(255, 255, 255, 0.02)' }}
                    />
                    <span className="label-sub" style={{ marginTop: '0.3rem', display: 'block', fontSize: '0.72rem' }}>
                      Email is bound to your authentication identity and cannot be altered here.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Mobile Phone Number</label>
                    <input 
                      type="text"
                      className="form-input"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Date of Birth</label>
                    <input 
                      type="date"
                      className="form-input"
                      value={editDob}
                      onChange={(e) => setEditDob(e.target.value)}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary btn-lg" 
                    style={{ width: '100%', marginTop: '0.75rem', background: 'linear-gradient(135deg, #6C38FF, #9333ea)' }}
                    disabled={isUpdatingProfile}
                  >
                    {isUpdatingProfile ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Saving Profile to Database...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Save Profile Changes</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB 10: KYC & IDENTITY VERIFICATION */}
        {activeTab === 'kyc' && (() => {
          const aadhaarDoc = kycDocuments.find(d => d.document_type === 'aadhaar');
          const panDoc = kycDocuments.find(d => d.document_type === 'pan');
          const selfieDoc = kycDocuments.find(d => d.document_type === 'selfie');
          
          const isKycComplete = userProfile.kyc_status === 'APPROVED' || 
            (panDoc && panDoc.status === 'APPROVED') || 
            (aadhaarDoc && aadhaarDoc.status === 'APPROVED' && selfieDoc && selfieDoc.status === 'APPROVED');

          const hasRejection = kycDocuments.some(d => d.status === 'REJECTED');

          return (
            <div className="dash-tab-content">
              <div className="tab-intro">
                <h2>KYC & Regulatory Identity Verification</h2>
                <p className="text-muted">
                  Verify your Aadhaar card and PAN card to comply with financial regulations, protect your wallet against fraud, and enable automated 24 to 48 hours withdrawals.
                </p>
              </div>

              {kycMsg.text && (
                <div 
                  className={`auth-alert ${kycMsg.type === 'error' ? 'error' : 'success'}`} 
                  style={{ marginBottom: '1.5rem', maxWidth: '960px' }}
                >
                  {kycMsg.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                  <span>{kycMsg.text}</span>
                </div>
              )}

              {/* Status Header Banner */}
              <div 
                className="glass-card"
                style={{
                  padding: '1.25rem 1.5rem',
                  borderRadius: '16px',
                  marginBottom: '1.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  background: isKycComplete 
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05))' 
                    : (hasRejection 
                        ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(220, 38, 38, 0.05))' 
                        : 'linear-gradient(135deg, rgba(108, 56, 255, 0.12), rgba(6, 182, 212, 0.05))'),
                  border: `1px solid ${isKycComplete ? 'rgba(16, 185, 129, 0.3)' : (hasRejection ? 'rgba(239, 68, 68, 0.3)' : 'rgba(108, 56, 255, 0.25)')}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isKycComplete ? '#10b981' : (hasRejection ? '#ef4444' : '#6C38FF'),
                    color: '#fff'
                  }}>
                    {isKycComplete ? <Check size={24} /> : (hasRejection ? <AlertCircle size={24} /> : <ShieldCheck size={24} />)}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, color: '#fff', fontSize: '1.05rem' }}>
                      {isKycComplete 
                        ? 'KYC Verification Approved' 
                        : (hasRejection 
                            ? 'Action Required: Document Submission Rejected' 
                            : (kycDocuments.length > 0 ? 'Verification Under Review' : 'Identity Verification Required'))}
                    </h4>
                    <p style={{ margin: '0.2rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                      {isKycComplete 
                        ? 'Your identity documents are verified. High-tier investments and instant bank withdrawals are unlocked.' 
                        : (hasRejection 
                            ? 'Please review the rejection reason on the marked document and submit a clear re-upload.' 
                            : 'Submit Aadhaar and PAN Card. Reviews are completed within 2 to 24 hours by compliance.')}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: isKycComplete ? 'rgba(16, 185, 129, 0.2)' : (hasRejection ? 'rgba(239, 68, 68, 0.2)' : 'rgba(108, 56, 255, 0.2)'),
                    color: isKycComplete ? '#34d399' : (hasRejection ? '#f87171' : '#c084fc'),
                    border: `1px solid ${isKycComplete ? '#10b981' : (hasRejection ? '#ef4444' : '#6C38FF')}`
                  }}>
                    {userProfile.kyc_status || 'NOT_SUBMITTED'}
                  </span>
                  <button 
                    onClick={fetchKycDocuments} 
                    className="btn btn-sm btn-outline"
                    title="Refresh document status"
                    style={{ padding: '0.35rem 0.65rem' }}
                  >
                    <RefreshCw size={14} className={kycLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* KYC Document Cards Grid */}
              <div className="dash-split-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                
                {/* 1. AADHAAR CARD VERIFICATION */}
                <div className="glass-card dash-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={18} className="text-cyan" />
                      <h3 className="panel-title" style={{ margin: 0 }}>Aadhaar Card</h3>
                    </div>
                    {aadhaarDoc && (
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '12px',
                        background: aadhaarDoc.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : (aadhaarDoc.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                        color: aadhaarDoc.status === 'APPROVED' ? '#34d399' : (aadhaarDoc.status === 'REJECTED' ? '#f87171' : '#fbbf24'),
                        border: `1px solid ${aadhaarDoc.status === 'APPROVED' ? '#10b981' : (aadhaarDoc.status === 'REJECTED' ? '#ef4444' : '#f59e0b')}`
                      }}>
                        {aadhaarDoc.status}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.5rem 0 1.25rem 0' }}>
                    Government issued 12-digit Unique Identification Number (UIDAI) for primary identity and address verification.
                  </p>

                  {aadhaarDoc ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{ padding: '0.85rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Aadhaar Number:</span>
                          <span style={{ fontSize: '0.82rem', color: '#fff', fontFamily: 'monospace', fontWeight: 600 }}>
                            {aadhaarDoc.document_number ? `XXXX-XXXX-${String(aadhaarDoc.document_number).slice(-4)}` : 'Recorded'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>File Name:</span>
                          <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>{aadhaarDoc.file_name}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Submitted On:</span>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{new Date(aadhaarDoc.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {aadhaarDoc.rejection_reason && (
                        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem' }}>
                          <strong>Rejection Notice:</strong> {aadhaarDoc.rejection_reason}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem' }}>
                        <button
                          onClick={() => handleViewKycDocument(aadhaarDoc.id)}
                          className="btn btn-outline btn-sm"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                        >
                          <Eye size={15} />
                          <span>View Upload</span>
                        </button>
                      </div>

                      {aadhaarDoc.status === 'REJECTED' && (
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Re-upload Aadhaar Card:</span>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="12-digit Aadhaar Number" 
                            value={aadhaarNumber} 
                            maxLength={14}
                            onChange={(e) => setAadhaarNumber(e.target.value)} 
                            style={{ marginBottom: '0.5rem' }} 
                          />
                          <input 
                            type="file" 
                            accept="image/*,application/pdf" 
                            onChange={(e) => setAadhaarFile(e.target.files[0])} 
                            style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.5rem' }} 
                          />
                          <button
                            onClick={() => handleUploadKyc('aadhaar', aadhaarFile, aadhaarNumber)}
                            disabled={isUploadingAadhaar || !aadhaarFile}
                            className="btn btn-primary btn-sm"
                            style={{ width: '100%' }}
                          >
                            {isUploadingAadhaar ? 'Uploading...' : 'Re-submit Aadhaar'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>12-Digit Aadhaar Number</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 5432 9876 1234"
                          maxLength={14}
                          value={aadhaarNumber}
                          onChange={(e) => setAadhaarNumber(e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>Upload Aadhaar Front/Both (Image or PDF)</label>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => setAadhaarFile(e.target.files[0])}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#cbd5e1',
                            fontSize: '0.8rem'
                          }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                          Max 10MB • Clear JPEG, PNG, or PDF format
                        </span>
                      </div>

                      <button
                        onClick={() => handleUploadKyc('aadhaar', aadhaarFile, aadhaarNumber)}
                        disabled={isUploadingAadhaar || !aadhaarFile || !aadhaarNumber}
                        className="btn btn-primary"
                        style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      >
                        {isUploadingAadhaar ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Uploading Securely...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud size={16} />
                            <span>Submit Aadhaar Card</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. PAN CARD VERIFICATION */}
                <div className="glass-card dash-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CreditCard size={18} className="text-purple" />
                      <h3 className="panel-title" style={{ margin: 0 }}>PAN Card</h3>
                    </div>
                    {panDoc && (
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '12px',
                        background: panDoc.status === 'APPROVED' ? 'rgba(168, 85, 247, 0.15)' : (panDoc.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                        color: panDoc.status === 'APPROVED' ? '#c084fc' : (panDoc.status === 'REJECTED' ? '#f87171' : '#fbbf24'),
                        border: `1px solid ${panDoc.status === 'APPROVED' ? '#a855f7' : (panDoc.status === 'REJECTED' ? '#ef4444' : '#f59e0b')}`
                      }}>
                        {panDoc.status}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.5rem 0 1.25rem 0' }}>
                    Income Tax Department 10-character Permanent Account Number. Required for investment tax compliance & bank settlements.
                  </p>

                  {panDoc ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{ padding: '0.85rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>PAN Number:</span>
                          <span style={{ fontSize: '0.82rem', color: '#c084fc', fontFamily: 'monospace', fontWeight: 600 }}>
                            {panDoc.document_number ? panDoc.document_number.toUpperCase() : 'Recorded'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>File Name:</span>
                          <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>{panDoc.file_name}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Submitted On:</span>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{new Date(panDoc.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {panDoc.rejection_reason && (
                        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem' }}>
                          <strong>Rejection Notice:</strong> {panDoc.rejection_reason}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem' }}>
                        <button
                          onClick={() => handleViewKycDocument(panDoc.id)}
                          className="btn btn-outline btn-sm"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                        >
                          <Eye size={15} />
                          <span>View Upload</span>
                        </button>
                      </div>

                      {panDoc.status === 'REJECTED' && (
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Re-upload PAN Card:</span>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="10-character PAN (e.g. ABCDE1234F)" 
                            value={panNumber} 
                            maxLength={10}
                            onChange={(e) => setPanNumber(e.target.value.toUpperCase())} 
                            style={{ marginBottom: '0.5rem', textTransform: 'uppercase' }} 
                          />
                          <input 
                            type="file" 
                            accept="image/*,application/pdf" 
                            onChange={(e) => setPanFile(e.target.files[0])} 
                            style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.5rem' }} 
                          />
                          <button
                            onClick={() => handleUploadKyc('pan', panFile, panNumber)}
                            disabled={isUploadingPan || !panFile}
                            className="btn btn-primary btn-sm"
                            style={{ width: '100%' }}
                          >
                            {isUploadingPan ? 'Uploading...' : 'Re-submit PAN Card'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>10-Character PAN Number</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. ABCDE1234F"
                          maxLength={10}
                          value={panNumber}
                          onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                          style={{ textTransform: 'uppercase' }}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>Upload PAN Card Photo (Image or PDF)</label>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => setPanFile(e.target.files[0])}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#cbd5e1',
                            fontSize: '0.8rem'
                          }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                          Max 10MB • All 4 corners visible • No glare
                        </span>
                      </div>

                      <button
                        onClick={() => handleUploadKyc('pan', panFile, panNumber)}
                        disabled={isUploadingPan || !panFile || !panNumber}
                        className="btn btn-primary"
                        style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #8B5CF6, #6C38FF)' }}
                      >
                        {isUploadingPan ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Uploading Securely...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud size={16} />
                            <span>Submit PAN Card</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. LIVE SELFIE / FACE VERIFICATION */}
                <div className="glass-card dash-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <User size={18} className="text-cyan" />
                      <h3 className="panel-title" style={{ margin: 0 }}>Live Photo / Selfie</h3>
                    </div>
                    {selfieDoc && (
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '12px',
                        background: selfieDoc.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: selfieDoc.status === 'APPROVED' ? '#34d399' : '#fbbf24',
                        border: `1px solid ${selfieDoc.status === 'APPROVED' ? '#10b981' : '#f59e0b'}`
                      }}>
                        {selfieDoc.status}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.5rem 0 1.25rem 0' }}>
                    Clear front-facing photo to confirm the person submitting the document matches the official identity records.
                  </p>

                  {selfieDoc ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{ padding: '0.85rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Status:</span>
                          <span style={{ fontSize: '0.82rem', color: '#38bdf8', fontWeight: 600 }}>{selfieDoc.status}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Uploaded:</span>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{new Date(selfieDoc.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem' }}>
                        <button
                          onClick={() => handleViewKycDocument(selfieDoc.id)}
                          className="btn btn-outline btn-sm"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                        >
                          <Eye size={15} />
                          <span>View Photo</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.82rem' }}>Capture or Choose Face Photo</label>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          onChange={(e) => setSelfieFile(e.target.files[0])}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#cbd5e1',
                            fontSize: '0.8rem'
                          }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                          Good lighting • Face forward • No sunglasses or hats
                        </span>
                      </div>

                      <button
                        onClick={() => handleUploadKyc('selfie', selfieFile)}
                        disabled={isUploadingSelfie || !selfieFile}
                        className="btn btn-primary"
                        style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      >
                        {isUploadingSelfie ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud size={16} />
                            <span>Submit Photo</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Regulatory & Security Information Note */}
              <div 
                className="glass-card" 
                style={{ 
                  padding: '1.25rem 1.5rem', 
                  borderRadius: '16px',
                  background: 'rgba(108, 56, 255, 0.04)',
                  border: '1px solid rgba(108, 56, 255, 0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <ShieldCheck size={20} className="text-cyan" />
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem' }}>
                    Government Regulatory Compliance & Cryptographic Storage Guarantee
                  </h4>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    • <strong>Regulatory Mandate:</strong> Identity verification via Aadhaar and PAN Card is conducted strictly in adherence to the Prevention of Money Laundering Act (PMLA) and SEBI/RBI risk prevention standards for all digital investment assets.
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    • <strong>Private Storage Security:</strong> All submitted documents are encrypted with AES-256 and stored in an isolated, private security container. Documents are never exposed to public internet URLs and can only be inspected by authorized compliance officers using ephemeral, 15-minute cryptographically signed download tokens.
                  </p>
                  <p style={{ margin: 0 }}>
                    • <strong>Payout Protection:</strong> Bank withdrawals are restricted to bank accounts matching the verified legal name on your Aadhaar / PAN card, eliminating unauthorized wire transfers.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* UroPay Dedicated Payment Modal */}
      {uropayModalOpen && uropayOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 8, 22, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #121832, #0d1226)',
            border: '1px solid rgba(108, 56, 255, 0.4)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(108, 56, 255, 0.25)',
            borderRadius: '24px',
            maxWidth: '480px',
            width: '100%',
            overflow: 'hidden',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(90deg, rgba(108, 56, 255, 0.2), rgba(16, 185, 129, 0.15))',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6C38FF, #10B981)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
                }}>
                  <Zap size={20} color="#FFFFFF" />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>UroPay Gateway</span>
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: uropayOrder.isTestMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                      color: uropayOrder.isTestMode ? '#fbbf24' : '#34d399',
                      border: `1px solid ${uropayOrder.isTestMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                      fontWeight: 700
                    }}>
                      {uropayOrder.isTestMode ? 'SANDBOX' : 'LIVE'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Ref: {uropayOrder.orderId}</div>
                </div>
              </div>

              <button
                onClick={() => setUropayModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '6px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {/* Amount Display */}
              <div style={{
                textAlign: 'center',
                padding: '1.25rem',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: '1.25rem'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Amount to Pay</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#FFFFFF', marginTop: '0.2rem' }}>
                  {formatRupees(uropayOrder.amount)}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#10B981', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <ShieldCheck size={14} />
                  <span>Verified 256-Bit Encrypted Transaction</span>
                </div>
              </div>

              {/* QR Code Container */}
              {uropayOrder.qrCode && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  border: '1px dashed rgba(108, 56, 255, 0.3)'
                }}>
                  <div style={{
                    background: '#FFFFFF',
                    padding: '10px',
                    borderRadius: '14px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                  }}>
                    <img 
                      src={uropayOrder.qrCode} 
                      alt="UroPay UPI QR Code" 
                      style={{ width: '170px', height: '170px', display: 'block' }} 
                    />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <QrCode size={15} color="#10B981" />
                    <span>Scan with Google Pay, PhonePe, Paytm, or BHIM</span>
                  </div>
                </div>
              )}

              {/* UPI Intent Deep Link Button */}
              {uropayOrder.upiIntent && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <a
                    href={uropayOrder.upiIntent}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      background: 'linear-gradient(135deg, #10B981, #059669)',
                      padding: '0.85rem',
                      borderRadius: '14px',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      color: '#FFFFFF'
                    }}
                  >
                    <Smartphone size={18} />
                    <span>Pay via Installed UPI App</span>
                  </a>
                </div>
              )}

              {/* Hosted Checkout Link (if available) */}
              {uropayOrder.openUrl && (
                <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
                  <a
                    href={uropayOrder.openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.82rem',
                      color: '#a78bfa',
                      textDecoration: 'none',
                      fontWeight: 600
                    }}
                  >
                    <span>Open UroPay Hosted Checkout Page</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {/* Verification Section */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '1rem 1.1rem',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Completed payment? Submit UTR or confirm below:
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    value={uropayUtr}
                    onChange={(e) => setUropayUtr(e.target.value)}
                    placeholder="Enter 12-digit UTR (optional)"
                    style={{
                      flex: 1,
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      color: '#FFFFFF',
                      fontSize: '0.85rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyUroPayPayment}
                    disabled={uropayVerifying}
                    style={{
                      background: 'linear-gradient(135deg, #6C38FF, #8b5cf6)',
                      border: 'none',
                      color: '#FFFFFF',
                      padding: '0 1rem',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: uropayVerifying ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    {uropayVerifying ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>{uropayVerifying ? 'Verifying...' : 'Verify'}</span>
                  </button>
                </div>

                {uropayVerifyMsg && (
                  <div style={{
                    fontSize: '0.8rem',
                    padding: '0.65rem',
                    borderRadius: '8px',
                    background: uropayVerifyMsg.includes('success') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: uropayVerifyMsg.includes('success') ? '#34d399' : '#f87171',
                    border: `1px solid ${uropayVerifyMsg.includes('success') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    {uropayVerifyMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <div className="mobile-bottom-nav">
        <button 
          className={`mbn-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <PieChart size={18} />
          <span>Overview</span>
        </button>

        <button 
          className={`mbn-item ${activeTab === 'topup' ? 'active' : ''}`}
          onClick={() => setActiveTab('topup')}
        >
          <ArrowDownLeft size={18} />
          <span>Top Up</span>
        </button>

        <button 
          className={`mbn-item ${activeTab === 'withdraw' ? 'active' : ''}`}
          onClick={() => setActiveTab('withdraw')}
        >
          <ArrowUpRight size={18} />
          <span>Withdraw</span>
        </button>

        <button 
          className={`mbn-item ${activeTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          <TrendingUp size={18} />
          <span>Plans</span>
        </button>

        <button 
          className={`mbn-item ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <RefreshCw size={18} />
          <span>Ledger</span>
        </button>
      </div>
    </div>
  );
}
