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

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  const { cognitoAuthMiddleware } = require('../middleware/cognitoAuth');
  app.use('/api/bookmarks', cognitoAuthMiddleware, require('./bookmarks'));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- GET /api/bookmarks ---
describe('GET /api/bookmarks', () => {
  test('returns all bookmarks for authenticated user', async () => {
    const rows = [
      { id: 1, question_id: 'q1', question_text: 'What is EC2?', test_id: 'aws-saa', question_number: 1, created_at: '2024-01-01' },
      { id: 2, question_id: 'q2', question_text: 'What is S3?', test_id: 'aws-saa', question_number: 2, created_at: '2024-01-02' },
    ];
    const db = { query: jest.fn(async () => ({ rows })) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      id: 1,
      questionId: 'q1',
      questionText: 'What is EC2?',
      testId: 'aws-saa',
      questionNumber: 1,
      createdAt: '2024-01-01',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE b.user_id = $1'),
      [42]
    );
  });

  test('filters bookmarks by testId when provided', async () => {
    const rows = [
      { id: 1, question_id: 'q1', question_text: 'What is EC2?', test_id: 'aws-saa', question_number: 1, created_at: '2024-01-01' },
    ];
    const db = { query: jest.fn(async () => ({ rows })) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/bookmarks?testId=aws-saa')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('q.test_id = $2'),
      [42, 'aws-saa']
    );
  });

  test('returns empty array when no bookmarks exist', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('returns 401 without token', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app).get('/api/bookmarks');
    expect(res.status).toBe(401);
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

// --- POST /api/bookmarks ---
describe('POST /api/bookmarks', () => {
  test('creates a new bookmark and returns 201', async () => {
    const insertedRow = { id: 1, user_id: 42, question_id: 'q1', created_at: '2024-01-01' };
    const db = { query: jest.fn(async () => ({ rows: [insertedRow] })) };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token')
      .send({ questionId: 'q1' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: 1,
      questionId: 'q1',
      createdAt: '2024-01-01',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bookmarks'),
      [42, 'q1']
    );
  });

  test('handles duplicate bookmark gracefully (returns 200)', async () => {
    const existingRow = { id: 1, user_id: 42, question_id: 'q1', created_at: '2024-01-01' };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // INSERT returns nothing (ON CONFLICT DO NOTHING)
        .mockResolvedValueOnce({ rows: [existingRow] }), // SELECT existing
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token')
      .send({ questionId: 'q1' });

    expect(res.status).toBe(200);
    expect(res.body.data.questionId).toBe('q1');
  });

  test('returns 400 when questionId is missing', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 401 without token', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/bookmarks')
      .send({ questionId: 'q1' });

    expect(res.status).toBe(401);
  });

  test('sanitizes XSS in questionId', async () => {
    const insertedRow = { id: 1, user_id: 42, question_id: '&lt;script&gt;', created_at: '2024-01-01' };
    const db = { query: jest.fn(async () => ({ rows: [insertedRow] })) };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token')
      .send({ questionId: '<script>alert("xss")</script>' });

    expect(res.status).toBe(201);
    const queryArgs = db.query.mock.calls[0][1];
    expect(queryArgs[1]).not.toContain('<script>');
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/bookmarks')
      .set('Authorization', 'Bearer valid-token')
      .send({ questionId: 'q1' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

// --- DELETE /api/bookmarks/:questionId ---
describe('DELETE /api/bookmarks/:questionId', () => {
  test('deletes a bookmark and returns success', async () => {
    const db = { query: jest.fn(async () => ({ rowCount: 1 })) };
    const app = buildApp(db);

    const res = await request(app)
      .delete('/api/bookmarks/q1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM bookmarks'),
      [42, 'q1']
    );
  });

  test('returns 404 when bookmark not found', async () => {
    const db = { query: jest.fn(async () => ({ rowCount: 0 })) };
    const app = buildApp(db);

    const res = await request(app)
      .delete('/api/bookmarks/nonexistent')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('returns 401 without token', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app).delete('/api/bookmarks/q1');
    expect(res.status).toBe(401);
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .delete('/api/bookmarks/q1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
