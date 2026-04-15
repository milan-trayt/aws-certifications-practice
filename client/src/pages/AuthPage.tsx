import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from '../components/auth/LoginForm';
import RegisterForm from '../components/auth/RegisterForm';
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm';
import './AuthPage.css';

type AuthView = 'login' | 'register' | 'forgot-password';

const AuthPage: React.FC = () => {
  const [view, setView] = useState<AuthView>('login');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSwitchToLogin = (successMessage?: string) => {
    setView('login');
    setLoginSuccessMessage(successMessage || '');
  };

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="loading">Checking authentication...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>AWS Practice Tests</h1>
          <p>Professional certification practice platform</p>
        </div>

        {view === 'login' && (
          <LoginForm
            onSwitchToRegister={() => { setLoginSuccessMessage(''); setView('register'); }}
            onSwitchToForgotPassword={() => { setLoginSuccessMessage(''); setView('forgot-password'); }}
            successMessage={loginSuccessMessage}
          />
        )}
        {view === 'register' && (
          <RegisterForm onSwitchToLogin={() => handleSwitchToLogin()} />
        )}
        {view === 'forgot-password' && (
          <ForgotPasswordForm onSwitchToLogin={handleSwitchToLogin} />
        )}

        <div className="auth-footer">
          <p>
            Prepare for your AWS certification with our comprehensive practice tests.
            Track your progress and improve your skills.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;