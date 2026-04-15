const {
  cognitoAuthMiddleware,
  optionalCognitoAuth,
  _resetVerifier,
  _setVerifier,
} = require('./cognitoAuth');

// --- helpers ---

function mockReq(authHeader) {
  return {
    header: (name) => (name === 'Authorization' ? authHeader : undefined),
    app: { locals: { db: mockDb() } },
  };
}

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

function mockDb(rows = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

function fakeVerifier(payload) {
  return { verify: jest.fn().mockResolvedValue(payload) };
}

function failingVerifier(message) {
  return { verify: jest.fn().mockRejectedValue(new Error(message)) };
}

beforeEach(() => _resetVerifier());

// --- cognitoAuthMiddleware ---

describe('cognitoAuthMiddleware', () => {
  test('returns 401 NO_TOKEN when no Authorization header', async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 NO_TOKEN when Authorization header has no Bearer prefix', async () => {
    const req = mockReq('Basic abc123');
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  test('returns 401 INVALID_TOKEN when token verification fails', async () => {
    _setVerifier(failingVerifier('token is invalid'));
    const req = mockReq('Bearer bad-token');
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 TOKEN_EXPIRED when token is expired', async () => {
    _setVerifier(failingVerifier('Token expired'));
    const req = mockReq('Bearer expired-token');
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  test('returns 401 INVALID_TOKEN when user not found in DB', async () => {
    _setVerifier(fakeVerifier({ sub: 'abc-123', email: 'a@b.com' }));
    const db = mockDb([]); // no rows
    const req = { ...mockReq('Bearer valid'), app: { locals: { db } } };
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  test('attaches req.user and calls next on success', async () => {
    _setVerifier(fakeVerifier({ sub: 'abc-123', email: 'user@test.com' }));
    const db = mockDb([{ id: 42, email: 'user@test.com', cognito_sub: 'abc-123' }]);
    const req = { ...mockReq('Bearer valid'), app: { locals: { db } } };
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      cognitoSub: 'abc-123',
      email: 'user@test.com',
      userId: 42,
    });
  });

  test('uses DB email when token email is missing', async () => {
    _setVerifier(fakeVerifier({ sub: 'abc-123' })); // no email in token
    const db = mockDb([{ id: 7, email: 'db@test.com', cognito_sub: 'abc-123' }]);
    const req = { ...mockReq('Bearer valid'), app: { locals: { db } } };
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    expect(req.user.email).toBe('db@test.com');
  });

  test('queries only non-deleted users', async () => {
    _setVerifier(fakeVerifier({ sub: 'abc-123', email: 'a@b.com' }));
    const db = mockDb([{ id: 1, email: 'a@b.com', cognito_sub: 'abc-123' }]);
    const req = { ...mockReq('Bearer valid'), app: { locals: { db } } };
    const res = mockRes();
    const next = jest.fn();

    await cognitoAuthMiddleware(req, res, next);

    const queryStr = db.query.mock.calls[0][0];
    expect(queryStr).toContain('deleted_at IS NULL');
  });
});

// --- optionalCognitoAuth ---

describe('optionalCognitoAuth', () => {
  test('sets req.user to null and calls next when no token', async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    await optionalCognitoAuth(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  test('sets req.user to null when token is invalid', async () => {
    _setVerifier(failingVerifier('bad'));
    const req = mockReq('Bearer bad');
    const res = mockRes();
    const next = jest.fn();

    await optionalCognitoAuth(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  test('attaches req.user when token is valid', async () => {
    _setVerifier(fakeVerifier({ sub: 'xyz', email: 'opt@test.com' }));
    const db = mockDb([{ id: 10, email: 'opt@test.com', cognito_sub: 'xyz' }]);
    const req = { ...mockReq('Bearer valid'), app: { locals: { db } } };
    const res = mockRes();
    const next = jest.fn();

    await optionalCognitoAuth(req, res, next);

    expect(req.user).toEqual({
      cognitoSub: 'xyz',
      email: 'opt@test.com',
      userId: 10,
    });
    expect(next).toHaveBeenCalled();
  });
});
