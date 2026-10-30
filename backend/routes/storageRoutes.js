const express = require('express');
const router = express.Router();
const storageController = require('../controllers/storageController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public signed URL download verification (secured by HMAC-SHA256 signature and timestamp)
router.get('/signed-download', storageController.handleSignedDownload);

// Admin-only storage audit exploration
router.get('/audit-logs', authenticateToken, requireRole('admin'), storageController.getStorageAuditLogs);

module.exports = router;
