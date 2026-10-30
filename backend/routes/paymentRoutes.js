const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const payoutController = require('../controllers/payoutController');
const { authenticateToken } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

// Public config check
router.get('/config', paymentController.getConfigStatus);

// Authenticated order creation
router.post('/create-order', authenticateToken, paymentLimiter, paymentController.createOrder);

// Authenticated server-side signature and payment verification
router.post('/verify', authenticateToken, paymentLimiter, paymentController.verifyPayment);

// Public cryptographic webhook callback (called by deposit payment gateway)
router.post('/webhook', paymentController.handleWebhook);

// Public cryptographic webhook callback (called by payout / disbursement provider)
router.post('/payout-webhook', payoutController.handlePayoutWebhook);

module.exports = router;
