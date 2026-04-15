import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient, handleApiError } from '../services/api';
import { ChevronLeft } from 'lucide-react';
import './UserProfile.css';

interface ProfileData {
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

const UserProfile: React.FC = () => {
  const { changePassword } = useAuth();
  const navigate = useNavigate();

  // Profile info state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  // Edit name form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');

  // Change password form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setProfileLoading(true);
      setProfileError('');
      const res = await apiClient.get<{ data: ProfileData }>('/users/profile');
      const data = res.data.data;
      setProfile(data);
      setFirstName(data.firstName || '');
      setLastName(data.lastName || '');
    } catch (err) {
      setProfileError(handleApiError(err));
    } finally {
      setProfileLoading(false);
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess('');

    if (!firstName.trim() || !lastName.trim()) {
      setNameError('First name and last name are required.');
      return;
    }

    try {
      setNameLoading(true);
      const res = await apiClient.put<{ data: ProfileData }>('/users/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      const data = res.data.data;
      setProfile(data);
      setFirstName(data.firstName || '');
      setLastName(data.lastName || '');
      setNameSuccess('Name updated successfully.');
    } catch (err) {
      setNameError(handleApiError(err));
    } finally {
      setNameLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    try {
      setPasswordLoading(true);
      await changePassword(oldPassword, newPassword);
      setPasswordSuccess('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const message =
        err?.message || err?.code || 'Failed to change password.';
      if (
        message.includes('Incorrect') ||
        message.includes('NotAuthorizedException') ||
        message.includes('incorrect')
      ) {
        setPasswordError('Incorrect old password. Please try again.');
      } else {
        setPasswordError(message);
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="user-profile">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className="user-profile">
        <div className="profile-error">{profileError}</div>
        <button className="profile-back-link" onClick={() => navigate('/')}>
          <ChevronLeft size={14} style={{verticalAlign: 'middle'}} /> Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <button className="profile-back-link" onClick={() => navigate('/')}>
        <ChevronLeft size={14} style={{verticalAlign: 'middle'}} /> Back to Home
      </button>
      <h2 className="profile-heading">My Profile</h2>

      {/* Section 1: Profile Info Display */}
      <section className="profile-section" aria-label="Profile information">
        <h3>Account Information</h3>
        <div className="profile-info-grid">
          <div className="profile-info-item">
            <label>Email</label>
            <span>{profile?.email}</span>
          </div>
          <div className="profile-info-item">
            <label>Member Since</label>
            <span>
              {profile?.createdAt
                ? new Date(profile.createdAt).toLocaleDateString()
                : '—'}
            </span>
          </div>
          <div className="profile-info-item">
            <label>First Name</label>
            <span>{profile?.firstName || '—'}</span>
          </div>
          <div className="profile-info-item">
            <label>Last Name</label>
            <span>{profile?.lastName || '—'}</span>
          </div>
        </div>
      </section>

      {/* Section 2: Edit Name Form */}
      <section className="profile-section" aria-label="Edit name">
        <h3>Edit Name</h3>
        {nameError && <div className="profile-error">{nameError}</div>}
        {nameSuccess && <div className="profile-success">{nameSuccess}</div>}
        <form className="profile-form" onSubmit={handleNameSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={nameLoading}
                maxLength={100}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={nameLoading}
                maxLength={100}
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="profile-save-btn"
            disabled={nameLoading}
          >
            {nameLoading ? 'Saving...' : 'Save Name'}
          </button>
        </form>
      </section>

      {/* Section 3: Change Password Form */}
      <section className="profile-section" aria-label="Change password">
        <h3>Change Password</h3>
        {passwordError && (
          <div className="profile-error">{passwordError}</div>
        )}
        {passwordSuccess && (
          <div className="profile-success">{passwordSuccess}</div>
        )}
        <form className="profile-form" onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label htmlFor="oldPassword">Current Password</label>
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              disabled={passwordLoading}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
              minLength={8}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={passwordLoading}
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            className="profile-save-btn"
            disabled={passwordLoading}
          >
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </section>
    </div>
  );
};

export default UserProfile;
