import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from './RegisterForm';

// --- Mocks ---

// Must use `mock` prefix for jest.mock hoisting to work
const mockRegister = jest.fn();
const mockConfirmRegistration = jest.fn();
const mockResendConfirmationCode = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    register: mockRegister,
    confirmRegistration: mockConfirmRegistration,
  }),
}));

jest.mock('../../services/cognitoService', () => ({
  cognitoService: {
    resendConfirmationCode: (...args: any[]) => mockResendConfirmationCode(...args),
  },
}));

const onSwitchToLogin = jest.fn();

function renderForm() {
  return render(<RegisterForm onSwitchToLogin={onSwitchToLogin} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Tests ---

describe('RegisterForm', () => {
  it('renders the registration form by default', () => {
    renderForm();
    expect(screen.getByText('Register for AWS Practice Tests')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password \*/i)).toBeInTheDocument();
  });

  describe('password validation', () => {
    it('shows real-time password checklist when user types', () => {
      renderForm();
      const passwordInput = screen.getByLabelText(/^password \*/i);
      fireEvent.change(passwordInput, { target: { value: 'a', name: 'password' } });

      expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
      expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
      expect(screen.getByText('One lowercase letter')).toBeInTheDocument();
      expect(screen.getByText('One number')).toBeInTheDocument();
      expect(screen.getByText('One special character (!@#$%^&*…)')).toBeInTheDocument();
    });

    it('marks checks as met when password satisfies them', () => {
      renderForm();
      const passwordInput = screen.getByLabelText(/^password \*/i);
      fireEvent.change(passwordInput, { target: { value: 'Abcdef1!', name: 'password' } });

      const items = screen.getAllByRole('listitem');
      items.forEach((item) => {
        expect(item).toHaveClass('check-met');
      });
    });

    it('prevents submission when password policy is not met', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/^password \*/i), {
        target: { value: 'short', name: 'password' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'short', name: 'confirmPassword' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /register/i }));

      expect(await screen.findByText(/password does not meet all requirements/i)).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('prevents submission when passwords do not match', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(/^password \*/i), {
        target: { value: 'Abcdef1!', name: 'password' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'Different1!', name: 'confirmPassword' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /register/i }));

      expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe('signup flow', () => {
    it('calls register and shows verification form when userConfirmed is false', async () => {
      mockRegister.mockResolvedValue({ userConfirmed: false, userSub: 'sub-123' });
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com', name: 'email' },
      });
      fireEvent.change(screen.getByLabelText(/^password \*/i), {
        target: { value: 'Abcdef1!', name: 'password' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'Abcdef1!', name: 'confirmPassword' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });
      expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
    });

    it('shows error for UsernameExistsException', async () => {
      mockRegister.mockRejectedValue({ code: 'UsernameExistsException', message: 'User exists' });
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'existing@example.com', name: 'email' },
      });
      fireEvent.change(screen.getByLabelText(/^password \*/i), {
        target: { value: 'Abcdef1!', name: 'password' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'Abcdef1!', name: 'confirmPassword' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /register/i }));

      expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    });
  });

  describe('verification code form', () => {
    async function goToVerification() {
      mockRegister.mockResolvedValue({ userConfirmed: false, userSub: 'sub-123' });
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com', name: 'email' },
      });
      fireEvent.change(screen.getByLabelText(/^password \*/i), {
        target: { value: 'Abcdef1!', name: 'password' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'Abcdef1!', name: 'confirmPassword' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });
    }

    it('calls confirmRegistration on code submit and redirects to login', async () => {
      jest.useFakeTimers();
      mockConfirmRegistration.mockResolvedValue(undefined);
      await goToVerification();

      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: '123456' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /verify email/i }));

      await waitFor(() => {
        expect(mockConfirmRegistration).toHaveBeenCalledWith('test@example.com', '123456');
      });
      expect(await screen.findByText(/email verified successfully/i)).toBeInTheDocument();

      jest.advanceTimersByTime(2000);
      expect(onSwitchToLogin).toHaveBeenCalled();
      jest.useRealTimers();
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

    it('shows error for ExpiredCodeException', async () => {
      mockConfirmRegistration.mockRejectedValue({ code: 'ExpiredCodeException', message: 'Expired' });
      await goToVerification();

      fireEvent.change(screen.getByLabelText(/verification code/i), {
        target: { value: '111111' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /verify email/i }));

      expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    });

    it('resends verification code', async () => {
      mockResendConfirmationCode.mockResolvedValue(undefined);
      await goToVerification();

      fireEvent.click(screen.getByRole('button', { name: /resend code/i }));

      await waitFor(() => {
        expect(mockResendConfirmationCode).toHaveBeenCalledWith('test@example.com');
      });
      expect(await screen.findByText(/new verification code has been sent/i)).toBeInTheDocument();
    });
  });
});
