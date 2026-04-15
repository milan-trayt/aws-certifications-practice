/**
 * Tests for api.ts CSRF token integration.
 *
 * Because api.ts calls fetchCsrfToken() at module load and registers
 * interceptors immediately, we use jest.resetModules() + require() to
 * get a fresh module for each test group.
 */

export {};

// We keep a reference to the real axios so we can spy on it
jest.mock('./cognitoService', () => ({
  cognitoService: {
    getCurrentSession: jest.fn(),
    refreshSession: jest.fn(),
  },
}));

describe('api.ts CSRF integration', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('fetchCsrfToken', () => {
    it('fetches CSRF token from /api/csrf-token endpoint', async () => {
      // Mock axios before requiring api module
      const mockAxiosGet = jest.fn().mockResolvedValue({
        data: { csrfToken: 'test-csrf-token-abc' },
      });

      jest.doMock('axios', () => {
        const instance = {
          interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
          },
        };
        const axiosMock: any = jest.fn(() => instance);
        axiosMock.create = jest.fn(() => instance);
        axiosMock.get = mockAxiosGet;
        axiosMock.defaults = { headers: { common: {} } };
        return { __esModule: true, default: axiosMock };
      });

      const apiModule = require('./api');
      await apiModule.fetchCsrfToken();

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('/csrf-token'),
        expect.objectContaining({ withCredentials: true })
      );
    });

    it('logs warning but does not throw when CSRF fetch fails', async () => {
      const mockAxiosGet = jest.fn().mockRejectedValue(new Error('Network error'));

      jest.doMock('axios', () => {
        const instance = {
          interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
          },
        };
        const axiosMock: any = jest.fn(() => instance);
        axiosMock.create = jest.fn(() => instance);
        axiosMock.get = mockAxiosGet;
        axiosMock.defaults = { headers: { common: {} } };
        return { __esModule: true, default: axiosMock };
      });

      const apiModule = require('./api');
      await expect(apiModule.fetchCsrfToken()).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch CSRF token'),
        expect.any(Error)
      );
    });
  });

  describe('request interceptor', () => {
    let requestInterceptorFn: Function;
    let mockAxiosGet: jest.Mock;

    beforeEach(() => {
      mockAxiosGet = jest.fn().mockResolvedValue({
        data: { csrfToken: 'csrf-for-interceptor' },
      });

      const requestUse = jest.fn();
      jest.doMock('axios', () => {
        const instance = {
          interceptors: {
            request: { use: requestUse },
            response: { use: jest.fn() },
          },
        };
        const axiosMock: any = jest.fn(() => instance);
        axiosMock.create = jest.fn(() => instance);
        axiosMock.get = mockAxiosGet;
        axiosMock.defaults = { headers: { common: {} } };
        return { __esModule: true, default: axiosMock };
      });

      // Require the module — this registers interceptors
      require('./api');

      // Grab the request interceptor function
      requestInterceptorFn = requestUse.mock.calls[0][0];
    });

    it('attaches X-CSRF-Token header on POST requests after token is fetched', async () => {
      const apiModule = require('./api');
      await apiModule.fetchCsrfToken();

      const config = { method: 'post', headers: {} as any };
      const result = requestInterceptorFn(config);
      expect(result.headers['X-CSRF-Token']).toBe('csrf-for-interceptor');
    });

    it('attaches X-CSRF-Token on PUT, PATCH, DELETE methods', async () => {
      const apiModule = require('./api');
      await apiModule.fetchCsrfToken();

      for (const method of ['put', 'patch', 'delete']) {
        const config = { method, headers: {} as any };
        const result = requestInterceptorFn(config);
        expect(result.headers['X-CSRF-Token']).toBe('csrf-for-interceptor');
      }
    });

    it('does NOT attach X-CSRF-Token header on GET requests', async () => {
      const apiModule = require('./api');
      await apiModule.fetchCsrfToken();

      const config = { method: 'get', headers: {} as any };
      const result = requestInterceptorFn(config);
      expect(result.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('does not attach CSRF header when token fetch failed', () => {
      // Use a fresh module where the CSRF fetch fails
      jest.resetModules();
      const failingGet = jest.fn().mockRejectedValue(new Error('fail'));
      const requestUse2 = jest.fn();
      jest.doMock('axios', () => {
        const instance = {
          interceptors: {
            request: { use: requestUse2 },
            response: { use: jest.fn() },
          },
        };
        const axiosMock: any = jest.fn(() => instance);
        axiosMock.create = jest.fn(() => instance);
        axiosMock.get = failingGet;
        axiosMock.defaults = { headers: { common: {} } };
        return { __esModule: true, default: axiosMock };
      });

      require('./api');
      const interceptor = requestUse2.mock.calls[0][0];

      const config = { method: 'post', headers: {} as any };
      const result = interceptor(config);
      expect(result.headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  describe('axios instance configuration', () => {
    it('creates axios instance with withCredentials: true', () => {
      const mockCreate = jest.fn(() => ({
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      }));

      jest.doMock('axios', () => {
        const axiosMock: any = jest.fn();
        axiosMock.create = mockCreate;
        axiosMock.get = jest.fn().mockResolvedValue({ data: {} });
        axiosMock.defaults = { headers: { common: {} } };
        return { __esModule: true, default: axiosMock };
      });

      require('./api');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ withCredentials: true })
      );
    });
  });

  describe('exports', () => {
    it('exports fetchCsrfToken as a function', () => {
      jest.doMock('axios', () => {
        const instance = {
          interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
          },
        };
        const axiosMock: any = jest.fn(() => instance);
        axiosMock.create = jest.fn(() => instance);
        axiosMock.get = jest.fn().mockResolvedValue({ data: {} });
        return { __esModule: true, default: axiosMock };
      });

      const apiModule = require('./api');
      expect(typeof apiModule.fetchCsrfToken).toBe('function');
    });

    it('exports apiClient with standard HTTP methods', () => {
      jest.doMock('axios', () => {
        const instance = {
          interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
          },
          get: jest.fn(),
          post: jest.fn(),
          put: jest.fn(),
          patch: jest.fn(),
          delete: jest.fn(),
        };
        const axiosMock: any = jest.fn(() => instance);
        axiosMock.create = jest.fn(() => instance);
        axiosMock.get = jest.fn().mockResolvedValue({ data: {} });
        return { __esModule: true, default: axiosMock };
      });

      const apiModule = require('./api');
      expect(typeof apiModule.apiClient.get).toBe('function');
      expect(typeof apiModule.apiClient.post).toBe('function');
      expect(typeof apiModule.apiClient.put).toBe('function');
      expect(typeof apiModule.apiClient.patch).toBe('function');
      expect(typeof apiModule.apiClient.delete).toBe('function');
    });
  });
});
