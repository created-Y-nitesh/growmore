const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const avatarController = require('../controllers/avatarController');
const { authenticateToken } = require('../middleware/auth');
const { avatarUpload } = require('../middleware/uploadMiddleware');

// Customer Profile Management
router.get('/me', authenticateToken, profileController.getMe);
router.patch('/me', authenticateToken, profileController.updateMe);
router.put('/me', authenticateToken, profileController.updateMe);

// Customer Avatar Management
router.post('/avatar', authenticateToken, avatarUpload, avatarController.uploadAvatar);
router.get('/avatar', authenticateToken, avatarController.getAvatar);
router.delete('/avatar', authenticateToken, avatarController.deleteAvatar);

module.exports = router;
