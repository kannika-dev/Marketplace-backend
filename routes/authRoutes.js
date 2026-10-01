import express from 'express';
import {
    register,
    login,
    adminLogin,
    upgradeToSeller,
    getProfile,
    forgotPassword,
    resetPassword
} from '../controllers/authController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Authentication Routes
router.post('/register', register);
router.post('/login', login);
router.post('/admin-login', adminLogin);

// Password Management Routes
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Authenticated User Routes
router.get('/profile', verifyToken, getProfile);
router.post('/upgrade-seller', verifyToken, upgradeToSeller);

export default router;