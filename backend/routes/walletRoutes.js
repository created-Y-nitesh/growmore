const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticateToken } = require('../middleware/auth');

// All wallet endpoints require authenticated session
router.use(authenticateToken);

router.get('/', walletController.getWallet);
router.get('/ledger', walletController.getLedger);

module.exports = router;
