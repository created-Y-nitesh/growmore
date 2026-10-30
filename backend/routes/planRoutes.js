const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { validatePlanId } = require('../middleware/validator');

// Public endpoints to retrieve real investment plans from DB
router.get('/', planController.getAllPlans);
router.get('/:id', validatePlanId, planController.getPlanById);

module.exports = router;
