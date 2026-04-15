const { logAuditEvent, VALID_EVENT_TYPES } = require('./auditLogger');

/**
 * Creates a mock pg Pool whose .query() resolves by default.
 * Callers can override behaviour via the returned jest.fn().
 */
function createMockDb() {
  return { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
}

function validEvent(overrides = {}) {
  return {
    eventType: 'LOGIN_SUCCESS',
    userIdentifier: 'user@example.com',
    ipAddress: '127.0.0.1',
    details: { browser: 'Chrome' },
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    ...overrides,
  };
}

describe('logAuditEvent', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // --- happy path ---
  it('inserts a valid event into audit_logs', async () => {
    const db = createMockDb();
    const event = validEvent();

    await logAuditEvent(db, event);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params).toEqual([
      'LOGIN_SUCCESS',
      'user@example.com',
      '127.0.0.1',
      JSON.stringify({ browser: 'Chrome' }),
      '550e8400-e29b-41d4-a716-446655440000',
    ]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('accepts every valid event type', async () => {
    for (const eventType of VALID_EVENT_TYPES) {
      const db = createMockDb();
      await logAuditEvent(db, validEvent({ eventType }));
      expect(db.query).toHaveBeenCalledTimes(1);
    }
  });

  // --- non-blocking error handling ---
  it('does not throw when db.query rejects', async () => {
    const db = createMockDb();
    db.query.mockRejectedValue(new Error('connection lost'));

    await expect(logAuditEvent(db, validEvent())).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Audit log write failed:',
      'connection lost'
    );
  });

  it('does not throw when db is null', async () => {
    await expect(logAuditEvent(null, validEvent())).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Audit log skipped: no database pool provided'
    );
  });

  it('does not throw when event is null', async () => {
    const db = createMockDb();
    await expect(logAuditEvent(db, null)).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Audit log skipped: invalid event object'
    );
  });

  // --- validation ---
  it('rejects an unknown eventType without inserting', async () => {
    const db = createMockDb();
    await logAuditEvent(db, validEvent({ eventType: 'UNKNOWN' }));

    expect(db.query).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown eventType')
    );
  });

  // --- nullable fields ---
  it('passes null for optional fields when they are missing', async () => {
    const db = createMockDb();
    await logAuditEvent(db, {
      eventType: 'LOGIN_FAILURE',
    });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual(['LOGIN_FAILURE', null, null, null, null]);
  });
});
