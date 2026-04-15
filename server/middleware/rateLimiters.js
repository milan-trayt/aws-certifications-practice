/**
 * Endpoint-specific rate limiters for public auth endpoints.
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */
const rateLimit = require('express-rate-limit');
const { RATE_LIMIT_WINDOW_MS } = require('../utils/constants');

/**
 * Creates a rate limiter with a standardized 429 JSON response.
 * @param {number} max - Maximum requests per window
 * @param {string} message - Human-readable error message
 * @returns {import('express-rate-limit').RateLimitRequestHandler}
 */
function createEndpointLimiter(max, message) {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: process.env.NODE_ENV === 'development' ? 0 : max, // 0 = unlimited in dev
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
        },
        meta: {
          requestId: _req.requestId,
        },
      });
    },
  });
}

const loginLimiter = createEndpointLimiter(
  10,
  'Too many login attempts, please try again later.'
);

const registerLimiter = createEndpointLimiter(
  5,
  'Too many registration attempts, please try again later.'
);

const forgotPasswordLimiter = createEndpointLimiter(
  5,
  'Too many password reset attempts, please try again later.'
);

module.exports = {
  createEndpointLimiter,
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
};
