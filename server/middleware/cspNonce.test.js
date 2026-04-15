const cspNonceMiddleware = require('./cspNonce');

describe('cspNonceMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = { locals: {} };
    next = jest.fn();
  });

  test('sets res.locals.cspNonce to a base64 string', () => {
    cspNonceMiddleware(req, res, next);

    expect(res.locals.cspNonce).toBeDefined();
    expect(typeof res.locals.cspNonce).toBe('string');
    // 16 random bytes → 24 base64 chars
    expect(res.locals.cspNonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(res.locals.cspNonce, 'base64')).toHaveLength(16);
  });

  test('generates a unique nonce per invocation', () => {
    const res1 = { locals: {} };
    const res2 = { locals: {} };

    cspNonceMiddleware(req, res1, jest.fn());
    cspNonceMiddleware(req, res2, jest.fn());

    expect(res1.locals.cspNonce).not.toBe(res2.locals.cspNonce);
  });

  test('calls next()', () => {
    cspNonceMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
