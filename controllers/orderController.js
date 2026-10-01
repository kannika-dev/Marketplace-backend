import pool from '../config/db.js';
import { formatUploadedFileUrl } from '../utils/imageUploader.js';

/**
 * Create a new order with items and initial craft tracker state
 */
export const createOrder = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const buyerId = req.user.id;
    const { items, shipping_address } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item.'
      });
    }

    await connection.beginTransaction();

    let totalAmount = 0;
    const calculatedItems = [];

    for (const item of items) {
      const [productRows] = await connection.query(
        'SELECT id, title, price, seller_id, is_made_to_order, lead_time_days FROM products WHERE id = ?',
        [item.product_id]
      );

      if (productRows.length === 0) {
        throw new Error(`Product with ID ${item.product_id} was not found.`);
      }

      const prod = productRows[0];
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const subtotal = Number(prod.price) * quantity;
      totalAmount += subtotal;

      calculatedItems.push({
        product_id: prod.id,
        price: prod.price,
        quantity,
        customization_notes: item.customization_notes || item.customization_details ? JSON.stringify(item.customization_notes || item.customization_details) : null
      });
    }

    // Insert order master (status: 'unpaid')
    const [orderResult] = await connection.query(
      `INSERT INTO orders (buyer_id, total_amount, status, shipping_address, created_at)
       VALUES (?, ?, 'unpaid', ?, NOW())`,
      [buyerId, totalAmount, shipping_address || '']
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const it of calculatedItems) {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, customization_notes)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, it.product_id, it.quantity, it.price, it.customization_notes]
      );
    }

    // Insert initial craft timeline log
    await connection.query(
      `INSERT INTO craft_tracking_logs (order_id, step, status_title, notes, created_at)
       VALUES (?, 'order_placed', 'คำสั่งซื้อถูกส่งเรียบร้อย', 'รอการชำระเงินและตรวจสอบสลิป', NOW())`,
      [orderId]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      data: {
        orderId,
        totalAmount,
        status: 'unpaid'
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('createOrder error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create order.',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * Get orders for currently logged in buyer
 */
export const getBuyerOrders = async (req, res) => {
  try {
    const buyerId = req.user.id;

    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC`,
      [buyerId]
    );

    for (const order of orders) {
      const [items] = await pool.query(
        `SELECT oi.*, p.title, p.image_url 
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [order.id]
      );

      const [logs] = await pool.query(
        `SELECT * FROM craft_tracking_logs WHERE order_id = ? ORDER BY created_at ASC`,
        [order.id]
      );

      order.items = items;
      order.timeline = logs;
    }

    return res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get specific order details (for buyer or seller involved)
 */
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orders[0];

    // Authorization check
    if (userRole !== 'admin' && order.buyer_id !== userId) {
      // Check if user is seller of this order's products
      const [sellerItems] = await pool.query(
        `SELECT oi.id 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ? AND p.seller_id = ? LIMIT 1`,
        [id, userId]
      );
      if (sellerItems.length === 0) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this order.' });
      }
    }

    const [items] = await pool.query(
      `SELECT oi.*, p.title, p.image_url, p.lead_time_days, p.is_made_to_order 
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [id]
    );

    const [timeline] = await pool.query(
      'SELECT * FROM craft_tracking_logs WHERE order_id = ? ORDER BY created_at ASC',
      [id]
    );

    order.items = items;
    order.timeline = timeline;

    return res.json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Upload payment slip for verification
 */
export const uploadPaymentSlip = async (req, res) => {
  try {
    const { id } = req.params;
    const buyerId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please attach payment slip image.' });
    }

    const slipUrl = formatUploadedFileUrl(req, req.file.filename);

    const [result] = await pool.query(
      `UPDATE orders 
       SET payment_slip_url = ?, status = 'pending_verification' 
       WHERE id = ? AND buyer_id = ?`,
      [slipUrl, id, buyerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    // Add tracking event
    await pool.query(
      `INSERT INTO craft_tracking_logs (order_id, step, status_title, notes, created_at)
       VALUES (?, 'payment_uploaded', 'ส่งหลักฐานการชำระเงินแล้ว', 'รอเจ้าหน้าที่แอดมินตรวจสอบสลิปโอนเงิน', NOW())`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Slip uploaded successfully. Waiting for admin verification.',
      slip_url: slipUrl
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};