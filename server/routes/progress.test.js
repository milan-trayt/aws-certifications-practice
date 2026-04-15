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
  app.use('/api/progress', cognitoAuthMiddleware, require('./progress'));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- GET /api/progress/spaced-repetition/:testId ---
describe('GET /api/progress/spaced-repetition/:testId', () => {
  test('returns questions ordered by next_review_at ASC NULLS FIRST', async () => {
    const testRow = { id: 'aws-saa', name: 'AWS SAA' };
    const questionRows = [
      {
        question_id: 'q1', question_number: 1, question_text: 'Q1?', choices: '{}',
        correct_answer: 'A', is_multiple_choice: false,
        correct_count: 0, incorrect_count: 0, ease_factor: 2.5,
        interval_days: 0, repetition_count: 0, next_review_at: null, mastery_level: 'new'
      },
      {
        question_id: 'q2', question_number: 2, question_text: 'Q2?', choices: '{}',
        correct_answer: 'B', is_multiple_choice: false,
        correct_count: 3, incorrect_count: 1, ease_factor: 2.6,
        interval_days: 6, repetition_count: 2, next_review_at: '2025-01-15T00:00:00Z', mastery_level: 'reviewing'
      }
    ];

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [testRow] })       // test check
        .mockResolvedValueOnce({ rows: questionRows })     // questions query
    };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/spaced-repetition/aws-saa')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.test).toEqual({ id: 'aws-saa', name: 'AWS SAA' });
    expect(res.body.data.questions).toHaveLength(2);
    expect(res.body.data.questions[0].questionId).toBe('q1');
    expect(res.body.data.questions[0].masteryLevel).toBe('new');
    expect(res.body.data.questions[1].questionId).toBe('q2');
    expect(res.body.data.questions[1].easeFactor).toBe(2.6);
  });

  test('returns 404 when test not found', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/spaced-repetition/nonexistent')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEST_NOT_FOUND');
  });

  test('returns 401 without token', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app).get('/api/progress/spaced-repetition/aws-saa');
    expect(res.status).toBe(401);
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/spaced-repetition/aws-saa')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});


// --- POST /api/progress/spaced-repetition ---
describe('POST /api/progress/spaced-repetition', () => {
  test('applies SM-2 for correct answer (first repetition)', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = []; // no existing progress
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })  // question check
        .mockResolvedValueOnce({ rows: currentRows })     // current SR fields
        .mockResolvedValueOnce({ rows: [upsertRow] })     // upsert
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true });

    expect(res.status).toBe(200);
    const progress = res.body.data.progress;
    expect(progress.repetitionCount).toBe(1);
    expect(progress.intervalDays).toBe(1);
    expect(progress.masteryLevel).toBe('reviewing');
    expect(progress.correctCount).toBe(1);
    expect(progress.quality).toBe(5); // default for correct
  });

  test('applies SM-2 for correct answer (second repetition)', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = [{
      ease_factor: 2.6, interval_days: 1, repetition_count: 1,
      correct_count: 1, incorrect_count: 0
    }];
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })
        .mockResolvedValueOnce({ rows: currentRows })
        .mockResolvedValueOnce({ rows: [upsertRow] })
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true, quality: 5 });

    expect(res.status).toBe(200);
    const progress = res.body.data.progress;
    expect(progress.repetitionCount).toBe(2);
    expect(progress.intervalDays).toBe(6);
    expect(progress.masteryLevel).toBe('reviewing');
  });

  test('applies SM-2 for correct answer (third+ repetition uses ease_factor)', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = [{
      ease_factor: 2.6, interval_days: 6, repetition_count: 2,
      correct_count: 2, incorrect_count: 0
    }];
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })
        .mockResolvedValueOnce({ rows: currentRows })
        .mockResolvedValueOnce({ rows: [upsertRow] })
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true, quality: 5 });

    expect(res.status).toBe(200);
    const progress = res.body.data.progress;
    expect(progress.repetitionCount).toBe(3);
    expect(progress.intervalDays).toBe(Math.round(6 * 2.6)); // 16
    expect(progress.masteryLevel).toBe('reviewing'); // < 4 reps
  });

  test('mastery_level becomes mastered at 4 repetitions', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = [{
      ease_factor: 2.7, interval_days: 16, repetition_count: 3,
      correct_count: 3, incorrect_count: 0
    }];
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })
        .mockResolvedValueOnce({ rows: currentRows })
        .mockResolvedValueOnce({ rows: [upsertRow] })
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true, quality: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.repetitionCount).toBe(4);
    expect(res.body.data.progress.masteryLevel).toBe('mastered');
  });

  test('applies SM-2 for incorrect answer (resets repetition)', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = [{
      ease_factor: 2.6, interval_days: 6, repetition_count: 2,
      correct_count: 2, incorrect_count: 0
    }];
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })
        .mockResolvedValueOnce({ rows: currentRows })
        .mockResolvedValueOnce({ rows: [upsertRow] })
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: false });

    expect(res.status).toBe(200);
    const progress = res.body.data.progress;
    expect(progress.repetitionCount).toBe(0);
    expect(progress.intervalDays).toBe(1);
    expect(progress.incorrectCount).toBe(1);
    expect(progress.easeFactor).toBe(2.4); // 2.6 - 0.2
    expect(progress.masteryLevel).toBe('learning');
    expect(progress.quality).toBe(1); // default for incorrect
  });

  test('ease_factor does not go below 1.3', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = [{
      ease_factor: 1.3, interval_days: 1, repetition_count: 0,
      correct_count: 0, incorrect_count: 5
    }];
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })
        .mockResolvedValueOnce({ rows: currentRows })
        .mockResolvedValueOnce({ rows: [upsertRow] })
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: false });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.easeFactor).toBe(1.3); // clamped at 1.3
  });

  test('returns 404 when question not found', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'nonexistent', isCorrect: true });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
  });

  test('returns 400 for invalid body', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa' }); // missing questionId and isCorrect

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 401 without token', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true });

    expect(res.status).toBe(401);
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  test('uses custom quality value when provided', async () => {
    const questionRow = { id: 'q1' };
    const currentRows = [{
      ease_factor: 2.5, interval_days: 1, repetition_count: 1,
      correct_count: 1, incorrect_count: 0
    }];
    const upsertRow = { id: 1, created_at: '2025-01-10T00:00:00Z' };

    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [questionRow] })
        .mockResolvedValueOnce({ rows: currentRows })
        .mockResolvedValueOnce({ rows: [upsertRow] })
    };
    const app = buildApp(db);

    const res = await request(app)
      .post('/api/progress/spaced-repetition')
      .set('Authorization', 'Bearer valid-token')
      .send({ testId: 'aws-saa', questionId: 'q1', isCorrect: true, quality: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.quality).toBe(3);
    // ease_factor = max(1.3, 2.5 + 0.1 - (5-3)*(0.08 + (5-3)*0.02))
    // = max(1.3, 2.5 + 0.1 - 2*(0.08 + 2*0.02))
    // = max(1.3, 2.6 - 2*0.12) = max(1.3, 2.6 - 0.24) = 2.36
    expect(res.body.data.progress.easeFactor).toBe(2.36);
  });
});


// --- GET /api/progress/archived ---
describe('GET /api/progress/archived', () => {
  test('returns paginated archived results for authenticated user', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // COUNT
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1, user_id: 42, test_id: 'aws-saa', score: 50,
              total_questions: 65, time_spent: 3600,
              completed_at: '2024-01-01T00:00:00Z',
              archived_at: '2025-01-15T00:00:00Z',
            },
            {
              id: 2, user_id: 42, test_id: 'aws-dva', score: 40,
              total_questions: 65, time_spent: 3000,
              completed_at: '2024-02-01T00:00:00Z',
              archived_at: '2025-01-15T00:00:00Z',
            },
          ],
        }),
    };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/archived')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0].testId).toBe('aws-saa');
    expect(res.body.data.pagination.totalResults).toBe(2);
  });

  test('returns empty results when no archived data', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/archived')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(0);
    expect(res.body.data.pagination.totalResults).toBe(0);
  });

  test('accepts page and limit query params', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/archived?page=2&limit=5')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.currentPage).toBe(2);
    expect(res.body.data.pagination.totalPages).toBe(5);
  });

  test('returns 401 without token', async () => {
    const db = { query: jest.fn() };
    const app = buildApp(db);

    const res = await request(app).get('/api/progress/archived');
    expect(res.status).toBe(401);
  });

  test('returns 500 on database error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    const app = buildApp(db);

    const res = await request(app)
      .get('/api/progress/archived')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
