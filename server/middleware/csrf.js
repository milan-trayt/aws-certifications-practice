const { doubleCsrf } = require('csrf-csrf');

const isProduction = process.env.NODE_ENV === 'production';

const {
  generateCsrfToken,
  doubleCsrfProtection: csrfProtectionMiddleware,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.JWT_SECRET || 'csrf-secret-dev',
  getSessionIdentifier: (req) => {
    return req.ip || 'anonymous';
  },
  cookieName: isProduction ? '__Host-csrf' : '__csrf',
  cookieOptions: {
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    secure: isProduction,
    httpOnly: true,
  },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  errorConfig: {
    statusCode: 403,
    message: 'Invalid or missing CSRF token',
    code: 'INVALID_CSRF_TOKEN',
  },
});

/**
 * GET /api/csrf-token handler
 */
const csrfTokenHandler = (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
};

/**
 * CSRF protection middleware.
 * In development, skip CSRF validation (different ports = cross-origin, cookies won't work).
 * In production, enforce CSRF on all state-changing requests.
 */
const doubleCsrfProtection = isProduction
  ? csrfProtectionMiddleware
  : (req, res, next) => next();

module.exports = {
  csrfTokenHandler,
  doubleCsrfProtection,
};
