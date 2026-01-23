const express = require('express');
const { param, query, validationResult } = require('express-validator');
const xss = require('xss');

const router = express.Router();

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
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const db = req.app.locals.db;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

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

    res.json({
      tests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTests / limit),
        totalTests,
        hasNextPage: page < Math.ceil(totalTests / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get tests error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching tests'
    });
  }
});

// Get specific test metadata
router.get('/:testId', testIdValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
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
      return res.status(404).json({
        error: 'Test not found'
      });
    }

    const test = result.rows[0];

    res.json({
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
    res.status(500).json({
      error: 'Internal server error while fetching test'
    });
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
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const testId = sanitizeInput(req.params.testId);
    const db = req.app.locals.db;

    // Check if test exists
    const testResult = await db.query(
      'SELECT id, name FROM tests WHERE id = $1',
      [testId]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Test not found'
      });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const shuffle = req.query.shuffle === 'true';

    // Get total count of questions for this test
    const countResult = await db.query(
      'SELECT COUNT(*) FROM questions WHERE test_id = $1',
      [testId]
    );
    const totalQuestions = parseInt(countResult.rows[0].count);

    // Build query with optional shuffling
    let query = `
      SELECT id, test_id, question_number, question_text, choices, correct_answer,
             is_multiple_choice, question_images, answer_images, discussion, discussion_count
      FROM questions
      WHERE test_id = $1
    `;

    if (shuffle) {
      query += ' ORDER BY RANDOM()';
    } else {
      query += ' ORDER BY question_number, id';
    }

    query += ' LIMIT $2 OFFSET $3';

    const result = await db.query(query, [testId, limit, offset]);

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

    res.json({
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
    });

  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching questions'
    });
  }
});

// Get all questions for a test (for practice modes that need all questions)
router.get('/:testId/questions/all', testIdValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const testId = sanitizeInput(req.params.testId);
    const db = req.app.locals.db;

    // Check if test exists
    const testResult = await db.query(
      'SELECT id, name, total_questions FROM tests WHERE id = $1',
      [testId]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Test not found'
      });
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

    res.json({
      test: {
        id: testResult.rows[0].id,
        name: testResult.rows[0].name,
        totalQuestions: testResult.rows[0].total_questions
      },
      questions,
      total_questions: questions.length
    });

  } catch (error) {
    console.error('Get all questions error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching all questions'
    });
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
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
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
      return res.status(404).json({
        error: 'Question not found'
      });
    }

    const question = result.rows[0];

    res.json({
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
    res.status(500).json({
      error: 'Internal server error while fetching question'
    });
  }
});

// Clear cache endpoint (for development/admin use)
router.post('/:testId/clear-cache', testIdValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // This endpoint just returns success - actual cache clearing happens on client
    res.json({
      success: true,
      message: 'Cache clear signal sent',
      testId: req.params.testId
    });

  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;