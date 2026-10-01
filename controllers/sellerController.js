import pool from '../config/db.js';
import { formatUploadedFileUrl } from '../utils/imageUploader.js';

/**
 * Get seller dashboard metrics & recent orders
 */
export const getSellerDashboardStats = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Total products
    const [productsCount] = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE seller_id = ?',
      [sellerId]
    );

    // Total items sold and revenue (JOIN products to check seller_id)
    const [salesStats] = await pool.query(
      `SELECT COUNT(DISTINCT oi.order_id) as total_orders, 
              COALESCE(SUM(oi.price * oi.quantity), 0) as total_revenue,
              COALESCE(SUM(oi.quantity), 0) as items_crafted
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE p.seller_id = ? AND o.status IN ('paid', 'completed')`,
      [sellerId]
    );

    // Active craft orders pending completion
    const [activeOrders] = await pool.query(
      `SELECT o.id, o.status, o.created_at, p.title as product_title, oi.quantity, oi.customization_notes,
              u.name as buyer_name, u.email as buyer_email
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       JOIN users u ON o.buyer_id = u.id
       WHERE p.seller_id = ? AND o.status NOT IN ('completed', 'cancelled')
       ORDER BY o.created_at DESC LIMIT 5`,
      [sellerId]
    );

    return res.json({
      success: true,
      data: {
        totalProducts: productsCount[0].count,
        totalOrders: salesStats[0].total_orders,
        totalRevenue: Number(salesStats[0].total_revenue),
        itemsCrafted: Number(salesStats[0].items_crafted),
        recentActiveOrders: activeOrders
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Add a new handmade / craft product
 * Supports lead_time_days and made-to-order settings
 */
export const addProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const sellerId = req.user.id;
    const {
      title,
      description,
      category_id,
      price,
      stock_quantity,
      lead_time_days,
      is_made_to_order,
      supports_customization,
      options // Array of { title, type, choices }
    } = req.body;

    if (!title || !price || !category_id) {
      return res.status(400).json({
        success: false,
        message: 'Title, price, and category_id are required.'
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = formatUploadedFileUrl(req, req.file.filename);
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    }

    await connection.beginTransaction();

    const [productResult] = await connection.query(
      `INSERT INTO products (
        seller_id, category_id, title, description, price, stock_quantity,
        image_url, supports_customization, is_made_to_order, lead_time_days, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        sellerId,
        category_id,
        title,
        description || '',
        Number(price),
        Number(stock_quantity) || 0,
        imageUrl,
        supports_customization === 'true' || supports_customization === true || supports_customization === 1 ? 1 : 0,
        is_made_to_order === 'true' || is_made_to_order === true || is_made_to_order === 1 ? 1 : 0,
        Number(lead_time_days) || 3
      ]
    );

    const productId = productResult.insertId;

    // Insert customization options if provided
    let parsedOptions = [];
    if (options) {
      try {
        parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
      } catch (err) {
        parsedOptions = [];
      }
    }

    for (const opt of parsedOptions) {
      if (opt.title) {
        await connection.query(
          `INSERT INTO product_options (product_id, title, option_type, choices)
           VALUES (?, ?, ?, ?)`,
          [
            productId,
            opt.title,
            opt.option_type || 'select',
            JSON.stringify(opt.choices || [])
          ]
        );
      }
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Artisan product published successfully.',
      data: { productId }
    });
  } catch (error) {
    await connection.rollback();
    console.error('addProduct error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product.',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * Get all products listed by this seller
 */
export const getSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const [products] = await pool.query(
      'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
      [sellerId]
    );

    return res.json({
      success: true,
      data: products
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get orders that involve this seller's products
 */
export const getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user.id;

    const [orders] = await pool.query(
      `SELECT DISTINCT o.id, o.buyer_id, o.status, o.total_amount, 
              o.shipping_address, o.payment_slip_url, o.created_at, u.name as buyer_name, u.email as buyer_email
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       JOIN users u ON o.buyer_id = u.id
       WHERE p.seller_id = ?
       ORDER BY o.created_at DESC`,
      [sellerId]
    );

    for (const ord of orders) {
      const [items] = await pool.query(
        `SELECT oi.*, p.title, p.image_url 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ? AND p.seller_id = ?`,
        [ord.id, sellerId]
      );
      ord.items = items;
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
 * Update craft journey / production status
 * e.g. 'material_prep', 'crafting', 'customizing', 'quality_check', 'shipped'
 */
export const updateCraftStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { craft_status, step_title, note } = req.body;

    const allowedStatuses = [
      'order_placed',
      'material_prep',
      'crafting',
      'customizing',
      'quality_check',
      'ready_to_ship',
      'shipped',
      'completed'
    ];

    if (!allowedStatuses.includes(craft_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid craft status. Allowed: ${allowedStatuses.join(', ')}`
      });
    }

    // Update status in orders table
    await pool.query(
      'UPDATE orders SET status = ? WHERE id = ?',
      [craft_status, orderId]
    );

    // Record in craft tracking history
    await pool.query(
      `INSERT INTO craft_tracking_logs (order_id, step, status_title, notes, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [orderId, craft_status, step_title || craft_status, note || '']
    );

    return res.json({
      success: true,
      message: `Craft status successfully updated to '${craft_status}'.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};