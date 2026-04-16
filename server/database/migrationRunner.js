/**
 * Migration Runner
 *
 * Provides up(), down(), and status() functions for managing
 * database migrations. Tracks applied migrations in a `migrations`
 * table with batch numbers so rollbacks can undo an entire batch.
 *
 * Each migration file in server/database/migrations/ must export:
 *   up(client)   – applies the migration
 *   down(client) – reverts the migration
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Create a database pool using the same config as the rest of the app.
 */
function createPool() {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:password@localhost:5432/aws_practice',
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
  });
}

/**
 * Ensure the migrations tracking table exists.
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      batch INTEGER NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Return sorted migration file names from the migrations directory.
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();
}

/**
 * Run all pending (not-yet-applied) migrations in a single batch.
 */
async function up(pool) {
  const ownPool = !pool;
  if (!pool) pool = createPool();

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    // Determine which migrations have already been applied
    const { rows: applied } = await client.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    const allFiles = getMigrationFiles();
    const pending = allFiles.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    // Determine the next batch number
    const { rows: batchRows } = await client.query(
      'SELECT COALESCE(MAX(batch), 0) AS max_batch FROM migrations'
    );
    const nextBatch = batchRows[0].max_batch + 1;

    console.log(
      `Running ${pending.length} migration(s) in batch ${nextBatch}...`
    );

    await client.query('BEGIN');

    for (const file of pending) {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${file} does not export an up() function`);
      }
      console.log(`  ↑ ${file}`);
      await migration.up(client);
      await client.query(
        'INSERT INTO migrations (name, batch) VALUES ($1, $2)',
        [file, nextBatch]
      );
    }

    await client.query('COMMIT');
    console.log('Migrations applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

/**
 * Roll back all migrations from the most recent batch.
 */
async function down(pool) {
  const ownPool = !pool;
  if (!pool) pool = createPool();

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    // Find the latest batch
    const { rows: batchRows } = await client.query(
      'SELECT COALESCE(MAX(batch), 0) AS max_batch FROM migrations'
    );
    const lastBatch = batchRows[0].max_batch;

    if (lastBatch === 0) {
      console.log('Nothing to roll back.');
      return;
    }

    // Get migrations in the last batch (reverse order for rollback)
    const { rows: toRollback } = await client.query(
      'SELECT name FROM migrations WHERE batch = $1 ORDER BY id DESC',
      [lastBatch]
    );

    console.log(
      `Rolling back batch ${lastBatch} (${toRollback.length} migration(s))...`
    );

    await client.query('BEGIN');

    for (const row of toRollback) {
      const filePath = path.join(MIGRATIONS_DIR, row.name);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file not found: ${row.name}`);
      }
      const migration = require(filePath);
      if (typeof migration.down !== 'function') {
        throw new Error(
          `Migration ${row.name} does not export a down() function`
        );
      }
      console.log(`  ↓ ${row.name}`);
      await migration.down(client);
      await client.query('DELETE FROM migrations WHERE name = $1', [row.name]);
    }

    await client.query('COMMIT');
    console.log('Rollback completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error.message);
    throw error;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

/**
 * Return the status of every known migration.
 * Each entry: { name, status: 'applied' | 'pending', batch, applied_at }
 */
async function status(pool) {
  const ownPool = !pool;
  if (!pool) pool = createPool();

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const { rows: applied } = await client.query(
      'SELECT name, batch, applied_at FROM migrations ORDER BY id'
    );
    const appliedMap = new Map(applied.map((r) => [r.name, r]));

    const allFiles = getMigrationFiles();
    const statuses = allFiles.map((file) => {
      const record = appliedMap.get(file);
      if (record) {
        return {
          name: file,
          status: 'applied',
          batch: record.batch,
          applied_at: record.applied_at,
        };
      }
      return { name: file, status: 'pending', batch: null, applied_at: null };
    });

    return statuses;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

// ── CLI interface ──────────────────────────────────────────────────
if (require.main === module) {
  const command = process.argv[2];

  const run = async () => {
    const pool = createPool();
    try {
      if (command === 'rollback') {
        await down(pool);
      } else if (command === 'status') {
        const results = await status(pool);
        if (results.length === 0) {
          console.log('No migration files found.');
        } else {
          console.log('\nMigration Status:');
          console.log('-'.repeat(70));
          for (const m of results) {
            const badge = m.status === 'applied' ? '✓' : '…';
            const info =
              m.status === 'applied'
                ? `batch ${m.batch} – ${new Date(m.applied_at).toISOString()}`
                : 'pending';
            console.log(`  ${badge} ${m.name}  (${info})`);
          }
          console.log();
        }
      } else {
        await up(pool);
      }
    } finally {
      await pool.end();
    }
  };

  run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { up, down, status, createPool, ensureMigrationsTable };
