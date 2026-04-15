/**
 * Shared server-side constants.
 * Replaces magic numbers scattered across the codebase.
 *
 * Validates: Requirements 19.1, 19.2, 19.3
 */

// Cache
const CACHE_TTL_SECONDS = 600; // 10 minutes

// Rate limiting (15-minute windows)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_LOGIN = { windowMs: RATE_LIMIT_WINDOW_MS, max: 10 };
const RATE_LIMIT_REGISTER = { windowMs: RATE_LIMIT_WINDOW_MS, max: 5 };
const RATE_LIMIT_FORGOT_PASSWORD = { windowMs: RATE_LIMIT_WINDOW_MS, max: 5 };
const RATE_LIMIT_GENERAL = { windowMs: RATE_LIMIT_WINDOW_MS, max: 100 };

// Pagination
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

// Archival
const ARCHIVAL_MONTHS = 12;

// SM-2 spaced repetition
const SM2_MIN_EASE_FACTOR = 1.3;
const SM2_DEFAULT_EASE_FACTOR = 2.5;

// Scoring
const SCALED_SCORE_MAX = 1000;
const SCALED_SCORE_MIN = 100;

module.exports = {
  CACHE_TTL_SECONDS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_LOGIN,
  RATE_LIMIT_REGISTER,
  RATE_LIMIT_FORGOT_PASSWORD,
  RATE_LIMIT_GENERAL,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ARCHIVAL_MONTHS,
  SM2_MIN_EASE_FACTOR,
  SM2_DEFAULT_EASE_FACTOR,
  SCALED_SCORE_MAX,
  SCALED_SCORE_MIN,
};
