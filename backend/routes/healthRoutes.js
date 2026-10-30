const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// Liveness probe
router.get('/', healthController.getHealth);
router.get('/health', healthController.getHealth);

// Readiness probe
router.get('/ready', healthController.getReadiness);

// Telemetry & metrics
router.get('/metrics', healthController.getMetrics);

module.exports = router;
