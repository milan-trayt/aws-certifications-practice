const { sendSuccess, sendError } = require('./responseHelper');

/**
 * Creates a mock Express response object with a chained `.status().json()` API.
 * @param {string} [requestId] - Optional requestId on the underlying req
 */
function createMockRes(requestId) {
  const res = {
    req: { requestId },
    _status: null,
    _body: null,
    status(code) {
      res._status = code;
      return res; // allow chaining
    },
    json(body) {
      res._body = body;
      return res;
    },
  };
  return res;
}

describe('sendSuccess', () => {
  it('returns data and meta with default 200 status', () => {
    const res = createMockRes('req-123');
    sendSuccess(res, { items: [1, 2] });

    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      data: { items: [1, 2] },
      meta: { requestId: 'req-123' },
    });
  });

  it('accepts a custom status code', () => {
    const res = createMockRes('req-456');
    sendSuccess(res, { id: 1 }, 201);

    expect(res._status).toBe(201);
    expect(res._body.data).toEqual({ id: 1 });
    expect(res._body.meta.requestId).toBe('req-456');
  });

  it('handles null data', () => {
    const res = createMockRes('req-789');
    sendSuccess(res, null);

    expect(res._status).toBe(200);
    expect(res._body.data).toBeNull();
  });

  it('sets requestId to undefined when req has no requestId', () => {
    const res = createMockRes(undefined);
    sendSuccess(res, 'ok');

    expect(res._body.meta.requestId).toBeUndefined();
  });
});

describe('sendError', () => {
  it('returns error object and meta with default 500 status', () => {
    const res = createMockRes('req-err-1');
    sendError(res, 'NOT_FOUND', 'Resource not found', 404);

    expect(res._status).toBe(404);
    expect(res._body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
      meta: { requestId: 'req-err-1' },
    });
  });

  it('defaults to 500 when no statusCode is provided', () => {
    const res = createMockRes('req-err-2');
    sendError(res, 'INTERNAL', 'Something went wrong');

    expect(res._status).toBe(500);
    expect(res._body.error.code).toBe('INTERNAL');
  });

  it('sets requestId to undefined when req has no requestId', () => {
    const res = createMockRes(undefined);
    sendError(res, 'BAD_REQUEST', 'Invalid input', 400);

    expect(res._body.meta.requestId).toBeUndefined();
  });
});
