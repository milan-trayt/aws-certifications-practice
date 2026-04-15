const { sendError } = require('../utils/responseHelper');

/**
 * Centralized error-handling middleware.
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4
 *
 * - Includes req.requestId in every log message
 * - Maps known error types to appropriate HTTP status codes
 * - Uses sendError response helper for consistent format
 * - Suppresses stack traces in production responses
 */
const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  const isProduction = process.env.NODE_ENV === 'production';

  // Determine status code and error code/message from the error type
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'Internal Server Error';

  // --- Validation errors ---
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.errors
      ? Object.values(err.errors).map(val => val.message).join(', ')
      : err.message || 'Validation failed';
  }

  // --- Authentication errors (JWT) ---
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'AUTH_ERROR';
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'AUTH_ERROR';
    message = 'Token expired';
  }

  // --- Authorization / Forbidden ---
  else if (err.name === 'ForbiddenError' || err.status === 403) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = err.message || 'Forbidden';
  }

  // --- Not Found ---
  else if (err.name === 'NotFoundError' || err.status === 404) {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = err.message || 'Resource not found';
  }

  // --- DB constraint: unique violation (PostgreSQL 23505) ---
  else if (err.code === '23505') {
    statusCode = 409;
    errorCode = 'CONFLICT';
    message = 'Resource already exists';
  }

  // --- DB constraint: foreign key violation (PostgreSQL 23503) ---
  else if (err.code === '23503') {
    statusCode = 409;
    errorCode = 'CONFLICT';
    message = 'Referenced resource does not exist';
  }

  // --- DB constraint: not-null violation (PostgreSQL 23502) ---
  else if (err.code === '23502') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Required field is missing';
  }

  // --- Custom errors with an explicit status ---
  else if (err.status) {
    statusCode = err.status;
    errorCode = err.code || errorCode;
    message = err.message || message;
  }

  // Log with requestId for traceability
  console.error(`[${requestId}] ${err.name || 'Error'}: ${err.message || message}`);
  if (!isProduction && err.stack) {
    console.error(`[${requestId}] Stack: ${err.stack}`);
  }

  sendError(res, errorCode, message, statusCode);
};

module.exports = errorHandler;
