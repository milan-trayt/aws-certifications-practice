/**
 * Migration 005: Add user_settings table for per-user per-feature state
 * (e.g., spaced repetition current question index)
 */

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      setting_key VARCHAR(100) NOT NULL,
      setting_value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, setting_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_settings_user_key ON user_settings(user_id, setting_key);
  `);
}

async function down(client) {
  await client.query('DROP TABLE IF EXISTS user_settings;');
}

module.exports = { up, down };
