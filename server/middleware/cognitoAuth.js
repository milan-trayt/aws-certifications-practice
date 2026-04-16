const { CognitoJwtVerifier } = require('aws-jwt-verify');

/**
 * Cognito JWT Authentication Middleware
 * Validates Cognito access tokens and attaches local user info to req.user
 *
 * Validates: Requirements 1.2, 1.3, 1.4
 */

// Lazily initialized verifier (created on first use)
let verifier = null;

function getVerifier() {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;

    if (!userPoolId || !clientId) {
      throw new Error(
        'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID environment variables are required'
      );
    }

    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'access',
      clientId,
    });
  }
  return verifier;
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(req) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return token || null;
}

/**
 * Verify token and look up local user.
 * Returns { user, error } — one of them will be set.
 */
async function verifyAndLookupUser(token, db, req) {
  let payload;
  try {
    payload = await getVerifier().verify(token);
  } catch (err) {
    const code = err.message && err.message.includes('expired')
      ? 'TOKEN_EXPIRED'
      : 'INVALID_TOKEN';
    return { user: null, error: { code, message: getErrorMessage(code) } };
  }

  const cognitoSub = payload.sub;
  const email = payload.email || payload.username || null;
  // Also check headers sent by the client (from ID token)
  const headerEmail = req?.headers?.['x-user-email'] || null;
  const headerFirstName = req?.headers?.['x-user-given-name'] || null;
  const headerLastName = req?.headers?.['x-user-family-name'] || null;

  try {
    // First try lookup by cognito_sub
    let result = await db.query(
      'SELECT id, email, cognito_sub FROM users WHERE cognito_sub = $1 AND deleted_at IS NULL',
      [cognitoSub]
    );

    // If not found by cognito_sub but we have an email, try linking by email
    // This handles users who existed before Cognito migration
    if (result.rows.length === 0 && email) {
      const emailResult = await db.query(
        'SELECT id, email, cognito_sub FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );

      if (emailResult.rows.length > 0 && !emailResult.rows[0].cognito_sub) {
        // Auto-link: set cognito_sub for this existing user
        await db.query(
          'UPDATE users SET cognito_sub = $1 WHERE id = $2',
          [cognitoSub, emailResult.rows[0].id]
        );
        console.log(`Auto-linked user ${email} to cognito_sub ${cognitoSub}`);
        result = emailResult;
      } else if (emailResult.rows.length === 0) {
        // No user exists — use email from X-User-Email header (sent by client from ID token)
        const realEmail = headerEmail || email;

        if (!realEmail || realEmail === cognitoSub) {
          return {
            user: null,
            error: { code: 'INVALID_TOKEN', message: 'Could not determine user email.' },
          };
        }

        const insertResult = await db.query(
          `INSERT INTO users (email, cognito_sub, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, cognito_sub`,
          [realEmail, cognitoSub, 'cognito-managed', headerFirstName || null, headerLastName || null]
        );
        console.log(`Auto-created user ${realEmail} with cognito_sub ${cognitoSub}`);
        result = insertResult;
      }
    }

    if (result.rows.length === 0) {
      return {
        user: null,
        error: { code: 'INVALID_TOKEN', message: 'User not found for this token.' },
      };
    }

    const row = result.rows[0];
    return {
      user: {
        cognitoSub,
        email: email || row.email,
        userId: row.id,
      },
      error: null,
    };
  } catch (dbErr) {
    console.error('Cognito auth DB lookup error:', dbErr.message);
    return {
      user: null,
      error: { code: 'INVALID_TOKEN', message: 'Authentication failed.' },
    };
  }
}

function getErrorMessage(code) {
  switch (code) {
    case 'TOKEN_EXPIRED':
      return 'Token expired. Please login again.';
    case 'INVALID_TOKEN':
      return 'Invalid token. Please login again.';
    case 'NO_TOKEN':
      return 'Access denied. No token provided.';
    default:
      return 'Authentication failed.';
  }
}

/**
 * Required Cognito auth middleware.
 * Verifies the Cognito access token, looks up the local user by cognito_sub,
 * and attaches req.user = { cognitoSub, email, userId }.
 * Returns HTTP 401 with error codes on failure.
 */
const cognitoAuthMiddleware = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Access denied. No token provided.',
      code: 'NO_TOKEN',
    });
  }

  const db = req.app.locals.db;
  const { user, error } = await verifyAndLookupUser(token, db, req);

  if (error) {
    return res.status(401).json({
      error: error.message,
      code: error.code,
    });
  }

  req.user = user;
  next();
};

/**
 * Optional Cognito auth middleware.
 * Same as cognitoAuthMiddleware but does not fail when no token is present.
 * Sets req.user to null if no token or verification fails.
 */
const optionalCognitoAuth = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  const db = req.app.locals.db;
  const { user } = await verifyAndLookupUser(token, db, req);

  req.user = user || null;
  next();
};

// Exported for testing — allows injecting a mock verifier
function _resetVerifier() {
  verifier = null;
}

function _setVerifier(v) {
  verifier = v;
}

module.exports = {
  cognitoAuthMiddleware,
  optionalCognitoAuth,
  _resetVerifier,
  _setVerifier,
};
