import pool from '../config/db.js';

/**
 * Platform overview statistics for Admin
 */
export const getAdminDashboardStats = async (req, res) => {
  try {
    const [[usersCount]] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [[sellersCount]] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "seller"');
    const [[productsCount]] = await pool.query('SELECT COUNT(*) as count FROM products');
    const [[ordersCount]] = await pool.query('SELECT COUNT(*) as count FROM orders');
    const [[pendingSlipsCount]] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = "pending_verification"');
    const [[revenueResult]] = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = "paid"');

    return res.json({
      success: true,
      data: {
        totalUsers: usersCount.count,
        totalSellers: sellersCount.count,
        totalProducts: productsCount.count,
        totalOrders: ordersCount.count,
        pendingSlips: pendingSlipsCount.count,
        totalPlatformRevenue: Number(revenueResult.total)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all registered users
 */
export const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, store_name, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update user role (buyer, seller, admin)
 */
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['buyer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role specified.' });
    }

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

    return res.json({
      success: true,
      message: `User role updated to ${role} successfully.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all orders waiting for payment verification
 */
export const getPendingPayments = async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, u.name as buyer_name, u.email as buyer_email
       FROM orders o
       JOIN users u ON o.buyer_id = u.id
       WHERE o.status = 'pending_verification'
       ORDER BY o.created_at ASC`
    );

    return res.json({ success: true, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Approve or reject a payment slip
 */
export const verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action, note } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject.' });
    }

    const newStatus = action === 'approve' ? 'paid' : 'payment_rejected';

    await pool.query(
      `UPDATE orders 
       SET status = ? 
       WHERE id = ?`,
      [newStatus, orderId]
    );

    const logTitle = action === 'approve' ? 'อนุมัติการชำระเงินเรียบร้อย' : 'สลิปไม่ผ่านการตรวจสอบ';
    const logDesc = action === 'approve'
      ? 'ผู้ขายได้รับแจ้งเตือนและเริ่มจัดเตรียมวัสดุงานคราฟต์'
      : (note || 'โปรดตรวจสอบยอดเงินหรืออัปโหลดสลิปที่ถูกต้องใหม่');

    await pool.query(
      `INSERT INTO craft_tracking_logs (order_id, step, status_title, notes, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [orderId, newStatus, logTitle, logDesc]
    );

    return res.json({
      success: true,
      message: `Payment status has been ${action === 'approve' ? 'approved' : 'rejected'}.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};