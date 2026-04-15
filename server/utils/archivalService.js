/**
 * Archival Service
 * Moves old mock test results and answers to archive tables.
 *
 * Validates: Requirements 34.1, 34.2, 34.3
 */

/**
 * Archive mock test results older than the specified number of months.
 * Moves rows from mock_test_results and mock_test_answers into their
 * archived_* counterparts inside a single transaction, then deletes
 * the originals.
 *
 * @param {import('pg').Pool} db - PostgreSQL pool
 * @param {number} olderThanMonths - Archive results completed more than this many months ago
 * @returns {Promise<{ archivedCount: number }>}
 */
const { ARCHIVAL_MONTHS, DEFAULT_PAGE_SIZE } = require('./constants');

async function archiveOldResults(db, olderThanMonths = ARCHIVAL_MONTHS) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Copy answers whose parent result is older than the cutoff
    await client.query(`
      INSERT INTO archived_mock_test_answers (id, mock_test_result_id, question_id, user_answer, is_correct, time_taken, archived_at)
      SELECT mta.id, mta.mock_test_result_id, mta.question_id, mta.user_answer, mta.is_correct, mta.time_taken, NOW()
      FROM mock_test_answers mta
      JOIN mock_test_results mtr ON mta.mock_test_result_id = mtr.id
      WHERE mtr.completed_at < (NOW() - ($1 || ' months')::INTERVAL)
        AND mtr.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM archived_mock_test_answers a WHERE a.id = mta.id)
    `, [olderThanMonths]);

    // 2. Copy the results themselves
    const archiveResult = await client.query(`
      INSERT INTO archived_mock_test_results (id, user_id, test_id, score, total_questions, time_spent, completed_at, deleted_at, archived_at)
      SELECT id, user_id, test_id, score, total_questions, time_spent, completed_at, deleted_at, NOW()
      FROM mock_test_results
      WHERE completed_at < (NOW() - ($1 || ' months')::INTERVAL)
        AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM archived_mock_test_results a WHERE a.id = mock_test_results.id)
      RETURNING id
    `, [olderThanMonths]);

    const archivedIds = archiveResult.rows.map(r => r.id);

    if (archivedIds.length > 0) {
      // 3. Delete original answers
      await client.query(`
        DELETE FROM mock_test_answers WHERE mock_test_result_id = ANY($1)
      `, [archivedIds]);

      // 4. Delete original results
      await client.query(`
        DELETE FROM mock_test_results WHERE id = ANY($1)
      `, [archivedIds]);
    }

    await client.query('COMMIT');

    return { archivedCount: archivedIds.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieve archived mock test results for a user with pagination.
 *
 * @param {import('pg').Pool} db - PostgreSQL pool
 * @param {number} userId - User ID
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Results per page
 * @returns {Promise<{ results: object[], pagination: object }>}
 */
async function getArchivedResults(db, userId, page = 1, limit = DEFAULT_PAGE_SIZE) {
  const offset = (page - 1) * limit;

  const countResult = await db.query(
    'SELECT COUNT(*) FROM archived_mock_test_results WHERE user_id = $1',
    [userId]
  );
  const totalResults = parseInt(countResult.rows[0].count, 10);

  const result = await db.query(
    `SELECT id, user_id, test_id, score, total_questions, time_spent, completed_at, archived_at
     FROM archived_mock_test_results
     WHERE user_id = $1
     ORDER BY completed_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const results = result.rows.map(row => ({
    id: row.id,
    testId: row.test_id,
    score: row.score,
    totalQuestions: row.total_questions,
    timeSpent: row.time_spent,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    percentage: Math.round((row.score / row.total_questions) * 100),
  }));

  return {
    results,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalResults / limit) || 1,
      totalResults,
      hasNextPage: page < Math.ceil(totalResults / limit),
      hasPrevPage: page > 1,
    },
  };
}

module.exports = { archiveOldResults, getArchivedResults };
