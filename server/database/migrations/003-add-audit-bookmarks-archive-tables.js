/**
 * Migration: Add audit_logs, bookmarks, and archive tables
 *
 * Validates: Requirements 10.4, 31.2, 34.2
 *
 * - Creates audit_logs table for tracking security and application events
 * - Creates bookmarks table for user question bookmarks
 * - Creates archived_mock_test_results table for soft-deleted test result archival
 * - Creates archived_mock_test_answers table for soft-deleted test answer archival
 */

async function up(client) {
  // audit_logs table
  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(50) NOT NULL,
      user_identifier VARCHAR(255),
      ip_address VARCHAR(45),
      details JSONB,
      request_id UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_identifier);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);

  // bookmarks table
  await client.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      question_id VARCHAR(50) REFERENCES questions(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, question_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
  `);

  // archived_mock_test_results table
  await client.query(`
    CREATE TABLE IF NOT EXISTS archived_mock_test_results (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      test_id VARCHAR(50),
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      time_spent INTEGER NOT NULL,
      completed_at TIMESTAMP,
      deleted_at TIMESTAMP,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // archived_mock_test_answers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS archived_mock_test_answers (
      id INTEGER PRIMARY KEY,
      mock_test_result_id INTEGER,
      question_id VARCHAR(50),
      user_answer VARCHAR(10),
      is_correct BOOLEAN,
      time_taken INTEGER,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS archived_mock_test_answers;');
  await client.query('DROP TABLE IF EXISTS archived_mock_test_results;');

  await client.query('DROP INDEX IF EXISTS idx_bookmarks_user_id;');
  await client.query('DROP TABLE IF EXISTS bookmarks;');

  await client.query('DROP INDEX IF EXISTS idx_audit_logs_created_at;');
  await client.query('DROP INDEX IF EXISTS idx_audit_logs_user;');
  await client.query('DROP INDEX IF EXISTS idx_audit_logs_event_type;');
  await client.query('DROP TABLE IF EXISTS audit_logs;');
}

module.exports = { up, down };
