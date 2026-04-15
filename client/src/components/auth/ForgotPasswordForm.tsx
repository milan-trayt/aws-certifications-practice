import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './AuthForms.css';

interface ForgotPasswordFormProps {
  onSwitchToLogin: (successMessage?: string) => void;
}

interface PasswordCheck {
  label: string;
  met: boolean;
}

function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character (!@#$%^&*…)', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

type Step = 'request' | 'confirm';

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onSwitchToLogin }) => {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { forgotPassword, confirmForgotPassword } = useAuth();

  const passwordChecks = useMemo(() => getPasswordChecks(newPassword), [newPassword]);
  const allPasswordChecksMet = passwordChecks.every((c) => c.met);

  // Step 1: Request reset code
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      await forgotPassword(email);
      setStep('confirm');
      setSuccessMessage('A reset code has been sent to your email.');
    } catch (err: any) {
      const errCode = err?.code || err?.name || '';
      if (errCode === 'LimitExceededException') {
        setError('Too many attempts. Please try again later.');
      } else if (errCode === 'UserNotFoundException') {
        // Don't reveal whether user exists — show generic success
        setStep('confirm');
        setSuccessMessage('If an account exists with this email, a reset code has been sent.');
      } else {
        setError(err?.message || 'Failed to send reset code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm reset with code + new password
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!allPasswordChecksMet) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await confirmForgotPassword(email, code.trim(), newPassword);
      onSwitchToLogin('Password reset successfully! You can now log in with your new password.');
    } catch (err: any) {
      const errCode = err?.code || err?.name || '';
      if (errCode === 'CodeMismatchException') {
        setError('Invalid reset code. Please check and try again.');
      } else if (errCode === 'ExpiredCodeException') {
        setError('Reset code has expired. Please request a new one.');
      } else if (errCode === 'LimitExceededException') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err?.message || 'Password reset failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Request a new code (from the confirm step)
  const handleResendCode = async () => {
    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      await forgotPassword(email);
      setSuccessMessage('A new reset code has been sent to your email.');
      setCode('');
    } catch (err: any) {
      const errCode = err?.code || err?.name || '';
      if (errCode === 'LimitExceededException') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err?.message || 'Failed to resend code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ===================== Step 2: Code + New Password =====================
  if (step === 'confirm') {
    return (
      <div className="auth-form">
        <h2>Reset Your Password</h2>
        <p className="verification-info">
          Enter the reset code sent to <strong>{email}</strong> and choose a new password.
        </p>

        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

        <form onSubmit={handleConfirmReset}>
          <div className="form-group">
            <label htmlFor="resetCode">Reset Code</label>
            <input
              type="text"
              id="resetCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={isLoading}
              placeholder="Enter 6-digit code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={10}
              aria-describedby="reset-code-help"
            />
            <small id="reset-code-help" className="password-requirements">
              Check your email inbox (and spam folder) for the code.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={isLoading}
              placeholder="Enter new password"
              aria-describedby="password-checks"
            />
            {newPassword.length > 0 && (
              <ul className="password-checklist" id="password-checks" aria-label="Password requirements">
                {passwordChecks.map((check) => (
                  <li key={check.label} className={check.met ? 'check-met' : 'check-unmet'}>
                    <span className="check-icon" aria-hidden="true">{check.met ? '✓' : '✗'}</span>
                    {check.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmNewPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmNewPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              placeholder="Confirm new password"
            />
          </div>

          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            Didn't receive the code?{' '}
            <button
              type="button"
              className="link-button"
              onClick={handleResendCode}
              disabled={isLoading}
            >
              Resend code
            </button>
          </p>
          <p>
            <button
              type="button"
              className="link-button"
              onClick={() => onSwitchToLogin()}
              disabled={isLoading}
            >
              Back to login
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ===================== Step 1: Request Reset Code =====================
  return (
    <div className="auth-form">
      <h2>Forgot Password</h2>
      <p className="verification-info">
        Enter your email address and we'll send you a code to reset your password.
      </p>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <form onSubmit={handleRequestCode}>
        <div className="form-group">
          <label htmlFor="forgotEmail">Email</label>
          <input
            type="email"
            id="forgotEmail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            placeholder="Enter your email"
          />
        </div>

        <button type="submit" className="auth-button" disabled={isLoading}>
          {isLoading ? 'Sending…' : 'Send Reset Code'}
        </button>
      </form>

      <div className="auth-switch">
        <p>
          Remember your password?{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => onSwitchToLogin()}
            disabled={isLoading}
          >
            Back to login
          </button>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
