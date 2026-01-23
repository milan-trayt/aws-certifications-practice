require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/aws_practice',
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Resetting database (preserving users)...');
    
    await client.query('BEGIN');
    
    // Delete in reverse order due to foreign key constraints
    console.log('Deleting mock test answers...');
    await client.query('DELETE FROM mock_test_answers');
    
    console.log('Deleting mock test results...');
    await client.query('DELETE FROM mock_test_results');
    
    console.log('Deleting user progress...');
    await client.query('DELETE FROM user_progress');
    
    console.log('Deleting questions...');
    await client.query('DELETE FROM questions');
    
    console.log('Deleting tests...');
    await client.query('DELETE FROM tests');
    
    await client.query('COMMIT');
    
    console.log('Database reset complete! Users preserved.');
    console.log('\nNow run: node database/migrate-data-only.js');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
