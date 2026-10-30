const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { supportLimiter } = require('../middleware/rateLimiter');
const { validateSupportTicket } = require('../middleware/validator');

// All support ticket routes require valid authenticated user session
router.use(authenticateToken);

// 1. Customer Support Ticket Ingestion (Rate limited & schema validated)
router.post('/ticket', supportLimiter, validateSupportTicket, supportController.createTicket);
router.post('/tickets', supportLimiter, validateSupportTicket, supportController.createTicket);

// 2. Customer Ticket History
router.get('/my', supportController.getMyTickets);
router.get('/tickets/my', supportController.getMyTickets);

// 3. Admin Ticket Management (Strict admin role required)
router.get('/admin/tickets', requireRole('admin'), adminController.getTickets);
router.get('/admin/tickets/:id', requireRole('admin'), adminController.getTicketById);
router.patch('/admin/tickets/:id', requireRole('admin'), adminController.updateTicket);
router.post('/admin/tickets/:id/close', requireRole('admin'), adminController.closeTicket);

// 4. Single Ticket Inspection (Customer self-access or Admin)
router.get('/:id', supportController.getTicketById);
router.get('/tickets/:id', supportController.getTicketById);

module.exports = router;
