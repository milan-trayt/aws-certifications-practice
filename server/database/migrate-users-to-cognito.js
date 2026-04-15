#!/usr/bin/env node

/**
 * User Migration Script: JWT to Cognito
 *
 * Reads existing user records from the database and creates corresponding
 * Cognito accounts via the AdminCreateUser API. Each migrated user is
 * set to require a password reset on first Cognito login.
 *
 * The Cognito `sub` is stored in the `cognito_sub` column for each user.
 * Users that already have a cognito_sub are skipped.
 * Failures are logged with the user email and error reason; processing
 * continues for remaining users.
 *
 * Usage:
 *   node server/database/migrate-users-to-cognito.js
 *
 * Required environment variables:
 *   DATABASE_URL          – PostgreSQL connection string
 *   COGNITO_USER_POOL_ID  – Cognito User Pool ID
 *   AWS_REGION            – AWS region (e.g. us-east-1)
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

require('dotenv').config();
const { Pool } = require('pg');
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/aws_practice';

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTemporaryPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  // Guarantee at least one of each required character class
  let password =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    special[Math.floor(Math.random() * special.length)];

  // Fill remaining length (16 chars total)
  for (let i = password.length; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/**
 * Create a Cognito account for a single user via AdminCreateUser.
 * Returns the Cognito `sub` on success, or throws on failure.
 */
async function createCognitoUser(cognitoClient, userPoolId, email) {
  const command = new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    TemporaryPassword: generateTemporaryPassword(),
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
    MessageAction: 'SUPPRESS', // Don't send welcome email during migration
    DesiredDeliveryMediums: [],
  });

  const response = await cognitoClient.send(command);
  const subAttr = response.User.Attributes.find((a) => a.Name === 'sub');

  if (!subAttr) {
    throw new Error('Cognito response did not include a sub attribute');
  }

  return subAttr.Value;
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function migrateUsers() {
  // Validate required env vars
  if (!COGNITO_USER_POOL_ID) {
    console.error('ERROR: COGNITO_USER_POOL_ID environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  const cognitoClient = new CognitoIdentityProviderClient({
    region: AWS_REGION,
  });

  let totalUsers = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    // Test DB connection
    const client = await pool.connect();
    console.log('Database connection successful.');
    client.release();

    // Fetch all non-deleted users
    const result = await pool.query(
      'SELECT id, email, cognito_sub FROM users WHERE deleted_at IS NULL ORDER BY id'
    );

    const users = result.rows;
    totalUsers = users.length;
    console.log(`\nFound ${totalUsers} user(s) to process.\n`);

    if (totalUsers === 0) {
      console.log('No users to migrate.');
      return;
    }

    // Process users one at a time to avoid Cognito rate limiting
    for (const user of users) {
      // Skip users that already have a cognito_sub
      if (user.cognito_sub) {
        console.log(`SKIP  [${user.email}] – already linked to Cognito (${user.cognito_sub})`);
        skippedCount++;
        continue;
      }

      try {
        const cognitoSub = await createCognitoUser(
          cognitoClient,
          COGNITO_USER_POOL_ID,
          user.email
        );

        // Store the cognito_sub in the database
        await pool.query(
          'UPDATE users SET cognito_sub = $1 WHERE id = $2',
          [cognitoSub, user.id]
        );

        console.log(`OK    [${user.email}] – cognito_sub: ${cognitoSub}`);
        migratedCount++;
      } catch (err) {
        console.error(`FAIL  [${user.email}] – ${err.name || 'Error'}: ${err.message}`);
        failedCount++;
      }
    }
  } catch (err) {
    console.error('\nFatal error during migration:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }

  // Summary
  console.log('\n--- Migration Summary ---');
  console.log(`Total users : ${totalUsers}`);
  console.log(`Migrated    : ${migratedCount}`);
  console.log(`Skipped     : ${skippedCount}`);
  console.log(`Failed      : ${failedCount}`);

  if (failedCount > 0) {
    console.log('\nSome users failed to migrate. Review the FAIL entries above.');
    process.exit(1);
  }

  console.log('\nMigration completed successfully.');
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

module.exports = { generateTemporaryPassword, createCognitoUser, migrateUsers };

// ---------------------------------------------------------------------------
// Run (only when executed directly)
// ---------------------------------------------------------------------------

if (require.main === module) {
  migrateUsers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Unexpected error:', err);
      process.exit(1);
    });
}
