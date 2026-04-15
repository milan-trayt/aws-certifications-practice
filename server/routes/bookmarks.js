const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');
const { sendSuccess, sendError } = require('../utils/responseHelper');

const router = express.Router();

// Input sanitization function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return xss(input.trim());
};

/**
 * GET /api/bookmarks — List all bookmarks for the authenticated user
 * Optionally filtered by testId query parameter.
 * Validates: Requirements 31.1, 31.2
 */
router.get('/', [
  query('testId')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('testId must be a string up to 50 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const db = req.app.locals.db;
    const userId = req.user.userId;
    const testId = req.query.testId ? sanitizeInput(req.query.testId) : null;

    let queryText;
    let queryParams;

    if (testId) {
      queryText = `
        SELECT b.id, b.question_id, b.created_at,
               q.question_text, q.test_id, q.question_number,
               q.choices, q.correct_answer, q.is_multiple_choice,
               q.discussion, q.discussion_count,
               q.question_images, q.answer_images
        FROM bookmarks b
        JOIN questions q ON b.question_id = q.id
        WHERE b.user_id = $1 AND q.test_id = $2
        ORDER BY b.created_at DESC
      `;
      queryParams = [userId, testId];
    } else {
      queryText = `
        SELECT b.id, b.question_id, b.created_at,
               q.question_text, q.test_id, q.question_number,
               q.choices, q.correct_answer, q.is_multiple_choice,
               q.discussion, q.discussion_count,
               q.question_images, q.answer_images
        FROM bookmarks b
        JOIN questions q ON b.question_id = q.id
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC
      `;
      queryParams = [userId];
    }

    const result = await db.query(queryText, queryParams);

    const bookmarks = result.rows.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      questionText: row.question_text,
      testId: row.test_id,
      questionNumber: row.question_number,
      choices: row.choices,
      correctAnswer: row.correct_answer,
      isMultipleChoice: row.is_multiple_choice,
      discussion: row.discussion,
      discussionCount: row.discussion_count,
      questionImages: row.question_images,
      answerImages: row.answer_images,
      createdAt: row.created_at,
    }));

    sendSuccess(res, bookmarks);
  } catch (error) {
    console.error('Get bookmarks error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * POST /api/bookmarks — Save a bookmark
 * Validates: Requirements 31.1
 */
router.post('/', [
  body('questionId')
    .isString()
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage('questionId is required and must be a string up to 50 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const db = req.app.locals.db;
    const userId = req.user.userId;
    const questionId = sanitizeInput(req.body.questionId);

    const result = await db.query(
      `INSERT INTO bookmarks (user_id, question_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, question_id) DO NOTHING
       RETURNING id, user_id, question_id, created_at`,
      [userId, questionId]
    );

    if (result.rows.length === 0) {
      // Duplicate — fetch the existing bookmark
      const existing = await db.query(
        'SELECT id, user_id, question_id, created_at FROM bookmarks WHERE user_id = $1 AND question_id = $2',
        [userId, questionId]
      );
      const row = existing.rows[0];
      return sendSuccess(res, {
        id: row.id,
        questionId: row.question_id,
        createdAt: row.created_at,
      }, 200);
    }

    const row = result.rows[0];
    sendSuccess(res, {
      id: row.id,
      questionId: row.question_id,
      createdAt: row.created_at,
    }, 201);
  } catch (error) {
    console.error('Create bookmark error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

/**
 * DELETE /api/bookmarks/:questionId — Remove a bookmark
 * Validates: Requirements 31.4
 */
router.delete('/:questionId', [
  param('questionId')
    .isString()
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage('questionId must be a non-empty string up to 50 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const db = req.app.locals.db;
    const userId = req.user.userId;
    const questionId = sanitizeInput(req.params.questionId);

    const result = await db.query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND question_id = $2',
      [userId, questionId]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'NOT_FOUND', 'Bookmark not found', 404);
    }

    sendSuccess(res, { deleted: true });
  } catch (error) {
    console.error('Delete bookmark error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

module.exports = router;
