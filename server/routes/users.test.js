const express = require('express');
const request = require('supertest');

// Mock cognitoAuthMiddleware — injects req.user when Authorization header present
jest.mock('../middleware/cognitoAuth', () => ({
  cognitoAuthMiddleware: (req, res, next) => {
    const auth = req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token', code: 'NO_TOKEN' });
    }
    req.user = { cognitoSub: 'sub-123', email: 'test@example.com', userId: 42 };
    next();
  },
}));

function createMockDb(overrides = {}) {
  const userRow = overrides.userRow !== undefined ? overrides.userRow : {
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    created_at: '2024-01-01',
  };

  return {
    query: jest.fn(async () => ({
      rows: userRow ? [userRow] : [],
    })),
  };
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  const { cognitoAuthMiddleware } = require('../middleware/cognitoAuth');
  app.use('/api/users', cognitoAuthMiddleware, require('./users'));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- GET /api/users/profile ---
describe('GET /api/users/profile', () => {
  test('returns user profile when authenticated', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      createdAt: '2024-01-01',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND deleted_at IS NULL'),
      [42]
    );
  });

  test('returns 401 without token', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  test('returns 404 when user not found', async () => {
    const db = createMockDb({ userRow: null });
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('User not found');
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

// --- PUT /api/users/profile ---
describe('PUT /api/users/profile', () => {
  test('updates and returns user profile', async () => {
    const updatedRow = {
      email: 'test@example.com',
      first_name: 'Updated',
      last_name: 'Name',
      created_at: '2024-01-01',
    };
    const db = { query: jest.fn(async () => ({ rows: [updatedRow] })) };
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'Updated', lastName: 'Name' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      email: 'test@example.com',
      firstName: 'Updated',
      lastName: 'Name',
      createdAt: '2024-01-01',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET first_name = $1, last_name = $2'),
      ['Updated', 'Name', 42]
    );
  });

  test('returns 401 without token', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .send({ firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(401);
  });

  test('returns 400 when firstName is missing', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ lastName: 'Name' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 400 when lastName is missing', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'Name' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 404 when user not found', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) };
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('User not found');
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  test('sanitizes XSS in input', async () => {
    const updatedRow = {
      email: 'test@example.com',
      first_name: '&lt;script&gt;alert("xss")&lt;/script&gt;',
      last_name: 'Clean',
      created_at: '2024-01-01',
    };
    const db = { query: jest.fn(async () => ({ rows: [updatedRow] })) };
    const app = buildApp(db);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: '<script>alert("xss")</script>', lastName: 'Clean' });

    expect(res.status).toBe(200);
    // The first argument to db.query should have the sanitized value (not raw script tag)
    const queryArgs = db.query.mock.calls[0][1];
    expect(queryArgs[0]).not.toContain('<script>');
  });
});
