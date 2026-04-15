import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { cognitoService, SignUpResult } from '../services/cognitoService';
import { TOKEN_REFRESH_INTERVAL_MS, TOKEN_REFRESH_THRESHOLD_MS } from '../constants';

// --- Types ---

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, firstName?: string, lastName?: string): Promise<SignUpResult>;
  confirmRegistration(email: string, code: string): Promise<void>;
  logout(): void;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// --- Helpers ---

/** Decode a JWT payload without verification (for extracting user claims). */
function decodeIdTokenPayload(idToken: string): Record<string, any> {
  try {
    const base64Url = idToken.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

function userFromIdToken(idToken: string): User {
  const claims = decodeIdTokenPayload(idToken);
  return {
    id: claims.sub ?? '',
    email: claims.email ?? '',
    firstName: claims.given_name,
    lastName: claims.family_name,
  };
}

// --- Provider ---

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard to prevent concurrent refresh attempts
  const isRefreshingRef = useRef(false);

  const isAuthenticated = !!user;

  // --- Cleanup helper ---
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // --- Auto-refresh logic ---
  const startRefreshTimer = useCallback(() => {
    clearRefreshTimer();
    refreshTimerRef.current = setInterval(async () => {
      if (isRefreshingRef.current) return;
      const session = cognitoService.getCurrentSession();
      if (!session) return;

      const timeUntilExpiry = session.expiresAt - Date.now();
      if (timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD_MS) {
        isRefreshingRef.current = true;
        try {
          const tokens = await cognitoService.refreshSession();
          setUser(userFromIdToken(tokens.idToken));
        } catch {
          // Refresh failed — session is stale, log out
          cognitoService.signOut();
          setUser(null);
          clearRefreshTimer();
        } finally {
          isRefreshingRef.current = false;
        }
      }
    }, TOKEN_REFRESH_INTERVAL_MS);
  }, [clearRefreshTimer]);

  // --- Initialize: try to restore session from Cognito's current user ---
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const session = cognitoService.getCurrentSession();
        if (session && session.expiresAt > Date.now()) {
          setUser(userFromIdToken(session.idToken));
          startRefreshTimer();
        } else if (session) {
          // Token exists but expired — try a refresh
          try {
            const tokens = await cognitoService.refreshSession();
            setUser(userFromIdToken(tokens.idToken));
            startRefreshTimer();
          } catch {
            cognitoService.signOut();
          }
        }
      } catch {
        // No session available
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    return () => {
      clearRefreshTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Auth methods ---

  const login = async (email: string, password: string): Promise<void> => {
    const tokens = await cognitoService.signIn(email, password);
    setUser(userFromIdToken(tokens.idToken));
    startRefreshTimer();
  };

  const register = async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<SignUpResult> => {
    return cognitoService.signUp(email, password, firstName, lastName);
  };

  const confirmRegistration = async (email: string, code: string): Promise<void> => {
    await cognitoService.confirmSignUp(email, code);
  };

  const logout = (): void => {
    cognitoService.signOut();
    setUser(null);
    clearRefreshTimer();
  };

  const forgotPassword = async (email: string): Promise<void> => {
    await cognitoService.forgotPassword(email);
  };

  const confirmForgotPassword = async (
    email: string,
    code: string,
    newPassword: string
  ): Promise<void> => {
    await cognitoService.confirmForgotPassword(email, code, newPassword);
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
    await cognitoService.changePassword(oldPassword, newPassword);
  };

  // --- Listen for 401 logout events dispatched by the API interceptor ---
  useEffect(() => {
    const handleForceLogout = () => {
      logout();
    };
    window.addEventListener('auth:logout', handleForceLogout);
    return () => window.removeEventListener('auth:logout', handleForceLogout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    confirmRegistration,
    logout,
    forgotPassword,
    confirmForgotPassword,
    changePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
