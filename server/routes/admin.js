/**
 * Admin routes
 *
 * Validates: Requirements 34.1, 34.2, 34.3
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const { archiveOldResults } = require('../utils/archivalService');

const router = express.Router();

// POST /api/admin/archive — Trigger archival of old mock test results
router.post('/archive', [
  body('olderThanMonths')
    .optional()
    .isInt({ min: 1, max: 120 })
    .withMessage('olderThanMonths must be an integer between 1 and 120')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_FAILED', 'Validation failed', 400);
    }

    const olderThanMonths = parseInt(req.body.olderThanMonths) || 12;
    const db = req.app.locals.db;

    const result = await archiveOldResults(db, olderThanMonths);

    sendSuccess(res, {
      message: `Archival complete. ${result.archivedCount} test result(s) archived.`,
      archivedCount: result.archivedCount,
      olderThanMonths,
    });
  } catch (error) {
    console.error('Archive trigger error:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error while archiving results', 500);
  }
});

module.exports = router;
