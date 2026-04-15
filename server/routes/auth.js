const express = require('express');
const { body, validationResult } = require('express-validator');
const xss = require('xss');
const { cognitoAuthMiddleware } = require('../middleware/cognitoAuth');
const { logAuditEvent } = require('../utils/auditLogger');
const { sendSuccess, sendError } = require('../utils/responseHelper');

const router = express.Router();

// Input sanitization function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return xss(input.trim());
};

/**
 * GET /me — Get current user info (protected by Cognito auth)
 * Validates: Requirements 1.2, 1.4
 */
router.get('/me', cognitoAuthMiddleware, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = await db.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    const user = result.rows[0];

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * POST /audit/login — Log a login event (success or failure)
 * Called by the client after Cognito authentication completes.
 * Validates: Requirements 10.1, 10.2, 10.3
 */
router.post('/audit/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('success')
    .isBoolean()
    .withMessage('success must be a boolean'),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('reason must be a string up to 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const { email, success, reason } = req.body;
    const sanitizedEmail = sanitizeInput(email);
    const db = req.app.locals.db;

    await logAuditEvent(db, {
      eventType: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
      userIdentifier: sanitizedEmail,
      ipAddress: req.ip,
      details: {
        reason: reason || null,
        userAgent: req.get('User-Agent') || null,
      },
      requestId: req.requestId || null,
    });

    sendSuccess(res, { message: 'Audit event logged' });
  } catch (error) {
    console.error('Audit login error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * POST /audit/register — Log a registration event
 * Called by the client after Cognito sign-up completes.
 * Validates: Requirements 10.1, 10.2, 10.3
 */
router.post('/audit/register', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const { email } = req.body;
    const sanitizedEmail = sanitizeInput(email);
    const db = req.app.locals.db;

    await logAuditEvent(db, {
      eventType: 'REGISTER',
      userIdentifier: sanitizedEmail,
      ipAddress: req.ip,
      details: {
        userAgent: req.get('User-Agent') || null,
      },
      requestId: req.requestId || null,
    });

    sendSuccess(res, { message: 'Audit event logged' });
  } catch (error) {
    console.error('Audit register error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * POST /audit/password-reset — Log a password reset event
 * Called by the client after Cognito password reset flow.
 * Validates: Requirements 10.1, 10.2, 10.3
 */
router.post('/audit/password-reset', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('phase')
    .isIn(['request', 'complete'])
    .withMessage('phase must be "request" or "complete"')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const { email, phase } = req.body;
    const sanitizedEmail = sanitizeInput(email);
    const db = req.app.locals.db;

    const eventType = phase === 'complete'
      ? 'PASSWORD_RESET_COMPLETE'
      : 'PASSWORD_RESET_REQUEST';

    await logAuditEvent(db, {
      eventType,
      userIdentifier: sanitizedEmail,
      ipAddress: req.ip,
      details: {
        phase,
        userAgent: req.get('User-Agent') || null,
      },
      requestId: req.requestId || null,
    });

    sendSuccess(res, { message: 'Audit event logged' });
  } catch (error) {
    console.error('Audit password-reset error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

module.exports = router;
