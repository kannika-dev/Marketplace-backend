import express from 'express';
import {
  getAdminDashboardStats,
  getAllUsers,
  updateUserRole,
  getPendingPayments,
  verifyPayment
} from '../controllers/adminController.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Only admin users can access admin routes
router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/stats', getAdminDashboardStats);
router.get('/users', getAllUsers);
router.patch('/users/:userId/role', updateUserRole);
router.get('/payments/pending', getPendingPayments);
router.post('/payments/:orderId/verify', verifyPayment);

export default router;
