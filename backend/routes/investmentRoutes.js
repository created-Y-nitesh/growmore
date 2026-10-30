const express = require('express');
const router = express.Router();
const investmentController = require('../controllers/investmentController');
const { authenticateToken } = require('../middleware/auth');
const { validateInvestment } = require('../middleware/validator');

// All investment endpoints require authenticated session
router.use(authenticateToken);

router.post('/', validateInvestment, investmentController.createInvestment);
router.get('/my', investmentController.getMyInvestments);
router.get('/:id', investmentController.getInvestmentById);

module.exports = router;
