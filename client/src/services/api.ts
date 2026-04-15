import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { cognitoService } from './cognitoService';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with base configuration
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for CSRF cookie
});

// --- CSRF token management ---

let csrfToken: string | null = null;

const MUTATING_METHODS = ['post', 'put', 'patch', 'delete'];

/**
 * Fetch a CSRF token from the server and store it in memory.
 * Also sets the double-submit cookie via the response.
 * Logs a warning on failure but does not throw — some endpoints don't require CSRF.
 */
export async function fetchCsrfToken(): Promise<void> {
  try {
    const response = await axios.get<{ csrfToken: string }>(
      `${API_BASE_URL}/csrf-token`,
      { withCredentials: true }
    );
    csrfToken = response.data.csrfToken;
  } catch (err) {
    console.warn('Failed to fetch CSRF token — mutating requests may be rejected:', err);
  }
}

// Fetch CSRF token on module load (non-blocking)
fetchCsrfToken();

// --- 401 refresh management ---

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers = [];
}

// --- Interceptors ---

// Request interceptor — attach Cognito access token + CSRF token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Attach Bearer token from Cognito in-memory store
    const session = cognitoService.getCurrentSession();
    if (session) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }

    // Attach CSRF token on mutating requests
    if (csrfToken && config.method && MUTATING_METHODS.includes(config.method.toLowerCase())) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


// Response interceptor — handle 401 with one refresh attempt, then logout
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const tokens = await cognitoService.refreshSession();
          isRefreshing = false;
          onTokenRefreshed(tokens.accessToken);

          // Retry the original request with the new token
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return api(originalRequest);
        } catch {
          isRefreshing = false;
          onRefreshFailed();
          // Refresh failed — notify AuthContext to log out
          window.dispatchEvent(new CustomEvent('auth:logout'));
          return Promise.reject(error);
        }
      }

      // Another request hit 401 while refresh is in-flight — queue it
      return new Promise((resolve) => {
        subscribeTokenRefresh((newToken: string) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      console.warn('Rate limit exceeded:', error.response.data?.error);
    }

    // Handle server errors
    if (error.response && error.response.status >= 500) {
      console.error('Server error:', error.response.data?.error);
    }

    if (!error.response && error.request) {
      console.error('Network error:', error.message);
    }

    return Promise.reject(error);
  }
);

// Generic API methods
export const apiClient = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.get(url, config),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.post(url, data, config),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.put(url, data, config),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.patch(url, data, config),

  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.delete(url, config),
};

// Error handling utilities
export const handleApiError = (error: any): string => {
  if (error.response?.data?.error) {
    return error.response.data.error;
  } else if (error.request) {
    return 'Network error. Please check your connection and try again.';
  } else {
    return 'An unexpected error occurred. Please try again.';
  }
};

export const isNetworkError = (error: any): boolean => {
  return !error.response && error.request;
};

export const isServerError = (error: any): boolean => {
  return error.response && error.response.status >= 500;
};

export const isClientError = (error: any): boolean => {
  return error.response && error.response.status >= 400 && error.response.status < 500;
};

export default api;
