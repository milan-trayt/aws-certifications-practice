/**
 * Shared client-side constants.
 * Replaces magic numbers scattered across components.
 *
 * Validates: Requirements 19.1, 19.2, 19.3
 */

// Pagination
export const QUESTIONS_PER_PAGE = 20;

// Auth token refresh
export const TOKEN_REFRESH_INTERVAL_MS = 60_000; // check every 60 s
export const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // refresh within 5 min of expiry

// Scoring
export const PASSING_SCORE_DEFAULT = 720;
export const SCALED_SCORE_MAX = 1000;
export const SCALED_SCORE_MIN = 100;

// Timer
export const TIMER_WARNING_THRESHOLD = 300; // 5 minutes in seconds
