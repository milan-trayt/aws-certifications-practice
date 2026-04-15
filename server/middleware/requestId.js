const crypto = require('crypto');

/**
 * Request ID Middleware
 * Generates a UUID v4 for each incoming request, attaches it to the request object,
 * and sets it as a response header for traceability.
 */
const requestIdMiddleware = (req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

module.exports = requestIdMiddleware;
