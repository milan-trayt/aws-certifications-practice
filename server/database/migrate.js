require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/aws_practice',
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false // For AWS RDS with self-signed certificates
  } : false
});

// Path to the original test data
const ORIGINAL_DATA_PATH = path.join(__dirname, '../test-data');
const SCHEMA_PATH = path.join(__dirname, 'init/01-schema.sql');

async function createSchema() {
  const client = await pool.connect();
  
  try {
    console.log('Creating database schema...');
    
    // Read and execute schema file
    const schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf8');
    await client.query(schemaSQL);
    
    console.log('Database schema created successfully!');
    
  } catch (error) {
    console.error('Schema creation failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function migrateTestData() {
  const client = await pool.connect();
  
  try {
    console.log('Starting data migration...');
    
    // Read tests configuration
    const testsConfigPath = path.join(ORIGINAL_DATA_PATH, 'tests.json');
    
    if (!fs.existsSync(testsConfigPath)) {
      throw new Error(`Tests configuration file not found: ${testsConfigPath}`);
    }
    
    const testsConfig = JSON.parse(fs.readFileSync(testsConfigPath, 'utf8'));
    
    console.log(`Found ${testsConfig.tests.length} tests to migrate`);
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Migrate test metadata
    for (const test of testsConfig.tests) {
      console.log(`Migrating test metadata: ${test.name}`);
      
      await client.query(`
        INSERT INTO tests (id, name, description, category, difficulty, total_questions, time_limit, passing_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          difficulty = EXCLUDED.difficulty,
          total_questions = EXCLUDED.total_questions,
          time_limit = EXCLUDED.time_limit,
          passing_score = EXCLUDED.passing_score
      `, [
        test.id,
        test.name,
        test.description,
        test.category,
        test.difficulty,
        test.totalQuestions,
        test.timeLimit,
        test.passingScore
      ]);
    }
    
    // Migrate questions for each test
    for (const test of testsConfig.tests) {
      console.log(`Migrating questions for: ${test.name}`);
      
      const questionsFilePath = path.join(ORIGINAL_DATA_PATH, test.filename);
      
      if (!fs.existsSync(questionsFilePath)) {
        console.warn(`Questions file not found: ${test.filename}`);
        continue;
      }
      
      const questionsData = JSON.parse(fs.readFileSync(questionsFilePath, 'utf8'));
      const questions = questionsData.questions || [];
      
      console.log(`  Found ${questions.length} questions`);
      
      // Process questions in batches to avoid memory issues
      const batchSize = 100;
      for (let i = 0; i < questions.length; i += batchSize) {
        const batch = questions.slice(i, i + batchSize);
        
        for (const question of batch) {
          // Validate question has required fields
          if (!question.question_id || !question.question_text || !question.choices || !question.correct_answer) {
            console.warn(`Skipping invalid question: ${question.question_id}`);
            continue;
          }
          
          // Filter out questions with empty choices or missing content
          const hasValidChoices = Object.values(question.choices).some(choice => 
            typeof choice === 'string' && choice.trim().length > 0
          );
          const hasValidQuestionText = question.question_text && question.question_text.trim().length > 0;
          const hasImagePlaceholder = question.question_text && question.question_text.includes('//IMG//');
          
          // Keep questions that have valid choices OR have image placeholders
          if (!hasValidQuestionText || (!hasValidChoices && !hasImagePlaceholder)) {
            console.warn(`Skipping question with invalid content: ${question.question_id}`);
            continue;
          }
          
          await client.query(`
            INSERT INTO questions (
              id, test_id, question_number, question_text, choices, correct_answer,
              is_multiple_choice, question_images, answer_images, discussion, discussion_count
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
              test_id = EXCLUDED.test_id,
              question_number = EXCLUDED.question_number,
              question_text = EXCLUDED.question_text,
              choices = EXCLUDED.choices,
              correct_answer = EXCLUDED.correct_answer,
              is_multiple_choice = EXCLUDED.is_multiple_choice,
              question_images = EXCLUDED.question_images,
              answer_images = EXCLUDED.answer_images,
              discussion = EXCLUDED.discussion,
              discussion_count = EXCLUDED.discussion_count
          `, [
            question.question_id,
            test.id,
            question.question_number || 0,
            question.question_text,
            JSON.stringify(question.choices),
            question.correct_answer,
            question.is_multiple_choice || false,
            question.question_images || null,
            question.answer_images || null,
            question.discussion ? JSON.stringify(question.discussion) : null,
            question.discussion_count || 0
          ]);
        }
        
        console.log(`  Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(questions.length / batchSize)}`);
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('Data migration completed successfully!');
    
    // Print summary
    const testCount = await client.query('SELECT COUNT(*) FROM tests');
    const questionCount = await client.query('SELECT COUNT(*) FROM questions');
    
    console.log(`Summary:`);
    console.log(`  Tests migrated: ${testCount.rows[0].count}`);
    console.log(`  Questions migrated: ${questionCount.rows[0].count}`);
    
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function fullMigration() {
  try {
    console.log('Starting full database migration...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    // Test database connection
    const client = await pool.connect();
    console.log('Database connection successful!');
    client.release();
    
    // Create schema first
    await createSchema();
    
    // Then migrate data
    await migrateTestData();
    
    console.log('Full migration completed successfully!');
    
  } catch (error) {
    console.error('Full migration failed:', error);
    throw error;
  }
}

async function rollbackMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Rolling back migration...');
    
    await client.query('BEGIN');
    
    // Delete in reverse order due to foreign key constraints
    await client.query('DELETE FROM mock_test_answers');
    // Soft-delete tables with deleted_at column
    await client.query('UPDATE mock_test_results SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL');
    await client.query('UPDATE user_progress SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL');
    await client.query('DELETE FROM questions');
    await client.query('DELETE FROM tests');
    
    await client.query('COMMIT');
    
    console.log('Migration rollback completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollbackMigration()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    fullMigration()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

module.exports = {
  createSchema,
  migrateTestData,
  fullMigration,
  rollbackMigration
};