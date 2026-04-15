/**
 * Audit Logger Utility
 * Logs security and application events to the audit_logs table.
 * Non-blocking: errors are logged to console but never fail the request.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

const VALID_EVENT_TYPES = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'REGISTER',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_COMPLETE',
];

/**
 * Log an audit event to the audit_logs table.
 * This function is intentionally non-blocking — any database or validation
 * errors are caught and logged to console.error so they never propagate
 * to the caller or fail the HTTP request.
 *
 * @param {import('pg').Pool} db - PostgreSQL connection pool (req.app.locals.db)
 * @param {Object} event - The audit event to log
 * @param {string} event.eventType - One of the VALID_EVENT_TYPES
 * @param {string} event.userIdentifier - Username or email that identifies the actor
 * @param {string} event.ipAddress - Client IP address
 * @param {Record<string, unknown>} event.details - Arbitrary JSON details
 * @param {string} event.requestId - UUID that ties the event to a request
 * @returns {Promise<void>}
 */
async function logAuditEvent(db, event) {
  try {
    if (!db) {
      console.error('Audit log skipped: no database pool provided');
      return;
    }

    if (!event || typeof event !== 'object') {
      console.error('Audit log skipped: invalid event object');
      return;
    }

    const { eventType, userIdentifier, ipAddress, details, requestId } = event;

    if (!VALID_EVENT_TYPES.includes(eventType)) {
      console.error(`Audit log skipped: unknown eventType "${eventType}"`);
      return;
    }

    await db.query(
      `INSERT INTO audit_logs (event_type, user_identifier, ip_address, details, request_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventType,
        userIdentifier || null,
        ipAddress || null,
        details ? JSON.stringify(details) : null,
        requestId || null,
      ]
    );
  } catch (err) {
    // Non-blocking: log the error but never throw
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAuditEvent, VALID_EVENT_TYPES };
