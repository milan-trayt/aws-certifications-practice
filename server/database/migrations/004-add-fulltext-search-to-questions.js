/**
 * Migration: Add full-text search vector to questions table
 *
 * Validates: Requirements 33.2
 *
 * - Adds search_vector tsvector column to questions table
 * - Populates search_vector from existing question_text
 * - Creates GIN index idx_questions_search on search_vector
 * - Creates trigger trg_questions_search_vector to auto-update on INSERT/UPDATE
 */

async function up(client) {
  // Add tsvector column
  await client.query(`
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS search_vector tsvector;
  `);

  // Populate search_vector from existing question_text
  await client.query(`
    UPDATE questions
      SET search_vector = to_tsvector('english', question_text)
      WHERE search_vector IS NULL;
  `);

  // Create GIN index for fast full-text lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_questions_search
      ON questions USING GIN(search_vector);
  `);

  // Create trigger function to keep search_vector in sync
  await client.query(`
    CREATE OR REPLACE FUNCTION update_question_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector = to_tsvector('english', NEW.question_text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger on INSERT or UPDATE of question_text
  await client.query(`
    DROP TRIGGER IF EXISTS trg_questions_search_vector ON questions;
    CREATE TRIGGER trg_questions_search_vector
      BEFORE INSERT OR UPDATE OF question_text ON questions
      FOR EACH ROW EXECUTE FUNCTION update_question_search_vector();
  `);
}

async function down(client) {
  await client.query(`
    DROP TRIGGER IF EXISTS trg_questions_search_vector ON questions;
  `);

  await client.query(`
    DROP FUNCTION IF EXISTS update_question_search_vector();
  `);

  await client.query(`
    DROP INDEX IF EXISTS idx_questions_search;
  `);

  await client.query(`
    ALTER TABLE questions
      DROP COLUMN IF EXISTS search_vector;
  `);
}

module.exports = { up, down };
