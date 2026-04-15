const express = require('express');
const { param, query, validationResult } = require('express-validator');
const xss = require('xss');
const cacheService = require('../utils/cacheService');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const { CACHE_TTL_SECONDS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../utils/constants');

const router = express.Router();

const CACHE_TTL = CACHE_TTL_SECONDS;

// Input sanitization function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return xss(input.trim());
};

// Validation for test ID parameter
const testIdValidation = [
  param('testId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format')
];

// Validation for pagination parameters
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Get all available tests
router.get('/', paginationValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const db = req.app.locals.db;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * limit;

    // Check cache first (keyed by page and limit for pagination)
    const cacheKey = `tests:list:p${page}:l${limit}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    // Get total count
    const countResult = await db.query('SELECT COUNT(*) FROM tests');
    const totalTests = parseInt(countResult.rows[0].count);

    // Get tests with pagination
    const result = await db.query(
      `SELECT id, name, description, category, difficulty, total_questions, time_limit, passing_score, created_at
       FROM tests
       ORDER BY name
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const tests = result.rows.map(test => ({
      id: test.id,
      name: test.name,
      description: test.description,
      category: test.category,
      difficulty: test.difficulty,
      totalQuestions: test.total_questions,
      timeLimit: test.time_limit,
      passingScore: test.passing_score,
      createdAt: test.created_at
    }));

    const responseData = {
      tests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTests / limit),
        totalTests,
        hasNextPage: page < Math.ceil(totalTests / limit),
        hasPrevPage: page > 1
      }
    };

    // Cache the response
    await cacheService.set(cacheKey, responseData, CACHE_TTL);

    sendSuccess(res, responseData);

  } catch (error) {
    console.error('Get tests error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching tests', 500);
  }
});

// Get specific test metadata
router.get('/:testId', testIdValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const db = req.app.locals.db;

    const result = await db.query(
      `SELECT id, name, description, category, difficulty, total_questions, time_limit, passing_score, created_at
       FROM tests
       WHERE id = $1`,
      [testId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    const test = result.rows[0];

    sendSuccess(res, {
      test: {
        id: test.id,
        name: test.name,
        description: test.description,
        category: test.category,
        difficulty: test.difficulty,
        totalQuestions: test.total_questions,
        timeLimit: test.time_limit,
        passingScore: test.passing_score,
        createdAt: test.created_at
      }
    });

  } catch (error) {
    console.error('Get test error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching test', 500);
  }
});

// Get questions for a specific test
router.get('/:testId/questions', [
  ...testIdValidation,
  ...paginationValidation,
  query('shuffle')
    .optional()
    .isBoolean()
    .withMessage('Shuffle must be a boolean value')
], async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const db = req.app.locals.db;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const shuffle = req.query.shuffle === 'true';

    // Only cache non-shuffled requests (shuffled results are random each time)
    const cacheKey = !shuffle ? `tests:${testId}:questions:p${page}:l${limit}` : null;
    if (cacheKey) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return sendSuccess(res, cached);
      }
    }

    // Check if test exists
    const testResult = await db.query(
      'SELECT id, name FROM tests WHERE id = $1',
      [testId]
    );

    if (testResult.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    // Get total count of questions for this test
    const countResult = await db.query(
      'SELECT COUNT(*) FROM questions WHERE test_id = $1',
      [testId]
    );
    const totalQuestions = parseInt(countResult.rows[0].count);

    // Build query with optional shuffling
    let queryStr = `
      SELECT id, test_id, question_number, question_text, choices, correct_answer,
             is_multiple_choice, question_images, answer_images, discussion, discussion_count
      FROM questions
      WHERE test_id = $1
    `;

    if (shuffle) {
      queryStr += ' ORDER BY RANDOM()';
    } else {
      queryStr += ' ORDER BY question_number, id';
    }

    queryStr += ' LIMIT $2 OFFSET $3';

    const result = await db.query(queryStr, [testId, limit, offset]);

    const questions = result.rows.map(question => ({
      question_id: question.id,
      question_number: question.question_number,
      question_text: question.question_text,
      choices: question.choices,
      correct_answer: question.correct_answer,
      is_multiple_choice: question.is_multiple_choice,
      question_images: question.question_images,
      answer_images: question.answer_images,
      discussion: question.discussion,
      discussion_count: question.discussion_count
    }));

    const responseData = {
      test: {
        id: testResult.rows[0].id,
        name: testResult.rows[0].name
      },
      questions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalQuestions / limit),
        totalQuestions,
        hasNextPage: page < Math.ceil(totalQuestions / limit),
        hasPrevPage: page > 1
      }
    };

    // Cache non-shuffled responses
    if (cacheKey) {
      await cacheService.set(cacheKey, responseData, CACHE_TTL);
    }

    sendSuccess(res, responseData);

  } catch (error) {
    console.error('Get questions error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching questions', 500);
  }
});

// Get all questions for a test (for practice modes that need all questions)
router.get('/:testId/questions/all', testIdValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const db = req.app.locals.db;

    // Check cache first
    const cacheKey = `tests:${testId}:questions:all`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    // Check if test exists
    const testResult = await db.query(
      'SELECT id, name, total_questions FROM tests WHERE id = $1',
      [testId]
    );

    if (testResult.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    // Get all questions for this test
    const result = await db.query(
      `SELECT id, test_id, question_number, question_text, choices, correct_answer,
              is_multiple_choice, question_images, answer_images, discussion, discussion_count
       FROM questions
       WHERE test_id = $1
       ORDER BY question_number, id`,
      [testId]
    );

    const questions = result.rows.map(question => ({
      question_id: question.id,
      question_number: question.question_number,
      question_text: question.question_text,
      choices: question.choices,
      correct_answer: question.correct_answer,
      is_multiple_choice: question.is_multiple_choice,
      question_images: question.question_images,
      answer_images: question.answer_images,
      discussion: question.discussion,
      discussion_count: question.discussion_count
    }));

    const responseData = {
      test: {
        id: testResult.rows[0].id,
        name: testResult.rows[0].name,
        totalQuestions: testResult.rows[0].total_questions
      },
      questions,
      total_questions: questions.length
    };

    // Cache the response
    await cacheService.set(cacheKey, responseData, CACHE_TTL);

    sendSuccess(res, responseData);

  } catch (error) {
    console.error('Get all questions error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching all questions', 500);
  }
});

// Search questions for a specific test using full-text search
// Validates: Requirements 33.2
router.get('/:testId/questions/search', [
  ...testIdValidation,
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ max: 200 })
    .withMessage('Search query must not exceed 200 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const searchQuery = sanitizeInput(req.query.q);
    const db = req.app.locals.db;

    // Check if test exists
    const testResult = await db.query(
      'SELECT id, name FROM tests WHERE id = $1',
      [testId]
    );

    if (testResult.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    // Full-text search using ts_rank for relevance ordering
    const result = await db.query(
      `SELECT q.id, q.test_id, q.question_number, q.question_text, q.choices,
              q.correct_answer, q.is_multiple_choice, q.question_images,
              q.answer_images, q.discussion, q.discussion_count,
              ts_rank(q.search_vector, plainto_tsquery('english', $2)) AS rank
       FROM questions q
       WHERE q.test_id = $1
         AND q.search_vector @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC, q.question_number`,
      [testId, searchQuery]
    );

    const questions = result.rows.map(question => ({
      question_id: question.id,
      question_number: question.question_number,
      question_text: question.question_text,
      choices: question.choices,
      correct_answer: question.correct_answer,
      is_multiple_choice: question.is_multiple_choice,
      question_images: question.question_images,
      answer_images: question.answer_images,
      discussion: question.discussion,
      discussion_count: question.discussion_count,
      rank: parseFloat(question.rank)
    }));

    sendSuccess(res, {
      test: {
        id: testResult.rows[0].id,
        name: testResult.rows[0].name
      },
      questions,
      totalResults: questions.length,
      searchQuery
    });

  } catch (error) {
    console.error('Search questions error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while searching questions', 500);
  }
});

// Get a specific question
router.get('/:testId/questions/:questionId', [
  ...testIdValidation,
  param('questionId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid question ID format')
], async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const questionId = sanitizeInput(req.params.questionId);
    const db = req.app.locals.db;

    const result = await db.query(
      `SELECT q.id, q.test_id, q.question_number, q.question_text, q.choices, q.correct_answer,
              q.is_multiple_choice, q.question_images, q.answer_images, q.discussion, q.discussion_count,
              t.name as test_name
       FROM questions q
       JOIN tests t ON q.test_id = t.id
       WHERE q.test_id = $1 AND q.id = $2`,
      [testId, questionId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'QUESTION_NOT_FOUND', 'Question not found', 404);
    }

    const question = result.rows[0];

    sendSuccess(res, {
      question: {
        question_id: question.id,
        question_number: question.question_number,
        question_text: question.question_text,
        choices: question.choices,
        correct_answer: question.correct_answer,
        is_multiple_choice: question.is_multiple_choice,
        question_images: question.question_images,
        answer_images: question.answer_images,
        discussion: question.discussion,
        discussion_count: question.discussion_count
      },
      test: {
        id: question.test_id,
        name: question.test_name
      }
    });

  } catch (error) {
    console.error('Get question error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching question', 500);
  }
});

// Clear cache endpoint (for development/admin use)
// Validates: Requirements 13.3, 13.4
router.post('/:testId/clear-cache', testIdValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);

    // Invalidate test list cache (all paginated variants)
    await cacheService.delPattern('tests:list:*');
    // Invalidate questions cache for this specific test
    await cacheService.delPattern(`tests:${testId}:*`);

    sendSuccess(res, {
      success: true,
      message: 'Cache invalidated',
      testId
    });

  } catch (error) {
    console.error('Clear cache error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

// Clear all test-related cache (for development/admin use)
// Validates: Requirements 13.3, 13.4
router.post('/clear-cache', async (req, res) => {
  try {
    // Invalidate all test-related cache entries
    await cacheService.delPattern('tests:*');

    sendSuccess(res, {
      success: true,
      message: 'All test cache invalidated'
    });

  } catch (error) {
    console.error('Clear all cache error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
});

module.exports = router;