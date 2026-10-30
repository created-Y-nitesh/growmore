const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateVerifyOtp,
  validateResetPassword
} = require('../middleware/validator');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

// Registration & Login
router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/logout', authController.logout);

// OTP Verification & Resend
router.post('/verify-otp', authLimiter, validateVerifyOtp, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, authController.resendOtp);

// Password Recovery Flow
router.post('/forgot-password', otpLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', authLimiter, validateResetPassword, authController.resetPassword);

// Protected user profile route
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
