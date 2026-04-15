const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('http');

// Set test env vars before importing csrf module
process.env.CSRF_SECRET = 'test-csrf-secret-key-for-testing';

const { csrfTokenHandler, doubleCsrfProtection } = require('./csrf');

/**
 * Helper: create a minimal Express app with CSRF middleware wired up.
 */
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Token endpoint (before protection middleware)
  app.get('/api/csrf-token', csrfTokenHandler);

  // CSRF protection middleware
  app.use(doubleCsrfProtection);

  // Protected test routes
  app.post('/api/protected', (req, res) => res.json({ ok: true }));
  app.put('/api/protected', (req, res) => res.json({ ok: true }));
  app.patch('/api/protected', (req, res) => res.json({ ok: true }));
  app.delete('/api/protected', (req, res) => res.json({ ok: true }));

  // Unprotected GET route
  app.get('/api/public', (req, res) => res.json({ ok: true }));

  // Error handler to catch CSRF errors
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      error: { code: err.code || 'UNKNOWN', message: err.message },
    });
  });

  return app;
}

/**
 * Helper: make an HTTP request to the test server.
 */
function request(server, { method = 'GET', path = '/', headers = {}, body = null, cookies = '' }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: {
        ...headers,
        ...(cookies ? { cookie: cookies } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const setCookieHeaders = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookies: setCookieHeaders,
          body: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Extract cookie string from set-cookie headers for forwarding.
 */
function extractCookies(setCookieHeaders) {
  return setCookieHeaders.map((h) => h.split(';')[0]).join('; ');
}

describe('CSRF Middleware', () => {
  let app, server;

  beforeAll((done) => {
    app = createTestApp();
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/csrf-token returns a csrfToken and sets a cookie', async () => {
    const res = await request(server, { path: '/api/csrf-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('csrfToken');
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
    // Should set a CSRF cookie
    expect(res.cookies.length).toBeGreaterThan(0);
    const csrfCookie = res.cookies.find((c) => c.includes('csrf'));
    expect(csrfCookie).toBeDefined();
  });

  it('GET requests pass without CSRF token', async () => {
    const res = await request(server, { path: '/api/public' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST request without CSRF token is rejected with 403', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/protected',
      body: { data: 'test' },
    });
    expect(res.status).toBe(403);
  });

  it('POST request with valid CSRF token succeeds', async () => {
    // Step 1: Get CSRF token
    const tokenRes = await request(server, { path: '/api/csrf-token' });
    const csrfToken = tokenRes.body.csrfToken;
    const cookies = extractCookies(tokenRes.cookies);

    // Step 2: Make protected request with token
    const res = await request(server, {
      method: 'POST',
      path: '/api/protected',
      headers: { 'x-csrf-token': csrfToken },
      cookies,
      body: { data: 'test' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('PUT request with valid CSRF token succeeds', async () => {
    const tokenRes = await request(server, { path: '/api/csrf-token' });
    const csrfToken = tokenRes.body.csrfToken;
    const cookies = extractCookies(tokenRes.cookies);

    const res = await request(server, {
      method: 'PUT',
      path: '/api/protected',
      headers: { 'x-csrf-token': csrfToken },
      cookies,
      body: { data: 'test' },
    });

    expect(res.status).toBe(200);
  });

  it('PATCH request with valid CSRF token succeeds', async () => {
    const tokenRes = await request(server, { path: '/api/csrf-token' });
    const csrfToken = tokenRes.body.csrfToken;
    const cookies = extractCookies(tokenRes.cookies);

    const res = await request(server, {
      method: 'PATCH',
      path: '/api/protected',
      headers: { 'x-csrf-token': csrfToken },
      cookies,
      body: { data: 'test' },
    });

    expect(res.status).toBe(200);
  });

  it('DELETE request with valid CSRF token succeeds', async () => {
    const tokenRes = await request(server, { path: '/api/csrf-token' });
    const csrfToken = tokenRes.body.csrfToken;
    const cookies = extractCookies(tokenRes.cookies);

    const res = await request(server, {
      method: 'DELETE',
      path: '/api/protected',
      headers: { 'x-csrf-token': csrfToken },
      cookies,
    });

    expect(res.status).toBe(200);
  });

  it('POST request with invalid CSRF token is rejected with 403', async () => {
    // Get a valid cookie but use a bogus token
    const tokenRes = await request(server, { path: '/api/csrf-token' });
    const cookies = extractCookies(tokenRes.cookies);

    const res = await request(server, {
      method: 'POST',
      path: '/api/protected',
      headers: { 'x-csrf-token': 'invalid-token-value' },
      cookies,
      body: { data: 'test' },
    });

    expect(res.status).toBe(403);
  });

  it('POST request with valid token but no cookie is rejected with 403', async () => {
    const tokenRes = await request(server, { path: '/api/csrf-token' });
    const csrfToken = tokenRes.body.csrfToken;

    const res = await request(server, {
      method: 'POST',
      path: '/api/protected',
      headers: { 'x-csrf-token': csrfToken },
      // No cookies forwarded
      body: { data: 'test' },
    });

    expect(res.status).toBe(403);
  });
});
