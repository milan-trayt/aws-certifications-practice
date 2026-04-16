require('dotenv').config();
const { migrateTestData } = require('./migrate');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/aws_practice',
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false
});

async function run() {
  try {
    console.log('Migrating test data only (preserving existing users and data)...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    
    // Test connection
    const client = await pool.connect();
    console.log('Database connection successful!');
    client.release();
    
    // Run data migration
    await migrateTestData();
    
    console.log('Test data migration completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
