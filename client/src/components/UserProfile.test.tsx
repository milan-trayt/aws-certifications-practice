import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserProfile from './UserProfile';

// --- Mocks ---

const mockChangePassword = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    changePassword: mockChangePassword,
  }),
}));

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('../services/api', () => ({
  apiClient: {
    get: (...args: any[]) => mockGet(...args),
    put: (...args: any[]) => mockPut(...args),
  },
  handleApiError: (err: any) =>
    err?.response?.data?.error || 'An unexpected error occurred.',
}));

const profileData = {
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  createdAt: '2024-01-15T10:00:00.000Z',
};

function resolveProfile() {
  mockGet.mockResolvedValue({ data: { data: profileData } });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Tests ---

describe('UserProfile', () => {
  it('renders loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<UserProfile />);
    expect(screen.getByText('Loading profile...')).toBeInTheDocument();
  });

  it('displays profile information after loading', async () => {
    resolveProfile();
    render(<UserProfile />);

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
    // Check all profile info items are displayed
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Doe')).toBeInTheDocument();
  });

  it('shows error when profile fetch fails', async () => {
    mockGet.mockRejectedValue({
      response: { data: { error: 'Network error' } },
    });
    render(<UserProfile />);

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('navigates home when back link is clicked', async () => {
    resolveProfile();
    render(<UserProfile />);

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('← Back to Home'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  describe('Edit Name form', () => {
    it('updates name on successful submit', async () => {
      resolveProfile();
      const updated = { ...profileData, firstName: 'Jane', lastName: 'Smith' };
      mockPut.mockResolvedValue({ data: { data: updated } });

      render(<UserProfile />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('First Name'), {
        target: { value: 'Jane' },
      });
      fireEvent.change(screen.getByLabelText('Last Name'), {
        target: { value: 'Smith' },
      });
      fireEvent.click(screen.getByText('Save Name'));

      expect(await screen.findByText('Name updated successfully.')).toBeInTheDocument();
      expect(mockPut).toHaveBeenCalledWith('/users/profile', {
        firstName: 'Jane',
        lastName: 'Smith',
      });
    });

    it('shows validation error when names are empty', async () => {
      resolveProfile();
      render(<UserProfile />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('First Name'), {
        target: { value: '  ' },
      });
      fireEvent.change(screen.getByLabelText('Last Name'), {
        target: { value: '  ' },
      });
      fireEvent.click(screen.getByText('Save Name'));

      expect(
        await screen.findByText('First name and last name are required.')
      ).toBeInTheDocument();
      expect(mockPut).not.toHaveBeenCalled();
    });
  });

  describe('Change Password form', () => {
    it('changes password successfully', async () => {
      resolveProfile();
      mockChangePassword.mockResolvedValue(undefined);

      render(<UserProfile />);
      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Current Password'), {
        target: { value: 'OldPass1!' },
      });
      fireEvent.change(screen.getByLabelText('New Password'), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

      expect(
        await screen.findByText('Password changed successfully.')
      ).toBeInTheDocument();
      expect(mockChangePassword).toHaveBeenCalledWith('OldPass1!', 'NewPass1!');
    });

    it('shows error when passwords do not match', async () => {
      resolveProfile();
      render(<UserProfile />);
      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Current Password'), {
        target: { value: 'OldPass1!' },
      });
      fireEvent.change(screen.getByLabelText('New Password'), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), {
        target: { value: 'Different!' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

      expect(
        await screen.findByText('New passwords do not match.')
      ).toBeInTheDocument();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it('shows error when old password is incorrect', async () => {
      resolveProfile();
      mockChangePassword.mockRejectedValue({
        message: 'Incorrect username or password.',
        code: 'NotAuthorizedException',
      });

      render(<UserProfile />);
      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Current Password'), {
        target: { value: 'WrongPass!' },
      });
      fireEvent.change(screen.getByLabelText('New Password'), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), {
        target: { value: 'NewPass1!' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

      expect(
        await screen.findByText('Incorrect old password. Please try again.')
      ).toBeInTheDocument();
    });
  });
});
