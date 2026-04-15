import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordForm from './ForgotPasswordForm';

// --- Mocks ---

const mockForgotPassword = jest.fn();
const mockConfirmForgotPassword = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    forgotPassword: mockForgotPassword,
    confirmForgotPassword: mockConfirmForgotPassword,
  }),
}));

const onSwitchToLogin = jest.fn();

function renderForm() {
  return render(<ForgotPasswordForm onSwitchToLogin={onSwitchToLogin} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Tests ---

describe('ForgotPasswordForm', () => {
  describe('Step 1: Request reset code', () => {
    it('renders the email request form', () => {
      renderForm();
      expect(screen.getByText('Forgot Password')).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send reset code/i })).toBeInTheDocument();
    });

    it('sends reset code and advances to confirm step', async () => {
      mockForgotPassword.mockResolvedValue(undefined);
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'user@example.com' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /send reset code/i }));

      await waitFor(() => {
        expect(mockForgotPassword).toHaveBeenCalledWith('user@example.com');
      });
      expect(await screen.findByText('Reset Your Password')).toBeInTheDocument();
      expect(screen.getByText(/reset code has been sent/i)).toBeInTheDocument();
    });

    it('shows error on LimitExceededException', async () => {
      mockForgotPassword.mockRejectedValue({ code: 'LimitExceededException', message: 'Too many' });
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'user@example.com' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /send reset code/i }));

      expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    });

    it('does not reveal user existence on UserNotFoundException', async () => {
      mockForgotPassword.mockRejectedValue({ code: 'UserNotFoundException', message: 'User not found' });
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'nobody@example.com' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /send reset code/i }));

      // Should still advance to confirm step (security: don't reveal if user exists)
      await waitFor(() => {
        expect(screen.getByText('Reset Your Password')).toBeInTheDocument();
      });
    });

    it('navigates back to login when "Back to login" is clicked', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /back to login/i }));
      expect(onSwitchToLogin).toHaveBeenCalledWith();
    });
  });

  describe('Step 2: Confirm reset with code + new password', () => {
    async function goToConfirmStep() {
      mockForgotPassword.mockResolvedValue(undefined);
      renderForm();

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'user@example.com' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /send reset code/i }));

      await waitFor(() => {
        expect(screen.getByText('Reset Your Password')).toBeInTheDocument();
      });
    }

    it('renders code and new password fields', async () => {
      await goToConfirmStep();
      expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
    });

    it('resets password and redirects to login with success message', async () => {
      mockConfirmForgotPassword.mockResolvedValue(undefined);
      await goToConfirmStep();

      fireEvent.change(screen.getByLabelText(/reset code/i), {
        target: { value: '123456' },
      });
      fireEvent.change(screen.getByLabelText(/^new password$/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(mockConfirmForgotPassword).toHaveBeenCalledWith('user@example.com', '123456', 'NewPass1!');
      });
      expect(onSwitchToLogin).toHaveBeenCalledWith(
        'Password reset successfully! You can now log in with your new password.'
      );
    });

    it('shows error for CodeMismatchException', async () => {
      mockConfirmForgotPassword.mockRejectedValue({ code: 'CodeMismatchException', message: 'Bad code' });
      await goToConfirmStep();

      fireEvent.change(screen.getByLabelText(/reset code/i), {
        target: { value: '000000' },
      });
      fireEvent.change(screen.getByLabelText(/^new password$/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /reset password/i }));

      expect(await screen.findByText(/invalid reset code/i)).toBeInTheDocument();
    });

    it('shows error for ExpiredCodeException', async () => {
      mockConfirmForgotPassword.mockRejectedValue({ code: 'ExpiredCodeException', message: 'Expired' });
      await goToConfirmStep();

      fireEvent.change(screen.getByLabelText(/reset code/i), {
        target: { value: '111111' },
      });
      fireEvent.change(screen.getByLabelText(/^new password$/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /reset password/i }));

      expect(await screen.findByText(/reset code has expired/i)).toBeInTheDocument();
    });

    it('validates password requirements before submitting', async () => {
      await goToConfirmStep();

      fireEvent.change(screen.getByLabelText(/reset code/i), {
        target: { value: '123456' },
      });
      fireEvent.change(screen.getByLabelText(/^new password$/i), {
        target: { value: 'weak' },
      });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), {
        target: { value: 'weak' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /reset password/i }));

      expect(await screen.findByText(/password does not meet all requirements/i)).toBeInTheDocument();
      expect(mockConfirmForgotPassword).not.toHaveBeenCalled();
    });

    it('validates passwords match before submitting', async () => {
      await goToConfirmStep();

      fireEvent.change(screen.getByLabelText(/reset code/i), {
        target: { value: '123456' },
      });
      fireEvent.change(screen.getByLabelText(/^new password$/i), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText(/confirm new password/i), {
        target: { value: 'Different1!' },
      });
      fireEvent.submit(screen.getByRole('button', { name: /reset password/i }));

      expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
      expect(mockConfirmForgotPassword).not.toHaveBeenCalled();
    });

    it('allows requesting a new code from the confirm step', async () => {
      mockForgotPassword.mockResolvedValue(undefined);
      await goToConfirmStep();

      // Clear the mock call count from goToConfirmStep
      mockForgotPassword.mockClear();

      fireEvent.click(screen.getByRole('button', { name: /resend code/i }));

      await waitFor(() => {
        expect(mockForgotPassword).toHaveBeenCalledWith('user@example.com');
      });
      expect(await screen.findByText(/new reset code has been sent/i)).toBeInTheDocument();
    });

    it('navigates back to login from confirm step', async () => {
      await goToConfirmStep();
      fireEvent.click(screen.getByRole('button', { name: /back to login/i }));
      expect(onSwitchToLogin).toHaveBeenCalledWith();
    });
  });
});
