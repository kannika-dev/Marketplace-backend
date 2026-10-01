import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ชี้ path ถอยกลับมา 1 ชั้นเพื่ออ่านไฟล์ .env ในโฟลเดอร์ services
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * TiDB Cloud MySQL Connection Pool Configuration
 * TiDB Cloud requires SSL connection for secure transaction handling.
 */
const pool = mysql.createPool({
  host: process.env.TIDB_HOST || 'localhost',
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER || 'root',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DATABASE || 'craftiverse_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: process.env.TIDB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true
  }
});

// Helper function to test database connectivity
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('🌱 Connected securely to TiDB cloud Database successfully.');
    connection.release();
    return true;
  } catch (error) {
    console.warn('⚠️ TiDB cloud Database connection notice:', error.message);
    console.warn('👉 Please verify your TiDB credentials in services/.env');
    return false;
  }
};

export default pool;