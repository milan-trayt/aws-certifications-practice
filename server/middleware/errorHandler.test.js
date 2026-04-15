const errorHandler = require('./errorHandler');

/**
 * Creates mock Express req/res/next objects for testing the error handler.
 */
function createMocks(requestId = 'test-req-id') {
  const req = { requestId };
  const res = {
    req,
    _status: null,
    _body: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

// Silence console.error during tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
  delete process.env.NODE_ENV;
});

describe('errorHandler', () => {
  // --- Requirement 18.1: requestId in log messages ---
  describe('requestId logging', () => {
    it('includes req.requestId in the console.error log', () => {
      const { req, res, next } = createMocks('abc-123');
      errorHandler(new Error('boom'), req, res, next);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[abc-123]')
      );
    });

    it('logs "unknown" when requestId is missing', () => {
      const { req, res, next } = createMocks(undefined);
      req.requestId = undefined;
      errorHandler(new Error('boom'), req, res, next);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[unknown]')
      );
    });
  });

  // --- Requirement 18.2: error type → HTTP status mapping ---
  describe('error type mapping', () => {
    it('maps ValidationError to 400', () => {
      const err = new Error('bad input');
      err.name = 'ValidationError';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(400);
      expect(res._body.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps JsonWebTokenError to 401', () => {
      const err = new Error('jwt malformed');
      err.name = 'JsonWebTokenError';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(401);
      expect(res._body.error.code).toBe('AUTH_ERROR');
    });

    it('maps TokenExpiredError to 401', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(401);
      expect(res._body.error.code).toBe('AUTH_ERROR');
      expect(res._body.error.message).toBe('Token expired');
    });

    it('maps ForbiddenError to 403', () => {
      const err = new Error('not allowed');
      err.name = 'ForbiddenError';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(403);
      expect(res._body.error.code).toBe('FORBIDDEN');
    });

    it('maps err.status 403 to 403', () => {
      const err = new Error('forbidden');
      err.status = 403;
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(403);
    });

    it('maps NotFoundError to 404', () => {
      const err = new Error('missing');
      err.name = 'NotFoundError';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(404);
      expect(res._body.error.code).toBe('NOT_FOUND');
    });

    it('maps err.status 404 to 404', () => {
      const err = new Error('not found');
      err.status = 404;
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(404);
    });

    it('maps PostgreSQL unique violation (23505) to 409', () => {
      const err = new Error('duplicate key');
      err.code = '23505';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(409);
      expect(res._body.error.code).toBe('CONFLICT');
    });

    it('maps PostgreSQL foreign key violation (23503) to 409', () => {
      const err = new Error('fk violation');
      err.code = '23503';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(409);
      expect(res._body.error.code).toBe('CONFLICT');
    });

    it('maps PostgreSQL not-null violation (23502) to 400', () => {
      const err = new Error('not null');
      err.code = '23502';
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(400);
      expect(res._body.error.code).toBe('VALIDATION_ERROR');
    });

    it('uses err.status for custom errors', () => {
      const err = new Error('rate limited');
      err.status = 429;
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._status).toBe(429);
    });

    it('defaults unknown errors to 500', () => {
      const { req, res, next } = createMocks();
      errorHandler(new Error('unexpected'), req, res, next);

      expect(res._status).toBe(500);
      expect(res._body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // --- Requirement 18.3: sendError response format ---
  describe('response format (sendError)', () => {
    it('returns { error: { code, message }, meta: { requestId } }', () => {
      const { req, res, next } = createMocks('fmt-req');
      errorHandler(new Error('oops'), req, res, next);

      expect(res._body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
        meta: { requestId: 'fmt-req' },
      });
    });
  });

  // --- Requirement 18.4: suppress stack traces in production ---
  describe('stack trace suppression', () => {
    it('does NOT log stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const err = new Error('prod error');
      const { req, res, next } = createMocks('prod-req');
      errorHandler(err, req, res, next);

      const stackCalls = console.error.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('Stack:')
      );
      expect(stackCalls).toHaveLength(0);
    });

    it('logs stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const err = new Error('dev error');
      const { req, res, next } = createMocks('dev-req');
      errorHandler(err, req, res, next);

      const stackCalls = console.error.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('Stack:')
      );
      expect(stackCalls).toHaveLength(1);
    });

    it('does not include stack in the response body in production', () => {
      process.env.NODE_ENV = 'production';
      const err = new Error('prod error');
      const { req, res, next } = createMocks();
      errorHandler(err, req, res, next);

      expect(res._body.stack).toBeUndefined();
      expect(res._body.error.stack).toBeUndefined();
    });
  });
});
