const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const dashboardController = require('../controllers/dashboardController');
const payoutController = require('../controllers/payoutController');
const auditController = require('../controllers/auditController');
const kycController = require('../controllers/kycController');
const storageController = require('../controllers/storageController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// All admin endpoints strictly require valid JWT and server-verified 'admin' role
router.use(authenticateToken);
router.use(requireRole('admin'));

// 1. Admin Dashboard & Analytics (Optimized queries)
router.get('/dashboard/metrics', dashboardController.getDashboardMetrics);
router.get('/dashboard/revenue-analytics', dashboardController.getRevenueAnalytics);
router.get('/dashboard/user-growth', dashboardController.getUserGrowth);
router.get('/dashboard/investments-breakdown', dashboardController.getActiveInvestmentsBreakdown);
router.get('/dashboard/pending-actions', dashboardController.getPendingActions);

// 2. User Management
router.get('/users', adminController.getUsers);
router.patch('/users/:id/status', adminController.updateUserStatus);

// 3. Investment Plans Management
router.get('/plans', adminController.getPlans);
router.post('/plans', adminController.createPlan);
router.patch('/plans/:id', adminController.updatePlan);

// 4. Investment Contracts
router.get('/investments', adminController.getInvestments);

// 5. Deposit Requests & Manual Verification
router.get('/deposits', adminController.getDeposits);
router.post('/deposits/:id/verify-manual', adminController.verifyDepositManual);

// 6. Withdrawal Requests & Payout Transitions
router.get('/withdrawals', adminController.getWithdrawals);
router.post('/withdrawals/:id/approve', adminController.approveWithdrawal);
router.post('/withdrawals/:id/mark-paid', adminController.markWithdrawalPaid);
router.post('/withdrawals/:id/reject', adminController.rejectWithdrawal);

// Automated Payout Pipeline
router.post('/withdrawals/:id/process-payout', payoutController.processPayout);
router.post('/withdrawals/payouts/:ref/success', payoutController.confirmPayoutSuccess);
router.post('/withdrawals/payouts/:ref/fail', payoutController.confirmPayoutFailure);
router.get('/payouts', payoutController.getPayoutTransactions);

// 7. Platform Ledger Explorer
router.get('/ledger', adminController.getLedger);

// 8. Return Engine & Scheduled Batches
router.get('/returns', adminController.getReturns);
router.post('/returns/run-batch', adminController.runReturnBatch);

// 9. Administrative Audit Logs & Regulatory Export
router.get('/audit-logs/export', auditController.exportAuditLogs);
router.get('/audit-logs', adminController.getAuditLogs);

// 10. Financial Invariant Reconciliation
router.get('/reconciliation', adminController.getReconciliation);

// 11. Support Ticket Management
router.get('/tickets', adminController.getTickets);
router.get('/tickets/:id', adminController.getTicketById);
router.patch('/tickets/:id', adminController.updateTicket);
router.post('/tickets/:id/close', adminController.closeTicket);
router.patch('/tickets/:id/close', adminController.closeTicket);

// 12. KYC Identity Verification Workflow
router.get('/kyc', kycController.adminListKycDocuments);
router.get('/kyc/:id', kycController.getKycDocumentById);
router.patch('/kyc/:id/status', kycController.adminReviewKycDocument);
router.post('/kyc/:id/approve', kycController.adminApproveKyc);
router.post('/kyc/:id/reject', kycController.adminRejectKyc);

// 13. Storage Audit Logs Explorer
router.get('/storage/audit-logs', storageController.getStorageAuditLogs);

module.exports = router;
