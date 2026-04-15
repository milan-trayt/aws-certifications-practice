/**
 * Migration: Add Cognito and soft-delete columns to users table
 *
 * Validates: Requirements 1.5, 23.1
 *
 * - Adds cognito_sub VARCHAR(255) UNIQUE for linking users to Cognito identities
 * - Adds deleted_at TIMESTAMP DEFAULT NULL for soft-delete support
 * - Creates unique index idx_users_cognito_sub on cognito_sub
 */

async function up(client) {
  await client.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS cognito_sub VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cognito_sub
      ON users (cognito_sub);
  `);
}

async function down(client) {
  await client.query(`
    DROP INDEX IF EXISTS idx_users_cognito_sub;
  `);

  await client.query(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS cognito_sub,
      DROP COLUMN IF EXISTS deleted_at;
  `);
}

module.exports = { up, down };
