import pool from './config/db.js';
import bcrypt from 'bcryptjs';

async function createAdmin() {
    const adminData = {
        name: 'kannika lueadee',
        email: 'kannikapin48@gmail.com',
        password: 'kannika187205',
        role: 'admin'
    };

    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [adminData.email]);

        if (existing.length > 0) {
            const hashedPassword = await bcrypt.hash(adminData.password, 10);
            await pool.query(
                'UPDATE users SET password_hash = ?, role = "admin" WHERE email = ?',
                [hashedPassword, adminData.email]
            );
            console.log(`✅ อัปเดตบัญชี ${adminData.email} เป็น Admin เรียบร้อยแล้ว!`);
        } else {
            const hashedPassword = await bcrypt.hash(adminData.password, 10);
            await pool.query(
                'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [adminData.name, adminData.email, hashedPassword, adminData.role]
            );
            console.log(`✅ สร้างบัญชี Admin (${adminData.email}) สำเร็จแล้ว!`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการสร้าง Admin:', error);
        process.exit(1);
    }
}

createAdmin();