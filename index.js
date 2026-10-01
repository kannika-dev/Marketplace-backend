import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import pool, { testConnection } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import sellerRoutes from './routes/sellerRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Craftiverse Platform API'
  });
});

// Database schema auto-initializer for TiDB Cloud
const initDatabaseSchema = async () => {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      console.warn('⚠️  Skipping schema init as database is not reachable yet.');
      return;
    }

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('buyer', 'seller', 'admin') DEFAULT 'buyer',
        shop_name VARCHAR(150) NULL,
        shop_bio TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Create products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        seller_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        stock INT DEFAULT 0,
        lead_time_days INT DEFAULT 3,
        is_made_to_order TINYINT(1) DEFAULT 0,
        materials VARCHAR(255) NULL,
        craft_technique VARCHAR(255) NULL,
        image_url TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_seller (seller_id),
        INDEX idx_category (category)
      ) ENGINE=InnoDB;
    `);

    // Create product options table (for craft customization)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_options (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        title VARCHAR(150) NOT NULL,
        option_type VARCHAR(50) DEFAULT 'select',
        choices JSON,
        INDEX idx_product (product_id)
      ) ENGINE=InnoDB;
    `);

    // Create orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        buyer_id INT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        shipping_address TEXT,
        note TEXT,
        payment_status ENUM('unpaid', 'pending_verification', 'paid', 'payment_rejected') DEFAULT 'unpaid',
        payment_slip_url TEXT NULL,
        craft_status ENUM('order_placed', 'material_prep', 'crafting', 'customizing', 'quality_check', 'ready_to_ship', 'shipped', 'completed', 'cancelled') DEFAULT 'order_placed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_buyer (buyer_id)
      ) ENGINE=InnoDB;
    `);

    // Create order items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        seller_id INT NOT NULL,
        product_title VARCHAR(200) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        subtotal DECIMAL(10,2) NOT NULL,
        customization_details JSON NULL,
        INDEX idx_order (order_id)
      ) ENGINE=InnoDB;
    `);

    // Create craft tracking logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS craft_tracking_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        step VARCHAR(50) NOT NULL,
        status_title VARCHAR(150) NOT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_logs (order_id)
      ) ENGINE=InnoDB;
    `);

    console.log('✅ Craftiverse database schema initialized successfully on TiDB Cloud.');
  } catch (error) {
    console.error('Database schema initialization error:', error.message);
  }
};

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Express Server
app.listen(PORT, async () => {
  console.log(`🌿 Craftiverse API Server running smoothly on http://localhost:${PORT}`);
  await initDatabaseSchema();
});
