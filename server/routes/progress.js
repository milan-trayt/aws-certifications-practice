const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const { getArchivedResults } = require('../utils/archivalService');
const { SM2_MIN_EASE_FACTOR, SM2_DEFAULT_EASE_FACTOR, DEFAULT_PAGE_SIZE, SCALED_SCORE_MIN, SCALED_SCORE_MAX } = require('../utils/constants');

const router = express.Router();

// Input sanitization function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return xss(input.trim());
};

// Validation for test and question IDs
const idValidation = [
  param('testId')
    .optional()
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format'),
  param('questionId')
    .optional()
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid question ID format')
];

// Validation for Study Mode progress
const studyProgressValidation = [
  body('testId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format'),
  body('questionId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid question ID format'),
  body('userAnswer')
    .isString()
    .isLength({ min: 1, max: 10 })
    .withMessage('User answer must be between 1 and 10 characters'),
  body('isCorrect')
    .isBoolean()
    .withMessage('isCorrect must be a boolean'),
  body('timeTaken')
    .isInt({ min: 0 })
    .withMessage('Time taken must be a non-negative integer')
];

// Validation for Mock Test results
const mockTestValidation = [
  body('testId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format'),
  body('score')
    .isInt({ min: 0 })
    .withMessage('Score must be a non-negative integer'),
  body('totalQuestions')
    .isInt({ min: 1 })
    .withMessage('Total questions must be a positive integer'),
  body('timeSpent')
    .isInt({ min: 0 })
    .withMessage('Time spent must be a non-negative integer'),
  body('answers')
    .isArray({ min: 1 })
    .withMessage('Answers must be a non-empty array'),
  body('answers.*.questionId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid question ID format in answers'),
  body('answers.*.userAnswer')
    .isString()
    .isLength({ min: 1, max: 10 })
    .withMessage('User answer must be between 1 and 10 characters'),
  body('answers.*.isCorrect')
    .isBoolean()
    .withMessage('isCorrect must be a boolean'),
  body('answers.*.timeTaken')
    .isInt({ min: 0 })
    .withMessage('Time taken must be a non-negative integer')
];

// Save Study Mode progress for a single question
router.post('/study', studyProgressValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const { testId, questionId, userAnswer, isCorrect, timeTaken } = req.body;
    const userId = req.user.userId;

    // Sanitize inputs
    const sanitizedTestId = sanitizeInput(testId);
    const sanitizedQuestionId = sanitizeInput(questionId);
    const sanitizedUserAnswer = sanitizeInput(userAnswer);

    const db = req.app.locals.db;

    // Verify test and question exist
    const questionCheck = await db.query(
      'SELECT id FROM questions WHERE id = $1 AND test_id = $2',
      [sanitizedQuestionId, sanitizedTestId]
    );

    if (questionCheck.rows.length === 0) {
      return sendError(res, 'QUESTION_NOT_FOUND', 'Question not found in the specified test', 404);
    }

    // Insert or update progress
    const result = await db.query(
      `INSERT INTO user_progress (user_id, test_id, question_id, user_answer, is_correct, time_taken, session_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'study')
       ON CONFLICT (user_id, question_id, session_type)
       DO UPDATE SET
         user_answer = EXCLUDED.user_answer,
         is_correct = EXCLUDED.is_correct,
         time_taken = EXCLUDED.time_taken,
         created_at = CURRENT_TIMESTAMP
       RETURNING id, created_at`,
      [userId, sanitizedTestId, sanitizedQuestionId, sanitizedUserAnswer, isCorrect, timeTaken]
    );

    sendSuccess(res, {
      message: 'Study progress saved successfully',
      progress: {
        id: result.rows[0].id,
        userId,
        testId: sanitizedTestId,
        questionId: sanitizedQuestionId,
        userAnswer: sanitizedUserAnswer,
        isCorrect,
        timeTaken,
        sessionType: 'study',
        createdAt: result.rows[0].created_at
      }
    });

  } catch (error) {
    console.error('Save study progress error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while saving study progress', 500);
  }
});

// Get Study Mode progress for a specific test
router.get('/study/:testId', idValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const userId = req.user.userId;

    const db = req.app.locals.db;

    // Verify test exists
    const testCheck = await db.query(
      'SELECT id, name FROM tests WHERE id = $1',
      [testId]
    );

    if (testCheck.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    // Get user's study progress for this test
    const result = await db.query(
      `SELECT up.question_id, up.user_answer, up.is_correct, up.time_taken, up.created_at,
              q.question_text, q.correct_answer
       FROM user_progress up
       JOIN questions q ON up.question_id = q.id
       WHERE up.user_id = $1 AND up.test_id = $2 AND up.session_type = 'study' AND up.deleted_at IS NULL
       ORDER BY up.created_at DESC`,
      [userId, testId]
    );

    const progress = result.rows.map(row => ({
      questionId: row.question_id,
      userAnswer: row.user_answer,
      isCorrect: row.is_correct,
      timeTaken: row.time_taken,
      createdAt: row.created_at,
      questionText: row.question_text,
      correctAnswer: row.correct_answer
    }));

    // Calculate statistics
    const totalStudied = progress.length;
    const correctAnswers = progress.filter(p => p.isCorrect).length;
    const accuracy = totalStudied > 0 ? (correctAnswers / totalStudied) * 100 : 0;
    const totalTime = progress.reduce((sum, p) => sum + p.timeTaken, 0);
    const averageTime = totalStudied > 0 ? totalTime / totalStudied : 0;

    sendSuccess(res, {
      test: {
        id: testCheck.rows[0].id,
        name: testCheck.rows[0].name
      },
      progress,
      statistics: {
        totalStudied,
        correctAnswers,
        accuracy: Math.round(accuracy * 100) / 100,
        totalTime,
        averageTime: Math.round(averageTime * 100) / 100
      }
    });

  } catch (error) {
    console.error('Get study progress error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching study progress', 500);
  }
});

// Save Mock Test results
router.post('/mock-test', mockTestValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const { testId, score, totalQuestions, timeSpent, answers } = req.body;
    const userId = req.user.userId;

    // Sanitize inputs
    const sanitizedTestId = sanitizeInput(testId);

    const db = req.app.locals.db;

    // Verify test exists
    const testCheck = await db.query(
      'SELECT id FROM tests WHERE id = $1',
      [sanitizedTestId]
    );

    if (testCheck.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    // Begin transaction
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');

      // Insert mock test result
      const mockTestResult = await client.query(
        `INSERT INTO mock_test_results (user_id, test_id, score, total_questions, time_spent)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, completed_at`,
        [userId, sanitizedTestId, score, totalQuestions, timeSpent]
      );

      const mockTestId = mockTestResult.rows[0].id;

      // Insert individual answers
      for (const answer of answers) {
        const sanitizedQuestionId = sanitizeInput(answer.questionId);
        const sanitizedUserAnswer = sanitizeInput(answer.userAnswer);

        await client.query(
          `INSERT INTO mock_test_answers (mock_test_result_id, question_id, user_answer, is_correct, time_taken)
           VALUES ($1, $2, $3, $4, $5)`,
          [mockTestId, sanitizedQuestionId, sanitizedUserAnswer, answer.isCorrect, answer.timeTaken]
        );
      }

      await client.query('COMMIT');

      sendSuccess(res, {
        message: 'Mock test results saved successfully',
        mockTest: {
          id: mockTestId,
          userId,
          testId: sanitizedTestId,
          score,
          totalQuestions,
          timeSpent,
          completedAt: mockTestResult.rows[0].completed_at,
          answersCount: answers.length
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Save mock test results error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while saving mock test results', 500);
  }
});

// Get Mock Test history
router.get('/mock-tests', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('testId')
    .optional()
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format')
], async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * limit;
    const testIdFilter = req.query.testId ? sanitizeInput(req.query.testId) : null;

    const db = req.app.locals.db;

    // Build query with optional test filter
    let whereClause = 'WHERE mtr.user_id = $1 AND mtr.deleted_at IS NULL';
    let queryParams = [userId];

    if (testIdFilter) {
      whereClause += ' AND mtr.test_id = $2';
      queryParams.push(testIdFilter);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM mock_test_results mtr 
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const totalResults = parseInt(countResult.rows[0].count);

    // Get mock test results with pagination
    const query = `
      SELECT mtr.id, mtr.test_id, mtr.score, mtr.total_questions, mtr.time_spent, mtr.completed_at,
             t.name as test_name, t.passing_score
      FROM mock_test_results mtr
      JOIN tests t ON mtr.test_id = t.id
      ${whereClause}
      ORDER BY mtr.completed_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await db.query(query, [...queryParams, limit, offset]);

    const mockTests = result.rows.map(row => ({
      id: row.id,
      testId: row.test_id,
      testName: row.test_name,
      score: row.score,
      totalQuestions: row.total_questions,
      timeSpent: row.time_spent,
      completedAt: row.completed_at,
      passingScore: row.passing_score,
      passed: Math.round(SCALED_SCORE_MIN + (row.score / row.total_questions) * (SCALED_SCORE_MAX - SCALED_SCORE_MIN)) >= row.passing_score,
      percentage: Math.round((row.score / row.total_questions) * 100),
      scaledScore: Math.round(SCALED_SCORE_MIN + (row.score / row.total_questions) * (SCALED_SCORE_MAX - SCALED_SCORE_MIN))
    }));

    sendSuccess(res, {
      mockTests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalResults / limit),
        totalResults,
        hasNextPage: page < Math.ceil(totalResults / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get mock test history error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching mock test history', 500);
  }
});

// Get detailed Mock Test result
router.get('/mock-tests/:mockTestId', [
  param('mockTestId')
    .isInt({ min: 1 })
    .withMessage('Invalid mock test ID')
], async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const mockTestId = parseInt(req.params.mockTestId);
    const userId = req.user.userId;

    const db = req.app.locals.db;

    // Get mock test result
    const mockTestResult = await db.query(
      `SELECT mtr.id, mtr.test_id, mtr.score, mtr.total_questions, mtr.time_spent, mtr.completed_at,
              t.name as test_name, t.passing_score
       FROM mock_test_results mtr
       JOIN tests t ON mtr.test_id = t.id
       WHERE mtr.id = $1 AND mtr.user_id = $2 AND mtr.deleted_at IS NULL`,
      [mockTestId, userId]
    );

    if (mockTestResult.rows.length === 0) {
      return sendError(res, 'MOCK_TEST_NOT_FOUND', 'Mock test result not found', 404);
    }

    const mockTest = mockTestResult.rows[0];

    // Get individual answers
    const answersResult = await db.query(
      `SELECT mta.question_id, mta.user_answer, mta.is_correct, mta.time_taken,
              q.question_text, q.correct_answer, q.choices, q.discussion, q.discussion_count,
              q.question_images, q.answer_images
       FROM mock_test_answers mta
       JOIN questions q ON mta.question_id = q.id
       WHERE mta.mock_test_result_id = $1
       ORDER BY q.question_number`,
      [mockTestId]
    );

    const answers = answersResult.rows.map(row => ({
      questionId: row.question_id,
      questionText: row.question_text,
      choices: row.choices,
      userAnswer: row.user_answer,
      correctAnswer: row.correct_answer,
      isCorrect: row.is_correct,
      timeTaken: row.time_taken,
      discussion: row.discussion,
      discussionCount: row.discussion_count,
      questionImages: row.question_images,
      answerImages: row.answer_images
    }));

    sendSuccess(res, {
      mockTest: {
        id: mockTest.id,
        testId: mockTest.test_id,
        testName: mockTest.test_name,
        score: mockTest.score,
        totalQuestions: mockTest.total_questions,
        timeSpent: mockTest.time_spent,
        completedAt: mockTest.completed_at,
        passingScore: mockTest.passing_score,
        passed: Math.round(SCALED_SCORE_MIN + (mockTest.score / mockTest.total_questions) * (SCALED_SCORE_MAX - SCALED_SCORE_MIN)) >= mockTest.passing_score,
        percentage: Math.round((mockTest.score / mockTest.total_questions) * 100),
        scaledScore: Math.round(SCALED_SCORE_MIN + (mockTest.score / mockTest.total_questions) * (SCALED_SCORE_MAX - SCALED_SCORE_MIN))
      },
      answers
    });

  } catch (error) {
    console.error('Get mock test details error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching mock test details', 500);
  }
});

// Get user statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    const db = req.app.locals.db;

    // Get Study Mode statistics
    const studyStats = await db.query(
      `SELECT 
         COUNT(*) as total_studied,
         COUNT(CASE WHEN is_correct THEN 1 END) as correct_answers,
         AVG(time_taken) as avg_time,
         test_id,
         t.name as test_name
       FROM user_progress up
       JOIN tests t ON up.test_id = t.id
       WHERE up.user_id = $1 AND up.session_type = 'study' AND up.deleted_at IS NULL
       GROUP BY test_id, t.name`,
      [userId]
    );

    // Get Mock Test statistics
    const mockTestStats = await db.query(
      `SELECT 
         COUNT(*) as total_tests,
         AVG(score) as avg_score,
         AVG(total_questions) as avg_total_questions,
         AVG(time_spent) as avg_time_spent,
         test_id,
         t.name as test_name,
         t.passing_score
       FROM mock_test_results mtr
       JOIN tests t ON mtr.test_id = t.id
       WHERE mtr.user_id = $1 AND mtr.deleted_at IS NULL
       GROUP BY test_id, t.name, t.passing_score`,
      [userId]
    );

    // Overall statistics
    const overallStudy = await db.query(
      `SELECT 
         COUNT(*) as total_studied,
         COUNT(CASE WHEN is_correct THEN 1 END) as correct_answers,
         AVG(time_taken) as avg_time
       FROM user_progress
       WHERE user_id = $1 AND session_type = 'study' AND deleted_at IS NULL`,
      [userId]
    );

    const overallMockTests = await db.query(
      `SELECT 
         COUNT(*) as total_tests,
         AVG(score) as avg_score,
         AVG(total_questions) as avg_total_questions,
         AVG(time_spent) as avg_time_spent
       FROM mock_test_results
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    const studyByTest = studyStats.rows.map(row => ({
      testId: row.test_id,
      testName: row.test_name,
      totalStudied: parseInt(row.total_studied),
      correctAnswers: parseInt(row.correct_answers),
      accuracy: row.total_studied > 0 ? Math.round((row.correct_answers / row.total_studied) * 100) : 0,
      averageTime: Math.round(parseFloat(row.avg_time) || 0)
    }));

    const mockTestsByTest = mockTestStats.rows.map(row => ({
      testId: row.test_id,
      testName: row.test_name,
      totalTests: parseInt(row.total_tests),
      averageScore: Math.round(parseFloat(row.avg_score) || 0),
      averagePercentage: Math.round((parseFloat(row.avg_score) / parseFloat(row.avg_total_questions)) * 100) || 0,
      averageTimeSpent: Math.round(parseFloat(row.avg_time_spent) || 0),
      passingScore: row.passing_score
    }));

    const overall = {
      study: {
        totalStudied: parseInt(overallStudy.rows[0].total_studied) || 0,
        correctAnswers: parseInt(overallStudy.rows[0].correct_answers) || 0,
        accuracy: overallStudy.rows[0].total_studied > 0 ? 
          Math.round((overallStudy.rows[0].correct_answers / overallStudy.rows[0].total_studied) * 100) : 0,
        averageTime: Math.round(parseFloat(overallStudy.rows[0].avg_time) || 0)
      },
      mockTests: {
        totalTests: parseInt(overallMockTests.rows[0].total_tests) || 0,
        averageScore: Math.round(parseFloat(overallMockTests.rows[0].avg_score) || 0),
        averagePercentage: overallMockTests.rows[0].avg_total_questions > 0 ?
          Math.round((parseFloat(overallMockTests.rows[0].avg_score) / parseFloat(overallMockTests.rows[0].avg_total_questions)) * 100) : 0,
        averageTimeSpent: Math.round(parseFloat(overallMockTests.rows[0].avg_time_spent) || 0)
      }
    };

    sendSuccess(res, {
      overall,
      studyByTest,
      mockTestsByTest
    });

  } catch (error) {
    console.error('Get user statistics error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching user statistics', 500);
  }
});

// Validation for spaced repetition update
const spacedRepetitionValidation = [
  body('testId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format'),
  body('questionId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid question ID format'),
  body('isCorrect')
    .isBoolean()
    .withMessage('isCorrect must be a boolean'),
  body('quality')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Quality must be an integer between 1 and 5')
];

// GET /api/progress/spaced-repetition/:testId — Get questions for spaced repetition practice
router.get('/spaced-repetition/:testId', [
  param('testId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const userId = req.user.userId;
    const db = req.app.locals.db;

    // Verify test exists
    const testCheck = await db.query(
      'SELECT id, name FROM tests WHERE id = $1',
      [testId]
    );

    if (testCheck.rows.length === 0) {
      return sendError(res, 'TEST_NOT_FOUND', 'Test not found', 404);
    }

    // Get all questions for this test, LEFT JOIN with user_progress to include never-reviewed questions
    // Order by next_review_at ASC NULLS FIRST (never-reviewed first, then soonest due)
    const result = await db.query(
      `SELECT q.id AS question_id, q.question_number, q.question_text, q.choices,
              q.correct_answer, q.is_multiple_choice, q.discussion, q.discussion_count,
              COALESCE(up.correct_count, 0) AS correct_count,
              COALESCE(up.incorrect_count, 0) AS incorrect_count,
              COALESCE(up.ease_factor, 2.5) AS ease_factor,
              COALESCE(up.interval_days, 0) AS interval_days,
              COALESCE(up.repetition_count, 0) AS repetition_count,
              up.next_review_at,
              COALESCE(up.mastery_level, 'new') AS mastery_level
       FROM questions q
       LEFT JOIN user_progress up
         ON up.question_id = q.id AND up.user_id = $1 AND up.session_type = 'study' AND up.deleted_at IS NULL
       WHERE q.test_id = $2
       ORDER BY up.next_review_at ASC NULLS FIRST, q.question_number ASC`,
      [userId, testId]
    );

    const questions = result.rows.map(row => ({
      questionId: row.question_id,
      questionNumber: row.question_number,
      questionText: row.question_text,
      choices: row.choices,
      correctAnswer: row.correct_answer,
      isMultipleChoice: row.is_multiple_choice,
      correctCount: row.correct_count,
      incorrectCount: row.incorrect_count,
      easeFactor: parseFloat(row.ease_factor),
      intervalDays: row.interval_days,
      repetitionCount: row.repetition_count,
      nextReviewAt: row.next_review_at,
      masteryLevel: row.mastery_level,
      discussion: row.discussion,
      discussionCount: row.discussion_count
    }));

    sendSuccess(res, {
      test: {
        id: testCheck.rows[0].id,
        name: testCheck.rows[0].name
      },
      questions
    });

  } catch (error) {
    console.error('Get spaced repetition questions error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching spaced repetition questions', 500);
  }
});

// POST /api/progress/spaced-repetition — Update SR fields after answering
router.post('/spaced-repetition', spacedRepetitionValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const { testId, questionId, isCorrect } = req.body;
    // Default quality: 5 for correct, 1 for incorrect
    const quality = req.body.quality != null ? parseInt(req.body.quality) : (isCorrect ? 5 : 1);
    const userId = req.user.userId;

    const sanitizedTestId = sanitizeInput(testId);
    const sanitizedQuestionId = sanitizeInput(questionId);

    const db = req.app.locals.db;

    // Verify question exists in the test
    const questionCheck = await db.query(
      'SELECT id FROM questions WHERE id = $1 AND test_id = $2',
      [sanitizedQuestionId, sanitizedTestId]
    );

    if (questionCheck.rows.length === 0) {
      return sendError(res, 'QUESTION_NOT_FOUND', 'Question not found in the specified test', 404);
    }

    // Get current SR fields (if any)
    const current = await db.query(
      `SELECT ease_factor, interval_days, repetition_count, correct_count, incorrect_count
       FROM user_progress
       WHERE user_id = $1 AND question_id = $2 AND session_type = 'study' AND deleted_at IS NULL`,
      [userId, sanitizedQuestionId]
    );

    let easeFactor, intervalDays, repetitionCount, correctCount, incorrectCount, masteryLevel;

    if (current.rows.length > 0) {
      const row = current.rows[0];
      easeFactor = parseFloat(row.ease_factor);
      intervalDays = row.interval_days;
      repetitionCount = row.repetition_count;
      correctCount = row.correct_count;
      incorrectCount = row.incorrect_count;
    } else {
      easeFactor = SM2_DEFAULT_EASE_FACTOR;
      intervalDays = 0;
      repetitionCount = 0;
      correctCount = 0;
      incorrectCount = 0;
    }

    // Apply SM-2 algorithm variant
    if (isCorrect) {
      repetitionCount += 1;
      correctCount += 1;
      if (repetitionCount === 1) {
        intervalDays = 1;
      } else if (repetitionCount === 2) {
        intervalDays = 6;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor);
      }
      easeFactor = Math.max(SM2_MIN_EASE_FACTOR, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      masteryLevel = repetitionCount < 4 ? 'reviewing' : 'mastered';
    } else {
      repetitionCount = 0;
      intervalDays = 1;
      incorrectCount += 1;
      easeFactor = Math.max(SM2_MIN_EASE_FACTOR, easeFactor - 0.2);
      masteryLevel = 'learning';
    }

    // Calculate next_review_at
    const now = new Date();
    const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    // Upsert user_progress with SR fields
    const result = await db.query(
      `INSERT INTO user_progress (user_id, test_id, question_id, is_correct, session_type,
         correct_count, incorrect_count, ease_factor, interval_days, repetition_count, next_review_at, mastery_level)
       VALUES ($1, $2, $3, $4, 'study', $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, question_id, session_type)
       DO UPDATE SET
         is_correct = EXCLUDED.is_correct,
         correct_count = EXCLUDED.correct_count,
         incorrect_count = EXCLUDED.incorrect_count,
         ease_factor = EXCLUDED.ease_factor,
         interval_days = EXCLUDED.interval_days,
         repetition_count = EXCLUDED.repetition_count,
         next_review_at = EXCLUDED.next_review_at,
         mastery_level = EXCLUDED.mastery_level,
         created_at = CURRENT_TIMESTAMP
       RETURNING id, created_at`,
      [userId, sanitizedTestId, sanitizedQuestionId, isCorrect,
       correctCount, incorrectCount, easeFactor, intervalDays, repetitionCount, nextReviewAt, masteryLevel]
    );

    sendSuccess(res, {
      message: 'Spaced repetition progress updated',
      progress: {
        id: result.rows[0].id,
        questionId: sanitizedQuestionId,
        testId: sanitizedTestId,
        isCorrect,
        quality,
        correctCount,
        incorrectCount,
        easeFactor: Math.round(easeFactor * 100) / 100,
        intervalDays,
        repetitionCount,
        nextReviewAt: nextReviewAt.toISOString(),
        masteryLevel,
        updatedAt: result.rows[0].created_at
      }
    });

  } catch (error) {
    console.error('Update spaced repetition error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while updating spaced repetition progress', 500);
  }
});

// GET /api/progress/archived — Retrieve archived mock test results for the authenticated user
router.get('/archived', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;

    const db = req.app.locals.db;
    const data = await getArchivedResults(db, userId, page, limit);

    sendSuccess(res, data);
  } catch (error) {
    console.error('Get archived results error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while fetching archived results', 500);
  }
});

// DELETE /api/progress/study/:testId — Reset (soft-delete) all study progress for a test
router.delete('/study/:testId', [
  param('testId')
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid test ID format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const testId = sanitizeInput(req.params.testId);
    const userId = req.user.userId;
    const db = req.app.locals.db;

    const result = await db.query(
      `UPDATE user_progress SET deleted_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND test_id = $2 AND session_type = 'study' AND deleted_at IS NULL`,
      [userId, testId]
    );

    sendSuccess(res, {
      message: 'Study progress reset successfully',
      deletedCount: result.rowCount,
    });
  } catch (error) {
    console.error('Reset study progress error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while resetting study progress', 500);
  }
});

module.exports = router;