import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  Calendar, 
  Gift, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import { api, authStorage } from '../services/api';
import { supabaseAuth } from '../services/supabaseAuth';

export default function AuthModal({ isOpen = false, initialMode = 'login', onClose, onLoginSuccess }) {
  // Modes: 'login' | 'register' | 'otp_verify' | 'forgot_phone' | 'forgot_reset'
  const [mode, setMode] = useState(initialMode);
  
  // Registration and Login Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  
  // OTP Verification and Password Reset Fields
  const [targetEmail, setTargetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  
  // UI & Timer States
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Countdown Timers & Refs
  const [otpExpiresIn, setOtpExpiresIn] = useState(300); // 5 minutes
  const [resendCooldown, setResendCooldown] = useState(60); // 60 seconds
  const timerRef = useRef(null);
  const modalOverlayRef = useRef(null);
  const modalContentRef = useRef(null);

  const scrollToTop = () => {
    if (modalContentRef.current) {
      modalContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (modalOverlayRef.current) {
      modalOverlayRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (error) {
      scrollToTop();
    }
  }, [error]);

  useEffect(() => {
    scrollToTop();
  }, [mode]);

  // Sync mode with initialMode and handle keyboard / popstate dismissal
  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setMode(initialMode === 'register' ? 'register' : 'login');
    setError('');
    setSuccessMsg('');
    setInfoMsg('');

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    window.history.pushState({ authModalOpen: true }, '');
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, initialMode, onClose]);

  // Countdown timer handler for OTP screens
  useEffect(() => {
    if (mode === 'otp_verify' || mode === 'forgot_reset') {
      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setOtpExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode]);

  if (!isOpen) return null;

  const resetForm = () => {
    setError('');
    setSuccessMsg('');
    setInfoMsg('');
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setOtp('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowNewPassword(false);
  };

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const validateEmail = (val) => {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(val);
  };

  /**
   * Handle Login Submit
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setInfoMsg('');
    setUnverifiedEmail('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your registered email address.');
      return;
    }
    if (!validateEmail(cleanEmail)) {
      setError('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      let response;
      if (supabaseAuth.isConfigured()) {
        try {
          response = await supabaseAuth.signIn({ email: cleanEmail, password });
        } catch (sbErr) {
          try {
            response = await api.login({ email: cleanEmail, password, rememberMe });
          } catch {
            throw sbErr;
          }
        }
      } else {
        response = await api.login({
          email: cleanEmail,
          password,
          rememberMe
        });
      }

      setSuccessMsg('Authentication successful! Welcome to GrowMore.');
      setTimeout(() => {
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess(response.user);
        }
      }, 700);
    } catch (err) {
      if (err.data?.code === 'UNVERIFIED_ACCOUNT' || (err.message && err.message.includes('not yet verified'))) {
        setUnverifiedEmail(cleanEmail);
        setTargetEmail(cleanEmail);
        setError(err.message || 'Your email address is not yet verified. Please complete OTP verification to access your account.');
      } else {
        setError(err.message || 'Invalid email or password. Please verify your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Registration Submit
   * Name, DOB, Email, Password, Referral Code only
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setInfoMsg('');

    if (!fullName.trim()) {
      setError('Please enter your full legal name.');
      return;
    }

    if (!dob) {
      setError('Please provide your date of birth.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setError('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    if (!agreeTerms) {
      setError('You must agree to the GrowMore Terms of Service and Privacy Policy to continue.');
      return;
    }

    setIsLoading(true);

    try {
      if (supabaseAuth.isConfigured()) {
        try {
          const sbRes = await supabaseAuth.signUp({
            email: cleanEmail,
            password,
            fullName: fullName.trim(),
            dob
          });

          if (sbRes.isEmailConfirmationRequired) {
            setInfoMsg('Account created! Please check your email inbox to verify your account.');
          } else {
            setSuccessMsg('Account created successfully! Welcome to GrowMore.');
          }

          setTimeout(() => {
            onClose();
            if (onLoginSuccess && sbRes.user) {
              onLoginSuccess(sbRes.user);
            }
          }, 1200);
          return;
        } catch (sbErr) {
          console.warn('[Supabase Auth Signup note]:', sbErr.message);
          // Fall back to backend api.register
        }
      }

      const response = await api.register({
        fullName: fullName.trim(),
        dob,
        email: cleanEmail,
        password,
        referralCode: referralCode.trim() || undefined
      });

      setTargetEmail(cleanEmail);
      setOtpExpiresIn(300);
      setResendCooldown(60);
      setOtp('');

      if (response.devOtp) {
        setInfoMsg(`OTP: ${response.devOtp} (Sent to ${cleanEmail} & Telegram)`);
        setOtp(response.devOtp);
      } else if (response.notice) {
        setInfoMsg(response.notice);
      } else {
        setInfoMsg(`A 6-digit verification code has been dispatched to ${cleanEmail}.`);
      }

      setMode('otp_verify');
    } catch (err) {
      setError(err.message || 'Registration failed. Please verify your details.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Registration OTP Verification
   */
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.verifyOtp({
        email: targetEmail,
        otp: cleanOtp,
        purpose: 'register'
      });

      setSuccessMsg('Email verified successfully! Welcome to GrowMore.');
      setTimeout(() => {
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess(response.user);
        }
      }, 700);
    } catch (err) {
      setError(err.message || 'Invalid or expired verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Resend OTP
   */
  const handleResendOtp = async (purpose) => {
    if (resendCooldown > 0) return;
    setError('');
    setInfoMsg('');

    try {
      const res = await api.resendOtp({
        email: targetEmail,
        purpose: purpose || 'register'
      });

      setResendCooldown(60);
      setOtpExpiresIn(300);

      if (res.devOtp) {
        setInfoMsg(`Fresh OTP: ${res.devOtp} (Sent to ${targetEmail} & Telegram)`);
        setOtp(res.devOtp);
      } else {
        setSuccessMsg(res.message || 'A fresh verification code has been dispatched to your email.');
      }
    } catch (err) {
      setError(err.message || 'Failed to resend verification code. Please wait and try again.');
    }
  };

  /**
   * Handle Forgot Password Step 1: Request OTP
   */
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.forgotPassword({ email: cleanEmail });
      const activeTarget = response.target || cleanEmail;
      setTargetEmail(activeTarget);
      setOtpExpiresIn(300);
      setResendCooldown(60);
      setOtp('');

      if (response.devOtp) {
        setInfoMsg(`Recovery OTP: ${response.devOtp} (Sent to ${activeTarget} & Telegram)`);
        setOtp(response.devOtp);
      } else {
        setInfoMsg(`A 6-digit recovery OTP has been dispatched to ${response.maskedTarget || activeTarget}.`);
      }

      setMode('forgot_reset');
    } catch (err) {
      setError(err.message || 'Unable to process password recovery. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Forgot Password Step 2: Verify OTP & Reset Password
   */
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit recovery OTP.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match. Please re-enter your new password.');
      return;
    }

    setIsLoading(true);
    try {
      await api.resetPassword({
        email: targetEmail,
        otp: cleanOtp,
        newPassword
      });

      setSuccessMsg('Your password has been successfully reset! Please sign in with your new credentials.');
      setMode('login');
      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please verify the OTP and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" ref={modalOverlayRef} onClick={onClose}>
      <div className="modal-content auth-modal" ref={modalContentRef} onClick={(e) => e.stopPropagation()}>
        {/* Modal Brand Header */}
        <div className="auth-header">
          <div className="auth-brand-logo">
            <TrendingUp size={22} className="logo-svg" />
            <span>Grow<span className="brand-highlight">More</span></span>
          </div>

          <h3 className="auth-title">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'register' && 'Register New Investor Profile'}
            {mode === 'otp_verify' && 'Verify Email Address'}
            {mode === 'forgot_phone' && 'Reset Password'}
            {mode === 'forgot_reset' && 'Set New Password'}
          </h3>
          <p className="auth-subtitle">
            {mode === 'login' && 'Sign in to access your investment portfolio & activity'}
            {mode === 'register' && 'Complete details to start your wealth building journey'}
            {mode === 'otp_verify' && `Enter the 6-digit OTP dispatched to ${targetEmail}`}
            {mode === 'forgot_phone' && 'Enter your registered email address to receive a recovery code'}
            {mode === 'forgot_reset' && `Enter the 6-digit recovery OTP sent to ${targetEmail} and your new password`}
          </p>
        </div>

        {/* Bank-Grade Security Badge */}
        <div className="auth-demo-notice auth-secure-badge">
          <ShieldCheck size={16} className="text-cyan flex-shrink-0" />
          <span>
            <strong>Bank-Grade 256-Bit SSL:</strong> End-to-end encrypted session. Your investor credentials and wallet assets are protected.
          </span>
        </div>

        {/* Tab switchers for Login / Register */}
        {(mode === 'login' || mode === 'register') && (
          <div className="auth-tabs">
            <button 
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); resetForm(); }}
            >
              Log In
            </button>
            <button 
              type="button"
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); resetForm(); }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Alerts & Feedback */}
        {error && (
          <div className="auth-alert error" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
            {unverifiedEmail && (
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  marginTop: '0.55rem',
                  background: 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  color: '#fbbf24',
                  fontWeight: 600,
                  alignSelf: 'flex-start'
                }}
                onClick={() => {
                  setTargetEmail(unverifiedEmail);
                  setMode('otp_verify');
                  setOtpExpiresIn(300);
                  setResendCooldown(60);
                  setError('');
                  setInfoMsg(`Please enter the verification code sent to ${unverifiedEmail}`);
                }}
              >
                Verify Email with OTP ({unverifiedEmail}) →
              </button>
            )}
          </div>
        )}

        {successMsg && (
          <div className="auth-alert success">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="auth-alert" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)', color: '#93c5fd' }}>
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Registered Email Address</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  id="login-email"
                  type="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label" htmlFor="login-password">Password</label>
                <button 
                  type="button" 
                  className="text-link text-xs"
                  onClick={() => { setMode('forgot_phone'); resetForm(); }}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <label className="checkbox-label" style={{ marginTop: '0.4rem', marginBottom: '0.75rem' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember Me on this device</span>
            </label>

            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <span>Authenticating with Backend...</span>
              ) : (
                <>
                  <span>Log In to GrowMore</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* 2. REGISTRATION FORM: Name, DOB, Email, Password, Referral Code only */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            {/* Full Name */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">Full Name (as per Bank/Aadhaar)</label>
              <div className="input-with-icon">
                <User size={18} className="input-icon" />
                <input
                  id="reg-name"
                  type="text"
                  className="form-input"
                  placeholder="Enter your full legal name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Date of Birth */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-dob">Date of Birth</label>
              <div className="input-with-icon">
                <Calendar size={18} className="input-icon" />
                <input
                  id="reg-dob"
                  type="date"
                  className="form-input"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  required
                />
              </div>
            </div>

            {/* Email Address (Target for OTP) */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">Email Address</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password (min. 6 characters)</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Create password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-confirm-password">Confirm Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Optional Referral Code */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-referral">Referral Code (Optional)</label>
              <div className="input-with-icon">
                <Gift size={18} className="input-icon" />
                <input
                  id="reg-referral"
                  type="text"
                  className="form-input"
                  placeholder="e.g. GM-VAR6B12"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            {/* Terms Agreement */}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              <span>
                I agree to GrowMore's Terms of Service and Privacy Policy.
              </span>
            </label>

            {/* Submit Action */}
            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <span>Registering & Generating OTP...</span>
              ) : (
                <>
                  <span>Create Account & Send OTP</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* 3. OTP VERIFICATION FORM (Registration) */}
        {mode === 'otp_verify' && (
          <form onSubmit={handleVerifyOtp} className="auth-form">
            <div className="auth-otp-box">
              <KeyRound size={28} className="text-cyan" style={{ margin: '0 auto 0.5rem auto' }} />
              <label className="form-label" htmlFor="reg-otp" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Enter 6-Digit Email Verification Code
              </label>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                Sent to: <strong style={{ color: '#38bdf8' }}>{targetEmail}</strong>
              </p>
              <input
                id="reg-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="form-input auth-otp-input"
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />

              <div className="auth-otp-meta">
                <span className="auth-timer-pill">
                  ⏱️ Expires in: {formatTimer(otpExpiresIn)}
                </span>
                <button
                  type="button"
                  className="auth-resend-btn"
                  disabled={resendCooldown > 0}
                  onClick={() => handleResendOtp('register')}
                >
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%' }}
              disabled={isLoading || otp.trim().length !== 6}
            >
              {isLoading ? (
                <span>Verifying Code...</span>
              ) : (
                <>
                  <span>Verify & Activate Account</span>
                  <CheckCircle2 size={18} />
                </>
              )}
            </button>

            <div className="auth-footer-nav" style={{ marginTop: '0.85rem' }}>
              <button 
                type="button"
                className="text-link"
                onClick={() => { setMode('register'); }}
              >
                ← Change Email Address / Back
              </button>
            </div>
          </form>
        )}

        {/* 4. FORGOT PASSWORD STEP 1: Request OTP via Email */}
        {mode === 'forgot_phone' && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="forgot-email">Registered Email Address</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input
                  id="forgot-email"
                  type="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <span>Requesting Recovery Code...</span>
              ) : (
                <>
                  <span>Send Recovery OTP</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="auth-footer-nav" style={{ marginTop: '0.85rem' }}>
              <button 
                type="button"
                className="text-link"
                onClick={() => { setMode('login'); resetForm(); }}
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* 5. FORGOT PASSWORD STEP 2: Verify OTP & Set New Password */}
        {mode === 'forgot_reset' && (
          <form onSubmit={handleResetPassword} className="auth-form">
            <div className="auth-otp-box">
              <label className="form-label" htmlFor="reset-otp" style={{ display: 'block', marginBottom: '0.5rem' }}>
                6-Digit Recovery OTP
              </label>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                Sent to: <strong style={{ color: '#38bdf8' }}>{targetEmail}</strong>
              </p>
              <input
                id="reset-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="form-input auth-otp-input"
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />

              <div className="auth-otp-meta">
                <span className="auth-timer-pill">
                  ⏱️ Expires in: {formatTimer(otpExpiresIn)}
                </span>
                <button
                  type="button"
                  className="auth-resend-btn"
                  disabled={resendCooldown > 0}
                  onClick={() => handleResendOtp('forgot_password')}
                >
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reset-new-password">New Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter new password (min. 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reset-confirm-new-password">Confirm New Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="reset-confirm-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Re-enter new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isLoading || otp.trim().length !== 6}
            >
              {isLoading ? (
                <span>Updating Password...</span>
              ) : (
                <>
                  <span>Reset & Save Password</span>
                  <CheckCircle2 size={18} />
                </>
              )}
            </button>

            <div className="auth-footer-nav" style={{ marginTop: '0.85rem' }}>
              <button 
                type="button"
                className="text-link"
                onClick={() => { setMode('login'); resetForm(); }}
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* Modal Close Button */}
        <button 
          className="modal-close-btn" 
          onClick={onClose} 
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
