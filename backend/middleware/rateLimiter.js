const rateLimit = require('express-rate-limit');

// General API rate limiter: 200 requests per 15 minutes window
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.'
  }
});

// Stricter rate limiter for authentication endpoints: 15 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

// Rate limiter for financial order creation and payment endpoints: 30 requests per 15 minutes
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many financial requests from this IP. Please wait before retrying.'
  }
});

// Stricter rate limiter for OTP requests: 6 requests per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests from this IP. Please wait 15 minutes before requesting another code.'
  }
});

// Rate limiter for customer support ticket submissions: 10 requests per 15 minutes per IP
const supportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many support tickets submitted from this IP. Please wait before submitting another ticket.'
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  otpLimiter,
  supportLimiter
};
