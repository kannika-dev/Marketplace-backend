import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

/**
 * Register a new user
 * Default role is strictly 'buyer'
 */
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.'
      });
    }

    // Check existing email
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // แก้คอลัมน์เป็น password_hash ให้ตรงกับ TiDB
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, NOW())',
      [name, email, hashedPassword, 'buyer']
    );

    const userId = result.insertId;
    const token = jwt.sign(
      { id: userId, email, role: 'buyer', name },
      process.env.JWT_SECRET || 'craftiverse_default_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: {
        token,
        user: { id: userId, name, email, role: 'buyer' }
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.',
      error: error.message
    });
  }
};

/**
 * Login user (General Buyers & Sellers)
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    // ดึงคอลัมน์ password_hash ให้ตรงกับ DB
    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'craftiverse_default_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
      error: error.message
    });
  }
};

/**
 * Admin Login (Strictly checks for role = 'admin')
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    // ดึงคอลัมน์ password_hash ให้ตรงกับ DB
    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    const user = rows[0];

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Administrator privileges required.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'craftiverse_default_secret',
      { expiresIn: '12h' }
    );

    return res.json({
      success: true,
      message: 'Welcome back, Admin!',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during admin login.',
      error: error.message
    });
  }
};

/**
 * Upgrade current buyer to seller role
 */
export const upgradeToSeller = async (req, res) => {
  try {
    const userId = req.user.id;
    const { store_name, bank_account } = req.body;

    // แก้คอลัมน์เป็น store_name และ bank_account
    await pool.query(
      'UPDATE users SET role = "seller", store_name = ?, bank_account = ? WHERE id = ?',
      [store_name || 'My Craft Studio', bank_account || '-', userId]
    );

    const [rows] = await pool.query(
      'SELECT id, name, email, role, store_name, bank_account FROM users WHERE id = ?',
      [userId]
    );

    const updatedUser = rows[0];

    const newToken = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, role: 'seller', name: updatedUser.name },
      process.env.JWT_SECRET || 'craftiverse_default_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      success: true,
      message: 'Congratulations! Your account has been upgraded to Artisan Seller.',
      data: {
        token: newToken,
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Upgrade seller error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upgrade role.',
      error: error.message
    });
  }
};

/**
 * Get currently authenticated user profile
 */
export const getProfile = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, store_name, bank_account, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Request Password Reset
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมล' });
    }

    const [users] = await pool.query('SELECT id, name FROM users WHERE email = ? LIMIT 1', [email]);

    if (users.length === 0) {
      return res.json({
        success: true,
        message: 'หากอีเมลนี้มีอยู่ในระบบ ลิงก์สำหรับรีเซ็ตรหัสผ่านถูกส่งไปยังอีเมลของคุณแล้ว'
      });
    }

    const user = users[0];

    const resetToken = jwt.sign(
      { id: user.id, email },
      process.env.JWT_SECRET || 'craftiverse_default_secret',
      { expiresIn: '15m' }
    );

    const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}`;

    console.log(`📧 [Reset Password Link for ${email}]: ${resetUrl}`);

    return res.json({
      success: true,
      message: 'ลิงก์สำหรับรีเซ็ตรหัสผ่านถูกส่งไปยังอีเมลของคุณแล้ว',
      resetToken,
      resetUrl
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์', error: error.message });
  }
};

/**
 * Reset Password
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ Token และรหัสผ่านใหม่' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'craftiverse_default_secret');
    } catch (err) {
      return res.status(400).json({ success: false, message: 'ลิงก์รีเซ็ตรหัสผ่านหมดอายุหรือไม่ถูกต้อง' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(newPassword, salt);

    // แก้เป็น password_hash
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHashedPassword, decoded.id]
    );

    return res.json({
      success: true,
      message: 'เปลี่ยนรหัสผ่านใหม่สำเร็จแล้ว! สามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์', error: error.message });
  }
};