/* eslint-disable no-var */
// Use `var` so declarations are hoisted above jest.mock factory
var mockPool: any;
var mockUser: any;

jest.mock('amazon-cognito-identity-js', () => {
  mockPool = {
    signUp: jest.fn(),
    getCurrentUser: jest.fn(),
  };
  mockUser = {
    confirmRegistration: jest.fn(),
    resendConfirmationCode: jest.fn(),
    authenticateUser: jest.fn(),
    signOut: jest.fn(),
    forgotPassword: jest.fn(),
    confirmPassword: jest.fn(),
    changePassword: jest.fn(),
    getSession: jest.fn(),
    refreshSession: jest.fn(),
  };

  return {
    // Regular functions so `new` returns our mock objects (jest.fn with new ignores return value)
    CognitoUserPool: function() { return mockPool; },
    CognitoUser: function() { return mockUser; },
    CognitoUserAttribute: jest.fn((data: any) => data),
    AuthenticationDetails: jest.fn((data: any) => data),
    CognitoRefreshToken: jest.fn((data: any) => data),
  };
});

import { cognitoService } from './cognitoService';

const fakeSession = {
  getAccessToken: () => ({
    getJwtToken: () => 'access-token-123',
    getExpiration: () => Math.floor(Date.now() / 1000) + 3600,
  }),
  getIdToken: () => ({
    getJwtToken: () => 'id-token-123',
  }),
  getRefreshToken: () => ({
    getToken: () => 'refresh-token-123',
  }),
};

beforeEach(() => {
  Object.values(mockPool).forEach((m: any) => m.mockClear());
  Object.values(mockUser).forEach((m: any) => m.mockClear());
  mockPool.getCurrentUser.mockReturnValue(null);
  cognitoService.signOut();
});

describe('cognitoService', () => {
  describe('signUp', () => {
    it('resolves with userConfirmed and userSub', async () => {
      mockPool.signUp.mockImplementation(
        (_u: string, _p: string, _a: any[], _v: any[], cb: Function) => {
          cb(null, { userConfirmed: false, userSub: 'sub-abc-123' });
        }
      );
      const result = await cognitoService.signUp('test@example.com', 'Password1!');
      expect(result).toEqual({ userConfirmed: false, userSub: 'sub-abc-123' });
    });

    it('rejects on error', async () => {
      mockPool.signUp.mockImplementation(
        (_u: string, _p: string, _a: any[], _v: any[], cb: Function) => {
          cb(new Error('UsernameExistsException'));
        }
      );
      await expect(
        cognitoService.signUp('test@example.com', 'Password1!')
      ).rejects.toThrow('UsernameExistsException');
    });
  });

  describe('confirmSignUp', () => {
    it('resolves on success', async () => {
      mockUser.confirmRegistration.mockImplementation(
        (_code: string, _force: boolean, cb: Function) => cb(null)
      );
      await expect(
        cognitoService.confirmSignUp('test@example.com', '123456')
      ).resolves.toBeUndefined();
    });
  });

  describe('resendConfirmationCode', () => {
    it('resolves on success', async () => {
      mockUser.resendConfirmationCode.mockImplementation((cb: Function) => cb(null));
      await expect(
        cognitoService.resendConfirmationCode('test@example.com')
      ).resolves.toBeUndefined();
    });
  });

  describe('signIn', () => {
    it('resolves with tokens and stores them in memory', async () => {
      mockUser.authenticateUser.mockImplementation((_d: any, cb: any) => {
        cb.onSuccess(fakeSession);
      });
      const tokens = await cognitoService.signIn('test@example.com', 'Password1!');
      expect(tokens.accessToken).toBe('access-token-123');
      expect(tokens.idToken).toBe('id-token-123');
      expect(tokens.refreshToken).toBe('refresh-token-123');
      expect(tokens.expiresAt).toBeGreaterThan(Date.now());
      expect(cognitoService.getCurrentSession()).toEqual(tokens);
    });

    it('rejects on failure', async () => {
      mockUser.authenticateUser.mockImplementation((_d: any, cb: any) => {
        cb.onFailure(new Error('NotAuthorizedException'));
      });
      await expect(
        cognitoService.signIn('test@example.com', 'wrong')
      ).rejects.toThrow('NotAuthorizedException');
    });
  });

  describe('signOut', () => {
    it('clears in-memory tokens and calls cognitoUser.signOut', async () => {
      mockUser.authenticateUser.mockImplementation((_d: any, cb: any) =>
        cb.onSuccess(fakeSession)
      );
      await cognitoService.signIn('test@example.com', 'Password1!');
      expect(cognitoService.getCurrentSession()).not.toBeNull();

      const mockCognitoUser = { signOut: jest.fn() };
      mockPool.getCurrentUser.mockReturnValue(mockCognitoUser);

      cognitoService.signOut();
      expect(mockCognitoUser.signOut).toHaveBeenCalled();
      expect(cognitoService.getCurrentSession()).toBeNull();
    });
  });

  describe('forgotPassword', () => {
    it('resolves on success', async () => {
      mockUser.forgotPassword.mockImplementation((cb: any) => {
        cb.onSuccess();
      });
      await expect(
        cognitoService.forgotPassword('test@example.com')
      ).resolves.toBeUndefined();
    });
  });

  describe('confirmForgotPassword', () => {
    it('resolves on success', async () => {
      mockUser.confirmPassword.mockImplementation(
        (_code: string, _newPw: string, cb: any) => {
          cb.onSuccess();
        }
      );
      await expect(
        cognitoService.confirmForgotPassword('test@example.com', '123456', 'NewPass1!')
      ).resolves.toBeUndefined();
    });
  });

  describe('getCurrentSession', () => {
    it('returns null when not authenticated', () => {
      expect(cognitoService.getCurrentSession()).toBeNull();
    });
  });
});
