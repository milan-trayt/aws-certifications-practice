import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from './LoginForm';

// --- Mocks ---

const mockLogin = jest.fn();
const mockConfirmRegistration = jest.fn();
const mockResendConfirmationCode = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    confirmRegistration: mockConfirmRegistration,
  }),
}));

jest.mock('../../services/cognitoService', () => ({
  cognitoService: {
    resendConfirmationCode: (...args: any[]) => mockResendConfirmationCode(...args),
  },
}));

const onSwitchToRegister = jest.fn();
const onSwitchToForgotPassword = jest.fn();

function renderForm(props?: { onSwitchToForgotPassword?: () => void }) {
  return render(
    <LoginForm
      onSwitchToRegister={onSwitchToRegister}
      onSwitchToForgotPassword={props?.onSwitchToForgotPassword}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Tests ---

describe('LoginForm', () => {
  it('renders the login form', () => {
    renderForm();
    expect(screen.getByText('Login to AWS Practice Tests')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('navigates to home on successful login', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderForm();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Password1!' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'Password1!');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows generic error on NotAuthorizedException (invalid credentials)', async () => {
    mockLogin.mockRejectedValue({ code: 'NotAuthorizedException', message: 'Incorrect username or password.' });
    renderForm();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('shows generic error on UserNotFoundException', async () => {
    mockLogin.mockRejectedValue({ code: 'UserNotFoundException', message: 'User does not exist.' });
    renderForm();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Password1!' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('redirects to verification form on UserNotConfirmedException', async () => {
    mockLogin.mockRejectedValue({ code: 'UserNotConfirmedException', message: 'User is not confirmed.' });
    renderForm();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'unverified@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Password1!' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
    });
    expect(screen.getByText(/unverified@example.com/)).toBeInTheDocument();
  });

  describe('forgot password link', () => {
    it('does not render forgot password link when prop is not provided', () => {
      renderForm();
      expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
    });

    it('renders forgot password link when prop is provided', () => {
      renderForm({ onSwitchToForgotPassword });
      expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
    });

    it('calls onSwitchToForgotPassword when clicked', () => {
      renderForm({ onSwitchToForgotPassword });
      fireEvent.click(screen.getByText(/forgot password/i));
      expect(onSwitchToForgotPassword).toHaveBeenCalled();
    });
  });

  describe('verification flow from login', () => {
    async function goToVerification() {
      mockLogin.mockRejectedValue({ code: 'UserNotConfirmedException', message: 'User is not confirmed.' });
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'unverified@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'Password1!' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });
    }

    it('calls confirmRegistration on code submit and returns to login', async () => {
      mockConfirmRegistration.mockResolvedValue(undefined);
      await goToVerification();

      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: '123456' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /verify email/i }));

      await waitFor(() => {
        expect(mockConfirmRegistration).toHaveBeenCalledWith('unverified@example.com', '123456');
      });
      expect(await screen.findByText(/email verified successfully/i)).toBeInTheDocument();
      // Should return to login form
      expect(screen.getByText('Login to AWS Practice Tests')).toBeInTheDocument();
    });

    it('shows error for CodeMismatchException', async () => {
      mockConfirmRegistration.mockRejectedValue({ code: 'CodeMismatchException', message: 'Bad code' });
      await goToVerification();

      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: '000000' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /verify email/i }));

      expect(await screen.findByText(/invalid verification code/i)).toBeInTheDocument();
    });

    it('resends verification code', async () => {
      mockResendConfirmationCode.mockResolvedValue(undefined);
      await goToVerification();

      fireEvent.click(screen.getByRole('button', { name: /resend code/i }));

      await waitFor(() => {
        expect(mockResendConfirmationCode).toHaveBeenCalledWith('unverified@example.com');
      });
      expect(await screen.findByText(/new verification code has been sent/i)).toBeInTheDocument();
    });

    it('returns to login form when "Back to login" is clicked', async () => {
      await goToVerification();

      fireEvent.click(screen.getByRole('button', { name: /back to login/i }));

      expect(screen.getByText('Login to AWS Practice Tests')).toBeInTheDocument();
    });
  });

  it('calls onSwitchToRegister when register link is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByText(/register here/i));
    expect(onSwitchToRegister).toHaveBeenCalled();
  });
});
