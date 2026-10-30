const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const { authenticateToken } = require('../middleware/auth');
const { validateDeposit } = require('../middleware/validator');

// All deposit endpoints require authenticated session
router.use(authenticateToken);

router.post('/', validateDeposit, depositController.createDeposit);
router.get('/my', depositController.getMyDeposits);
router.get('/:id', depositController.getDepositById);

module.exports = router;
