const { createEndpointLimiter } = require('./rateLimiters');
const express = require('express');
const http = require('http');

/**
 * Helper: creates a minimal Express app with a rate-limited endpoint.
 * @param {number} max - Max requests allowed in the window
 * @param {string} message - Expected error message
 * @returns {{ app: express.Express, server: http.Server, baseUrl: string }}
 */
function createTestApp(max, message) {
  const app = express();

  // Simulate requestId middleware
  app.use((req, _res, next) => {
    req.requestId = 'test-req-id';
    next();
  });

  const limiter = createEndpointLimiter(max, message);
  app.post('/test', limiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

/**
 * Helper: makes a POST request to the test server.
 */
function post(baseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL('/test', baseUrl);
    const req = http.request(url, { method: 'POST' }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: JSON.parse(body),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('rateLimiters', () => {
  let server;
  let baseUrl;

  afterEach((done) => {
    if (server) {
      server.close(done);
      server = null;
    } else {
      done();
    }
  });

  it('allows requests within the limit', (done) => {
    const app = createTestApp(3, 'Rate limited');
    server = app.listen(0, async () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;

      const res = await post(baseUrl);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      done();
    });
  });

  it('returns 429 with correct JSON body when limit is exceeded', (done) => {
    const msg = 'Too many attempts, try later.';
    const app = createTestApp(2, msg);
    server = app.listen(0, async () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;

      // Exhaust the limit
      await post(baseUrl);
      await post(baseUrl);

      // This request should be rate-limited
      const res = await post(baseUrl);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.body.error.message).toBe(msg);
      expect(res.body.meta.requestId).toBe('test-req-id');
      done();
    });
  });

  it('includes Retry-After header when limit is exceeded (standardHeaders)', (done) => {
    const app = createTestApp(1, 'Limited');
    server = app.listen(0, async () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;

      await post(baseUrl); // use up the single allowed request
      const res = await post(baseUrl);

      expect(res.status).toBe(429);
      // standardHeaders: true sets RateLimit-* headers; Retry-After is included
      // express-rate-limit v7 with standardHeaders:true sends retry-after
      expect(res.headers['retry-after']).toBeDefined();
      done();
    });
  });
});
