const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const { authenticateToken } = require('../middleware/auth');
const { kycUpload } = require('../middleware/uploadMiddleware');

// All KYC routes strictly require valid customer authentication
router.use(authenticateToken);

// Customer KYC Submissions & Verification
router.post('/upload', kycUpload, kycController.uploadKycDocument);
router.get('/', kycController.listKycDocuments);
router.get('/:id', kycController.getKycDocumentById);
router.get('/:id/signed-url', kycController.regenerateSignedUrl);
router.post('/:id/signed-url', kycController.regenerateSignedUrl);

module.exports = router;
