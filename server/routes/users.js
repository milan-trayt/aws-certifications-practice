const express = require('express');
const { body, validationResult } = require('express-validator');
const xss = require('xss');
const { sendSuccess, sendError } = require('../utils/responseHelper');

const router = express.Router();

// Input sanitization function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return xss(input.trim());
};

/**
 * GET /api/users/profile — Get current user profile
 * Validates: Requirements 28.1
 */
router.get('/profile', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = await db.query(
      'SELECT email, first_name, last_name, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    const user = result.rows[0];

    sendSuccess(res, {
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * PUT /api/users/profile — Update current user profile (first_name, last_name)
 * Validates: Requirements 28.2
 */
router.put('/profile', [
  body('firstName')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),
  body('lastName')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const firstName = sanitizeInput(req.body.firstName);
    const lastName = sanitizeInput(req.body.lastName);
    const db = req.app.locals.db;

    const result = await db.query(
      'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 AND deleted_at IS NULL RETURNING email, first_name, last_name, created_at',
      [firstName, lastName, req.user.userId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'USER_NOT_FOUND', 'User not found', 404);
    }

    const user = result.rows[0];

    sendSuccess(res, {
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * GET /api/users/settings/:key — Get a user setting
 */
router.get('/settings/:key', async (req, res) => {
  try {
    const key = sanitizeInput(req.params.key);
    const db = req.app.locals.db;

    const result = await db.query(
      'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
      [req.user.userId, key]
    );

    sendSuccess(res, {
      key,
      value: result.rows.length > 0 ? result.rows[0].setting_value : null,
    });
  } catch (error) {
    console.error('Get user setting error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * PUT /api/users/settings/:key — Set a user setting
 */
router.put('/settings/:key', [
  body('value')
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Value must be a string up to 1000 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const key = sanitizeInput(req.params.key);
    const value = sanitizeInput(req.body.value);
    const db = req.app.locals.db;

    await db.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, setting_key)
       DO UPDATE SET setting_value = $3, updated_at = CURRENT_TIMESTAMP`,
      [req.user.userId, key, value]
    );

    sendSuccess(res, { key, value });
  } catch (error) {
    console.error('Set user setting error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

module.exports = router;
