require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/aws_practice',
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

async function deleteTestQuestions(testId) {
  const client = await pool.connect();
  
  try {
    console.log(`Deleting all questions for test: ${testId}`);
    
    const result = await client.query(
      'DELETE FROM questions WHERE test_id = $1',
      [testId]
    );
    
    console.log(`Deleted ${result.rowCount} questions`);
    
  } catch (error) {
    console.error('Delete failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Get test ID from command line
const testId = process.argv[2];

if (!testId) {
  console.error('Usage: node delete-test-questions.js <test-id>');
  console.error('Example: node delete-test-questions.js aws-aif-c01');
  console.error('\nAvailable test IDs:');
  console.error('  - aws-saa-c03');
  console.error('  - aws-dva-c02');
  console.error('  - aws-dop-c02');
  console.error('  - aws-sap-c02');
  console.error('  - aws-aif-c01');
  console.error('  - aws-clf-c02');
  process.exit(1);
}

deleteTestQuestions(testId)
  .then(() => {
    console.log('Done! Now run: node database/migrate-data-only.js');
    process.exit(0);
  })
  .catch(() => process.exit(1));
