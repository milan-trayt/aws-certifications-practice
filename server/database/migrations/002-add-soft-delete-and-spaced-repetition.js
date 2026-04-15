/**
 * Migration: Add soft-delete to mock_test_results and user_progress,
 *            add spaced repetition fields to user_progress
 *
 * Validates: Requirements 23.1, 32.1, 32.4
 *
 * - Adds deleted_at TIMESTAMP DEFAULT NULL to mock_test_results (soft-delete)
 * - Adds deleted_at TIMESTAMP DEFAULT NULL to user_progress (soft-delete)
 * - Adds spaced repetition columns to user_progress:
 *     correct_count, incorrect_count, ease_factor, interval_days,
 *     repetition_count, next_review_at, mastery_level
 * - Adds CHECK constraint on mastery_level: 'new', 'learning', 'reviewing', 'mastered'
 */

async function up(client) {
  // Soft-delete for mock_test_results
  await client.query(`
    ALTER TABLE mock_test_results
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
  `);

  // Soft-delete for user_progress
  await client.query(`
    ALTER TABLE user_progress
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
  `);

  // Spaced repetition columns on user_progress
  await client.query(`
    ALTER TABLE user_progress
      ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS incorrect_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ease_factor REAL DEFAULT 2.5,
      ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS repetition_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMP;
  `);

  // mastery_level with CHECK constraint
  // ADD COLUMN IF NOT EXISTS doesn't support inline CHECK in all PG versions,
  // so we add the column first, then the constraint separately.
  await client.query(`
    ALTER TABLE user_progress
      ADD COLUMN IF NOT EXISTS mastery_level VARCHAR(20) DEFAULT 'new';
  `);

  // Add CHECK constraint (use NOT VALID + VALIDATE to be safe with existing rows)
  // Drop first if it already exists to keep idempotent
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_mastery_level'
      ) THEN
        ALTER TABLE user_progress
          ADD CONSTRAINT chk_mastery_level
          CHECK (mastery_level IN ('new', 'learning', 'reviewing', 'mastered'));
      END IF;
    END
    $$;
  `);
}

async function down(client) {
  // Drop CHECK constraint
  await client.query(`
    ALTER TABLE user_progress
      DROP CONSTRAINT IF EXISTS chk_mastery_level;
  `);

  // Drop spaced repetition columns from user_progress
  await client.query(`
    ALTER TABLE user_progress
      DROP COLUMN IF EXISTS mastery_level,
      DROP COLUMN IF EXISTS next_review_at,
      DROP COLUMN IF EXISTS repetition_count,
      DROP COLUMN IF EXISTS interval_days,
      DROP COLUMN IF EXISTS ease_factor,
      DROP COLUMN IF EXISTS incorrect_count,
      DROP COLUMN IF EXISTS correct_count;
  `);

  // Drop deleted_at from user_progress
  await client.query(`
    ALTER TABLE user_progress
      DROP COLUMN IF EXISTS deleted_at;
  `);

  // Drop deleted_at from mock_test_results
  await client.query(`
    ALTER TABLE mock_test_results
      DROP COLUMN IF EXISTS deleted_at;
  `);
}

module.exports = { up, down };
