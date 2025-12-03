import { pool } from '../config/database';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');

  try {
    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);

    await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['admin@chatuncle.com', adminPassword, 'Admin User', 'admin']);

    console.log('✓ Admin user created');
    console.log('  Email: admin@chatuncle.com');
    console.log('  Password: admin123');
    console.log('  (Change this password after first login!)');

    // Create a sample agent
    const agentPassword = await bcrypt.hash('agent123', 12);

    await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['agent@chatuncle.com', agentPassword, 'Sales Agent', 'agent']);

    console.log('✓ Sample agent created');
    console.log('  Email: agent@chatuncle.com');
    console.log('  Password: agent123');

    console.log('\nSeeding completed!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
