/**
 * Response Helper Utility
 * Standardized API response format with request traceability.
 *
 * Validates: Requirements 17.1, 17.2, 17.3
 */

/**
 * Send a standardized success response.
 * @param {import('express').Response} res - Express response object
 * @param {*} data - Response payload
 * @param {number} [statusCode=200] - HTTP status code
 */
function sendSuccess(res, data, statusCode = 200) {
  const requestId = res.req && res.req.requestId ? res.req.requestId : undefined;

  res.status(statusCode).json({
    data,
    meta: {
      requestId,
    },
  });
}

/**
 * Send a standardized error response.
 * @param {import('express').Response} res - Express response object
 * @param {string} code - Application-level error code
 * @param {string} message - Human-readable error message
 * @param {number} [statusCode=500] - HTTP status code
 */
function sendError(res, code, message, statusCode = 500) {
  const requestId = res.req && res.req.requestId ? res.req.requestId : undefined;

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
    meta: {
      requestId,
    },
  });
}

module.exports = { sendSuccess, sendError };
