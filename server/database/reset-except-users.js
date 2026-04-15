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
    
    console.log('Soft-deleting mock test results...');
    await client.query('UPDATE mock_test_results SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL');
    
    console.log('Soft-deleting user progress...');
    await client.query('UPDATE user_progress SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL');
    
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
