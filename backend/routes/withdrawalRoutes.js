const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { authenticateToken } = require('../middleware/auth');
const { validateWithdrawal } = require('../middleware/validator');

// All withdrawal endpoints require authenticated session
router.use(authenticateToken);

router.post('/', validateWithdrawal, withdrawalController.createWithdrawal);
router.get('/my', withdrawalController.getMyWithdrawals);
router.get('/:id', withdrawalController.getWithdrawalById);

module.exports = router;
