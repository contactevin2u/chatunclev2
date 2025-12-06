import { pool } from '../config/database';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');

  try {
    // Create admin user
    const adminPassword = await bcrypt.hash('EwhBxMzSYM007!', 12);

    await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
    `, ['admin@chatuncle.com', adminPassword, 'Admin', 'admin']);

    console.log('✓ Admin user created/updated');
    console.log('  Email: admin@chatuncle.com');

    console.log('\nSeeding completed!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
