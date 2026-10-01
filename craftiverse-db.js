import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// โหลดไฟล์ .env ที่อยู่ในโฟลเดอร์เดียวกัน
dotenv.config({ path: path.join(__dirname, '.env') });

async function testConnection() {
    console.log('🔍 กำลังทดสอบเชื่อมต่อด้วย Host:', process.env.TIDB_HOST || '(ไม่มีค่า TIDB_HOST)');

    try {
        const connection = await mysql.createConnection({
            host: process.env.TIDB_HOST,
            port: Number(process.env.TIDB_PORT) || 4000,
            user: process.env.TIDB_USER,
            password: process.env.TIDB_PASSWORD,
            database: process.env.TIDB_DATABASE || 'craftiverse_db',
            ssl: { rejectUnauthorized: true }
        });

        console.log('✅ เชื่อมต่อฐานข้อมูล craftiverse_db บน TiDB Cloud สำเร็จแล้ว!');
        const [rows] = await connection.query('SHOW TABLES;');
        console.log('📋 รายชื่อตารางใน craftiverse_db:', rows);
        await connection.end();
    } catch (error) {
        console.error('❌ เชื่อมต่อไม่สำเร็จ:', error);
    }
}

testConnection();