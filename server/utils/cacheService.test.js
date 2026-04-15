const cacheService = require('./cacheService');

// Minimal in-memory mock that behaves like ioredis
function createMockRedis({ failOnOps = false } = {}) {
  const store = new Map();
  const ttls = new Map();
  const listeners = {};

  const mock = {
    status: 'ready',
    on(event, fn) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    emit(event, ...args) {
      (listeners[event] || []).forEach(fn => fn(...args));
    },
    async get(key) {
      if (failOnOps) throw new Error('Redis down');
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value, ...args) {
      if (failOnOps) throw new Error('Redis down');
      store.set(key, value);
      if (args[0] === 'EX') ttls.set(key, args[1]);
    },
    async del(...keys) {
      if (failOnOps) throw new Error('Redis down');
      keys.forEach(k => { store.delete(k); ttls.delete(k); });
    },
    async scan(cursor, _match, pattern, _count, count) {
      if (failOnOps) throw new Error('Redis down');
      // Simple glob match: only supports trailing *
      const prefix = pattern.replace(/\*$/, '');
      const matched = [...store.keys()].filter(k => k.startsWith(prefix));
      return ['0', matched];
    },
    async quit() {
      store.clear();
    },
    _store: store,
    _ttls: ttls,
  };

  return mock;
}

describe('cacheService', () => {
  afterEach(async () => {
    await cacheService.quit();
  });

  test('get returns null when Redis is not initialised', async () => {
    const result = await cacheService.get('any-key');
    expect(result).toBeNull();
  });

  test('isAvailable returns false before init', () => {
    expect(cacheService.isAvailable()).toBe(false);
  });

  test('set and get round-trip with JSON serialization', async () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');

    await cacheService.set('tests:list', [{ id: 1, name: 'AWS SAA' }], 600);
    const result = await cacheService.get('tests:list');

    expect(result).toEqual([{ id: 1, name: 'AWS SAA' }]);
    // Verify TTL was passed
    expect(mock._ttls.get('tests:list')).toBe(600);
  });

  test('get returns null on cache miss', async () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');

    const result = await cacheService.get('nonexistent');
    expect(result).toBeNull();
  });

  test('del removes a key', async () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');

    await cacheService.set('tests:1', { id: 1 }, 60);
    await cacheService.del('tests:1');
    const result = await cacheService.get('tests:1');

    expect(result).toBeNull();
  });

  test('delPattern removes matching keys', async () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');

    await cacheService.set('tests:1:questions', [1, 2], 60);
    await cacheService.set('tests:2:questions', [3, 4], 60);
    await cacheService.set('users:1', { name: 'Alice' }, 60);

    await cacheService.delPattern('tests:*');

    expect(await cacheService.get('tests:1:questions')).toBeNull();
    expect(await cacheService.get('tests:2:questions')).toBeNull();
    expect(await cacheService.get('users:1')).toEqual({ name: 'Alice' });
  });

  test('isAvailable returns true after ready event', () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');

    expect(cacheService.isAvailable()).toBe(true);
  });

  test('isAvailable returns false after error event', () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');
    mock.emit('error', new Error('connection lost'));

    expect(cacheService.isAvailable()).toBe(false);
  });

  test('isAvailable returns false after close event', () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');
    mock.emit('close');

    expect(cacheService.isAvailable()).toBe(false);
  });

  test('all methods gracefully handle Redis operation failures', async () => {
    const mock = createMockRedis({ failOnOps: true });
    cacheService.init(mock);
    mock.emit('ready');

    // None of these should throw
    const getResult = await cacheService.get('key');
    expect(getResult).toBeNull();

    await cacheService.set('key', 'value', 60);
    await cacheService.del('key');
    await cacheService.delPattern('key:*');
  });

  test('set without TTL stores value without expiry', async () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    mock.emit('ready');

    await cacheService.set('no-ttl', { data: true });
    const result = await cacheService.get('no-ttl');

    expect(result).toEqual({ data: true });
    expect(mock._ttls.has('no-ttl')).toBe(false);
  });

  test('operations are no-ops when Redis is unavailable', async () => {
    const mock = createMockRedis();
    cacheService.init(mock);
    // Don't emit ready — stays unavailable

    await cacheService.set('key', 'value', 60);
    const result = await cacheService.get('key');

    expect(result).toBeNull();
    expect(mock._store.size).toBe(0);
  });
});
