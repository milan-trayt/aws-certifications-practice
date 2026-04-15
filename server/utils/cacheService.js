const Redis = require('ioredis');

let client = null;
let available = false;

/**
 * Initialise the Redis client.
 * Accepts an optional ioredis-compatible client (useful for testing).
 */
function init(existingClient) {
  if (existingClient) {
    client = existingClient;
    available = false;
    _attachListeners(client);
    return client;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) return null; // stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
    lazyConnect: false,
  });

  _attachListeners(client);
  return client;
}

function _attachListeners(c) {
  c.on('connect', () => {
    available = true;
    console.log('Redis connected');
  });
  c.on('ready', () => {
    available = true;
  });
  c.on('error', (err) => {
    available = false;
    console.error('Redis error:', err.message);
  });
  c.on('close', () => {
    available = false;
  });
}

/**
 * Returns true when the Redis connection is usable.
 */
function isAvailable() {
  return available && client !== null;
}

/**
 * Get a value from cache. Returns parsed JSON or null.
 */
async function get(key) {
  if (!isAvailable()) return null;
  try {
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Set a value in cache with a TTL in seconds.
 */
async function set(key, value, ttlSeconds) {
  if (!isAvailable()) return;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
  } catch {
    // gracefully ignore – DB is the source of truth
  }
}

/**
 * Delete a single key from cache.
 */
async function del(key) {
  if (!isAvailable()) return;
  try {
    await client.del(key);
  } catch {
    // gracefully ignore
  }
}

/**
 * Delete all keys matching a glob pattern (e.g. "tests:*").
 * Uses SCAN to avoid blocking Redis with KEYS on large datasets.
 */
async function delPattern(pattern) {
  if (!isAvailable()) return;
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // gracefully ignore
  }
}

/**
 * Gracefully disconnect from Redis.
 */
async function quit() {
  if (client) {
    try {
      await client.quit();
    } catch {
      // ignore
    }
    client = null;
    available = false;
  }
}

module.exports = { init, get, set, del, delPattern, isAvailable, quit };
