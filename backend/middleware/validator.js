// Email regular expression conforming to standard RFC 5322 basic pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Standard phone normalization and validation
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
    return `+91${digitsOnly}`;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `+91${digitsOnly.slice(1)}`;
  }
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return phone.trim().startsWith('+') ? `+${digitsOnly}` : `+91${digitsOnly.slice(-10)}`;
  }
  return null;
}

const validateRegister = (req, res, next) => {
  const { fullName, email, password, phone, dob, referralCode } = req.body;
  const errors = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push('Full name is required and must be at least 2 characters.');
  } else if (fullName.trim().length > 100) {
    errors.push('Full name must not exceed 100 characters.');
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    errors.push('A valid email address is required.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters long.');
  }

  // If phone provided, normalize and validate
  if (phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      errors.push('Please enter a valid 10-digit mobile number.');
    } else {
      req.body.phone = normalized;
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors
    });
  }

  // Normalize trimmed values
  req.body.fullName = fullName.trim();
  req.body.email = email.trim().toLowerCase();
  if (dob && typeof dob === 'string') req.body.dob = dob.trim();
  if (referralCode && typeof referralCode === 'string') req.body.referralCode = referralCode.trim().toUpperCase();

  next();
};

const validateLogin = (req, res, next) => {
  const { email, phone, identifier, password } = req.body;
  const errors = [];

  const rawId = identifier || phone || email;

  if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
    errors.push('Mobile number or email address is required.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors
    });
  }

  const trimmedId = rawId.trim();
  if (trimmedId.includes('@')) {
    if (!EMAIL_REGEX.test(trimmedId)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }
    req.body.email = trimmedId.toLowerCase();
    req.body.loginType = 'email';
  } else {
    const normalized = normalizePhone(trimmedId);
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }
    req.body.phone = normalized;
    req.body.loginType = 'phone';
  }

  next();
};

const validateForgotPassword = (req, res, next) => {
  const { phone, identifier, email } = req.body;
  const rawId = identifier || phone || email;

  if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Registered mobile number or email address is required.'
    });
  }

  const trimmedId = rawId.trim();
  if (trimmedId.includes('@')) {
    if (!EMAIL_REGEX.test(trimmedId)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }
    req.body.email = trimmedId.toLowerCase();
    req.body.phone = trimmedId.toLowerCase();
  } else {
    const normalized = normalizePhone(trimmedId);
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }
    req.body.phone = normalized;
  }

  next();
};

const validateVerifyOtp = (req, res, next) => {
  const { phone, email, identifier, otp, purpose } = req.body;
  const rawTarget = email || identifier || phone;

  if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Email address is required.'
    });
  }

  const trimmedTarget = rawTarget.trim();
  let normalizedTarget;
  if (trimmedTarget.includes('@')) {
    if (!EMAIL_REGEX.test(trimmedTarget)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address format.'
      });
    }
    normalizedTarget = trimmedTarget.toLowerCase();
    req.body.email = normalizedTarget;
  } else {
    normalizedTarget = normalizePhone(trimmedTarget);
    if (!normalizedTarget) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format.'
      });
    }
    req.body.phone = normalizedTarget;
  }

  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid 6-digit verification code.'
    });
  }

  const validPurposes = ['register', 'forgot_password'];
  if (!purpose || !validPurposes.includes(purpose)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP purpose. Must be "register" or "forgot_password".'
    });
  }

  req.body.identifier = normalizedTarget;
  req.body.otp = otp.trim();
  next();
};

const validateResetPassword = (req, res, next) => {
  const { phone, otp, resetToken, newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long.'
    });
  }

  if (resetToken && typeof resetToken === 'string') {
    req.body.resetToken = resetToken.trim();
    return next();
  }

  const rawTarget = phone || req.body.email || req.body.identifier;
  if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Mobile number or email is required for password reset.'
    });
  }

  const trimmedTarget = rawTarget.trim();
  let normalizedTarget;
  if (trimmedTarget.includes('@')) {
    if (!EMAIL_REGEX.test(trimmedTarget)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address format.'
      });
    }
    normalizedTarget = trimmedTarget.toLowerCase();
  } else {
    normalizedTarget = normalizePhone(trimmedTarget);
    if (!normalizedTarget) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format.'
      });
    }
  }

  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Valid 6-digit OTP is required.'
    });
  }

  req.body.phone = normalizedTarget;
  req.body.otp = otp.trim();
  next();
};

const validatePlanId = (req, res, next) => {
  const { id } = req.params;
  const planId = parseInt(id, 10);

  if (isNaN(planId) || planId <= 0 || !/^\d+$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: 'Plan ID must be a valid positive integer.'
    });
  }

  req.params.id = planId;
  next();
};

const validateDeposit = (req, res, next) => {
  const { amount, paymentProvider } = req.body;

  if (amount === undefined || amount === null || (typeof amount === 'string' && !amount.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Minimum deposit request amount is ₹100.'
    });
  }

  const parsedAmount = typeof amount === 'number' ? amount : parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount < 100) {
    return res.status(400).json({
      success: false,
      message: 'Minimum deposit request amount is ₹100.'
    });
  }

  if (parsedAmount > 5000000) {
    return res.status(400).json({
      success: false,
      message: 'Maximum single deposit request amount is ₹50,00,000. For institutional allocations, contact support.'
    });
  }

  if (paymentProvider !== undefined && paymentProvider !== null && typeof paymentProvider !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Payment provider must be a valid string.'
    });
  }

  req.body.amount = parsedAmount;
  next();
};

const validateWithdrawal = (req, res, next) => {
  const { amount, payoutMethod } = req.body;

  if (amount === undefined || amount === null || (typeof amount === 'string' && !amount.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Minimum withdrawal amount is ₹500.'
    });
  }

  const parsedAmount = typeof amount === 'number' ? amount : parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount < 500) {
    return res.status(400).json({
      success: false,
      message: 'Minimum withdrawal amount is ₹500.'
    });
  }

  if (parsedAmount > 1000000) {
    return res.status(400).json({
      success: false,
      message: 'Maximum single withdrawal limit is ₹10,00,000 for standard retail accounts.'
    });
  }

  if (payoutMethod !== undefined && payoutMethod !== null && typeof payoutMethod !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Payout method must be a valid string.'
    });
  }

  req.body.amount = parsedAmount;
  next();
};

const validateInvestment = (req, res, next) => {
  const { planId, principalAmount } = req.body;

  if (planId === undefined || planId === null || (typeof planId === 'string' && !planId.trim())) {
    return res.status(400).json({
      success: false,
      message: 'A valid plan ID is required.'
    });
  }

  const parsedPlanId = parseInt(planId, 10);
  if (isNaN(parsedPlanId) || parsedPlanId <= 0 || !/^\d+$/.test(String(planId).trim())) {
    return res.status(400).json({
      success: false,
      message: 'A valid plan ID is required.'
    });
  }

  if (principalAmount === undefined || principalAmount === null || (typeof principalAmount === 'string' && !principalAmount.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Investment principal must be a positive number.'
    });
  }

  const parsedPrincipal = typeof principalAmount === 'number' ? principalAmount : parseFloat(principalAmount);
  if (isNaN(parsedPrincipal) || parsedPrincipal <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Investment principal must be a positive number.'
    });
  }

  req.body.planId = parsedPlanId;
  req.body.principalAmount = parsedPrincipal;
  next();
};

const validateSupportTicket = (req, res, next) => {
  const { message, category } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message cannot be empty.'
    });
  }

  if (category !== undefined && category !== null && typeof category !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Category must be a string.'
    });
  }

  next();
};

module.exports = {
  normalizePhone,
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateVerifyOtp,
  validateResetPassword,
  validatePlanId,
  validateDeposit,
  validateWithdrawal,
  validateInvestment,
  validateSupportTicket
};
