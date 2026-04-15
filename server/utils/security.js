const xss = require('xss');

/**
 * Security utility functions for XSS prevention and input sanitization
 */

// XSS filter configuration
const xssOptions = {
  whiteList: {
    // Allow only safe HTML tags for question content
    p: [],
    br: [],
    strong: [],
    em: [],
    u: [],
    code: ['class'],
    pre: ['class'],
    ol: [],
    ul: [],
    li: [],
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: []
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed'],
  allowCommentTag: false,
  css: false // Disable inline CSS
};

// Strict XSS filter for user inputs (no HTML allowed)
const strictXssOptions = {
  whiteList: {}, // No HTML tags allowed
  stripIgnoreTag: true,
  stripIgnoreTagBody: true,
  allowCommentTag: false,
  css: false
};

/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - Input string to sanitize
 * @param {boolean} allowBasicHtml - Whether to allow basic HTML tags (default: false)
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input, allowBasicHtml = false) => {
  if (typeof input !== 'string') {
    return input;
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Apply XSS filtering
  if (allowBasicHtml) {
    sanitized = xss(sanitized, xssOptions);
  } else {
    sanitized = xss(sanitized, strictXssOptions);
  }

  return sanitized;
};

/**
 * Sanitize an object's string properties
 * @param {Object} obj - Object to sanitize
 * @param {Array} allowHtmlFields - Fields that can contain basic HTML
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj, allowHtmlFields = []) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const allowHtml = allowHtmlFields.includes(key);
      sanitized[key] = sanitizeInput(value, allowHtml);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeInput(item) : item
      );
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, allowHtmlFields);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
const isValidEmail = (email) => {
  if (typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid and errors
 */
const validatePassword = (password) => {
  const errors = [];

  if (typeof password !== 'string') {
    return { isValid: false, errors: ['Password must be a string'] };
  }

  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for common weak passwords
  const commonPasswords = [
    'password', '123456', '123456789', 'qwerty', 'abc123',
    'password123', 'admin', 'letmein', 'welcome', 'monkey'
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common, please choose a stronger password');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate and sanitize question ID format
 * @param {string} questionId - Question ID to validate
 * @returns {string} Sanitized question ID
 * @throws {Error} If invalid format
 */
const validateQuestionId = (questionId) => {
  if (typeof questionId !== 'string') {
    throw new Error('Question ID must be a string');
  }

  // Allow alphanumeric characters, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9-_]+$/;
  
  if (!validPattern.test(questionId)) {
    throw new Error('Invalid question ID format');
  }

  if (questionId.length > 50) {
    throw new Error('Question ID too long');
  }

  return questionId;
};

/**
 * Validate and sanitize test ID format
 * @param {string} testId - Test ID to validate
 * @returns {string} Sanitized test ID
 * @throws {Error} If invalid format
 */
const validateTestId = (testId) => {
  if (typeof testId !== 'string') {
    throw new Error('Test ID must be a string');
  }

  // Allow alphanumeric characters, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9-_]+$/;
  
  if (!validPattern.test(testId)) {
    throw new Error('Invalid test ID format');
  }

  if (testId.length > 50) {
    throw new Error('Test ID too long');
  }

  return testId;
};

/**
 * Sanitize JSON data to prevent XSS in stored JSON
 * @param {Object} jsonData - JSON data to sanitize
 * @returns {Object} Sanitized JSON data
 */
const sanitizeJsonData = (jsonData) => {
  if (!jsonData || typeof jsonData !== 'object') {
    return jsonData;
  }

  if (Array.isArray(jsonData)) {
    return jsonData.map(item => sanitizeJsonData(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(jsonData)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeJsonData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Generate Content Security Policy header value
 * @param {string} [nonce] - Optional nonce for style-src
 * @returns {string} CSP header value
 */
const generateCSPHeader = (nonce) => {
  const styleSrc = nonce
    ? `style-src 'self' 'nonce-${nonce}'`
    : "style-src 'self'";

  return [
    "default-src 'self'",
    "script-src 'self'",
    styleSrc,
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
};

/**
 * Middleware to sanitize request body
 * @param {Array} allowHtmlFields - Fields that can contain basic HTML
 * @returns {Function} Express middleware function
 */
const sanitizeRequestBody = (allowHtmlFields = []) => {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body, allowHtmlFields);
    }
    next();
  };
};

/**
 * Middleware to sanitize query parameters
 * @returns {Function} Express middleware function
 */
const sanitizeQueryParams = () => {
  return (req, res, next) => {
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    next();
  };
};

module.exports = {
  sanitizeInput,
  sanitizeObject,
  sanitizeJsonData,
  isValidEmail,
  validatePassword,
  validateQuestionId,
  validateTestId,
  generateCSPHeader,
  sanitizeRequestBody,
  sanitizeQueryParams
};