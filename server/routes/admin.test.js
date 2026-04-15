const express = require('express');
const request = require('supertest');

jest.mock('../middleware/cognitoAuth', () => ({
  cognitoAuthMiddleware: (req, res, next) => {
    const auth = req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token', code: 'NO_TOKEN' });
    }
    req.user = { cognitoSub: 'sub-123', email: 'admin@example.com', userId: 1 };
    next();
  },
}));

jest.mock('../utils/archivalService');

const { archiveOldResults } = require('../utils/archivalService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.db = {};

  const { cognitoAuthMiddleware } = require('../middleware/cognitoAuth');
  app.use('/api/admin', cognitoAuthMiddleware, require('./admin'));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/admin/archive', () => {
  test('triggers archival with default 12 months', async () => {
    archiveOldResults.mockResolvedValue({ archivedCount: 5 });
    const app = buildApp();

    const res = await request(app)
      .post('/api/admin/archive')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.archivedCount).toBe(5);
    expect(res.body.data.olderThanMonths).toBe(12);
    expect(archiveOldResults).toHaveBeenCalledWith({}, 12);
  });

  test('triggers archival with custom olderThanMonths', async () => {
    archiveOldResults.mockResolvedValue({ archivedCount: 10 });
    const app = buildApp();

    const res = await request(app)
      .post('/api/admin/archive')
      .set('Authorization', 'Bearer valid-token')
      .send({ olderThanMonths: 6 });

    expect(res.status).toBe(200);
    expect(res.body.data.archivedCount).toBe(10);
    expect(res.body.data.olderThanMonths).toBe(6);
    expect(archiveOldResults).toHaveBeenCalledWith({}, 6);
  });

  test('returns 400 for invalid olderThanMonths', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/admin/archive')
      .set('Authorization', 'Bearer valid-token')
      .send({ olderThanMonths: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 401 without token', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/admin/archive')
      .send({});

    expect(res.status).toBe(401);
  });

  test('returns 500 on service error', async () => {
    archiveOldResults.mockRejectedValue(new Error('DB failure'));
    const app = buildApp();

    const res = await request(app)
      .post('/api/admin/archive')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
