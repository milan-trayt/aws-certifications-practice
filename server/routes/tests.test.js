const express = require('express');
const request = require('supertest');
const cacheService = require('../utils/cacheService');

// --- Mock Redis store used by cacheService ---
function createMockRedis() {
  const store = new Map();
  const ttls = new Map();
  const listeners = {};

  return {
    status: 'ready',
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    emit(event, ...args) { (listeners[event] || []).forEach(fn => fn(...args)); },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async set(key, value, ...args) {
      store.set(key, value);
      if (args[0] === 'EX') ttls.set(key, args[1]);
    },
    async del(...keys) { keys.forEach(k => { store.delete(k); ttls.delete(k); }); },
    async scan(cursor, _m, pattern, _c, count) {
      const prefix = pattern.replace(/\*$/, '');
      const matched = [...store.keys()].filter(k => k.startsWith(prefix));
      return ['0', matched];
    },
    async quit() { store.clear(); },
    _store: store,
    _ttls: ttls,
  };
}

// --- Fake DB pool ---
function createMockDb(overrides = {}) {
  const defaults = {
    testsCount: '2',
    testsRows: [
      { id: 'aws-saa', name: 'AWS SAA', description: 'Solutions Architect', category: 'AWS', difficulty: 'Associate', total_questions: 65, time_limit: 130, passing_score: 720, created_at: '2024-01-01' },
      { id: 'aws-dva', name: 'AWS DVA', description: 'Developer', category: 'AWS', difficulty: 'Associate', total_questions: 65, time_limit: 130, passing_score: 720, created_at: '2024-01-01' },
    ],
    questionsCount: '2',
    questionsRows: [
      { id: 'q1', test_id: 'aws-saa', question_number: 1, question_text: 'Q1?', choices: '{}', correct_answer: 'A', is_multiple_choice: false, question_images: null, answer_images: null, discussion: null, discussion_count: 0 },
      { id: 'q2', test_id: 'aws-saa', question_number: 2, question_text: 'Q2?', choices: '{}', correct_answer: 'B', is_multiple_choice: false, question_images: null, answer_images: null, discussion: null, discussion_count: 0 },
    ],
  };
  const cfg = { ...defaults, ...overrides };

  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('COUNT(*)') && sql.includes('tests')) return { rows: [{ count: cfg.testsCount }] };
      if (sql.includes('COUNT(*)') && sql.includes('questions')) return { rows: [{ count: cfg.questionsCount }] };
      if (sql.includes('FROM tests') && sql.includes('WHERE id')) return { rows: cfg.testsRows.length ? [cfg.testsRows[0]] : [] };
      if (sql.includes('FROM tests')) return { rows: cfg.testsRows };
      if (sql.includes('ts_rank') && sql.includes('search_vector')) return { rows: cfg.searchRows || [] };
      if (sql.includes('FROM questions')) return { rows: cfg.questionsRows };
      return { rows: [] };
    }),
  };
}

// --- App factory ---
function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db = db;
  // Stub CSRF — tests don't need it
  app.use((req, res, next) => next());
  app.use('/api/tests', require('./tests'));
  return app;
}

let mockRedis;

beforeEach(async () => {
  mockRedis = createMockRedis();
  cacheService.init(mockRedis);
  mockRedis.emit('ready');
});

afterEach(async () => {
  await cacheService.quit();
});

// ─── GET / (test list) ───────────────────────────────────────────────
describe('GET /api/tests — caching', () => {
  test('returns DB data and populates cache on first request', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests');
    expect(res.status).toBe(200);
    expect(res.body.data.tests).toHaveLength(2);

    // Cache should now be populated
    const cached = await cacheService.get('tests:list:p1:l10');
    expect(cached).not.toBeNull();
    expect(cached.tests).toHaveLength(2);
  });

  test('returns cached data without hitting DB on second request', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    // First request — populates cache
    await request(app).get('/api/tests');
    const callCountAfterFirst = db.query.mock.calls.length;

    // Second request — should come from cache
    const res = await request(app).get('/api/tests');
    expect(res.status).toBe(200);
    expect(res.body.data.tests).toHaveLength(2);
    // DB should not have been called again
    expect(db.query.mock.calls.length).toBe(callCountAfterFirst);
  });

  test('cache uses 10-minute TTL', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    await request(app).get('/api/tests');
    expect(mockRedis._ttls.get('tests:list:p1:l10')).toBe(600);
  });
});

// ─── GET /:testId/questions ──────────────────────────────────────────
describe('GET /api/tests/:testId/questions — caching', () => {
  test('caches non-shuffled question responses', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions');
    expect(res.status).toBe(200);

    const cached = await cacheService.get('tests:aws-saa:questions:p1:l50');
    expect(cached).not.toBeNull();
    expect(cached.questions).toHaveLength(2);
  });

  test('does not cache shuffled question responses', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    await request(app).get('/api/tests/aws-saa/questions?shuffle=true');

    // No cache key should exist for shuffled requests
    const cached = await cacheService.get('tests:aws-saa:questions:p1:l50');
    expect(cached).toBeNull();
  });

  test('serves from cache on second non-shuffled request', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    await request(app).get('/api/tests/aws-saa/questions');
    const callCountAfterFirst = db.query.mock.calls.length;

    const res = await request(app).get('/api/tests/aws-saa/questions');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls.length).toBe(callCountAfterFirst);
  });
});

// ─── GET /:testId/questions/all ──────────────────────────────────────
describe('GET /api/tests/:testId/questions/all — caching', () => {
  test('caches all-questions response', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions/all');
    expect(res.status).toBe(200);

    const cached = await cacheService.get('tests:aws-saa:questions:all');
    expect(cached).not.toBeNull();
    expect(cached.questions).toHaveLength(2);
  });

  test('serves from cache on second request', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    await request(app).get('/api/tests/aws-saa/questions/all');
    const callCountAfterFirst = db.query.mock.calls.length;

    const res = await request(app).get('/api/tests/aws-saa/questions/all');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls.length).toBe(callCountAfterFirst);
  });

  test('cache uses 10-minute TTL', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    await request(app).get('/api/tests/aws-saa/questions/all');
    expect(mockRedis._ttls.get('tests:aws-saa:questions:all')).toBe(600);
  });
});

// ─── GET /:testId/questions/search ───────────────────────────────────
describe('GET /api/tests/:testId/questions/search — full-text search', () => {
  const searchRows = [
    { id: 'q1', test_id: 'aws-saa', question_number: 1, question_text: 'What is S3?', choices: '{}', correct_answer: 'A', is_multiple_choice: false, question_images: null, answer_images: null, discussion: null, discussion_count: 0, rank: 0.075 },
    { id: 'q2', test_id: 'aws-saa', question_number: 5, question_text: 'S3 storage classes?', choices: '{}', correct_answer: 'B', is_multiple_choice: false, question_images: null, answer_images: null, discussion: null, discussion_count: 0, rank: 0.061 },
  ];

  test('returns matching questions with rank scores', async () => {
    const db = createMockDb({ searchRows });
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions/search?q=S3');
    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(2);
    expect(res.body.data.questions[0].rank).toBe(0.075);
    expect(res.body.data.questions[1].rank).toBe(0.061);
    expect(res.body.data.totalResults).toBe(2);
    expect(res.body.data.searchQuery).toBe('S3');
    expect(res.body.data.test.id).toBe('aws-saa');
  });

  test('returns empty results when no matches found', async () => {
    const db = createMockDb({ searchRows: [] });
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions/search?q=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(0);
    expect(res.body.data.totalResults).toBe(0);
  });

  test('returns 400 when search query is missing', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions/search');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 400 when search query is empty', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions/search?q=');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 400 when search query exceeds max length', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    const longQuery = 'a'.repeat(201);
    const res = await request(app).get(`/api/tests/aws-saa/questions/search?q=${longQuery}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 404 when test does not exist', async () => {
    const db = createMockDb({ testsRows: [] });
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/nonexistent/questions/search?q=S3');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEST_NOT_FOUND');
  });
});

// ─── Cache invalidation ─────────────────────────────────────────────
describe('POST /api/tests/:testId/clear-cache — invalidation', () => {
  test('invalidates test list and test-specific question caches', async () => {
    const db = createMockDb();
    const app = buildApp(db);

    // Populate caches
    await request(app).get('/api/tests');
    await request(app).get('/api/tests/aws-saa/questions');
    await request(app).get('/api/tests/aws-saa/questions/all');

    // Verify caches exist
    expect(await cacheService.get('tests:list:p1:l10')).not.toBeNull();
    expect(await cacheService.get('tests:aws-saa:questions:p1:l50')).not.toBeNull();
    expect(await cacheService.get('tests:aws-saa:questions:all')).not.toBeNull();

    // Clear cache for aws-saa
    const res = await request(app).post('/api/tests/aws-saa/clear-cache');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    // Test list cache should be invalidated
    expect(await cacheService.get('tests:list:p1:l10')).toBeNull();
    // Test-specific question caches should be invalidated
    expect(await cacheService.get('tests:aws-saa:questions:p1:l50')).toBeNull();
    expect(await cacheService.get('tests:aws-saa:questions:all')).toBeNull();
  });
});

// ─── Fallback to DB when Redis unavailable ──────────────────────────
describe('Redis unavailable — DB fallback', () => {
  test('GET /api/tests falls back to DB when Redis is down', async () => {
    // Simulate Redis going down
    mockRedis.emit('close');

    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests');
    expect(res.status).toBe(200);
    expect(res.body.data.tests).toHaveLength(2);
    // DB should have been queried
    expect(db.query).toHaveBeenCalled();
  });

  test('GET /api/tests/:testId/questions falls back to DB when Redis is down', async () => {
    mockRedis.emit('close');

    const db = createMockDb();
    const app = buildApp(db);

    const res = await request(app).get('/api/tests/aws-saa/questions');
    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(2);
    expect(db.query).toHaveBeenCalled();
  });
});
