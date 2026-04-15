const crypto = require('crypto');

/**
 * Middleware that generates a unique CSP nonce per request.
 * The nonce is stored on res.locals.cspNonce so it can be used
 * by Helmet's CSP directives and any templates/responses that
 * need to reference it for inline styles.
 */
function cspNonceMiddleware(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

module.exports = cspNonceMiddleware;
