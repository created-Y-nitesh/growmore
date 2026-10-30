const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticateToken } = require('../middleware/auth');

// All transaction endpoints require authenticated session
router.use(authenticateToken);

router.get('/', walletController.getTransactions);

module.exports = router;
