import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '@/pages/Auth/LoginPage';
import { SignUpPage } from '@/pages/Auth/SignUpPage';
import { renderWithRouter } from '@/test/test-utils';
import { useAuthStore } from '@/store/useAuthStore';

describe('Authentication and Account Creation Pages', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      loginActivity: [],
    });
  });

  describe('LoginPage', () => {
    it('renders login form inputs and controls', () => {
      renderWithRouter(<LoginPage />, { route: '/login' });

      expect(screen.getByPlaceholderText(/Email address/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/^Password$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Remember this device/i)).toBeInTheDocument();
    });

    it('requires email and password to submit', async () => {
      const user = userEvent.setup();
      renderWithRouter(<LoginPage />, { route: '/login' });

      await user.click(screen.getByRole('button', { name: /^Sign In$/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/Please enter your email and password/i);
    });

    it('submits user credentials to authenticate', async () => {
      const user = userEvent.setup();
      renderWithRouter(<LoginPage />, { route: '/login' });

      await user.type(screen.getByPlaceholderText(/Email address/i), 'user@apiforge.dev');
      await user.type(screen.getByPlaceholderText(/^Password$/i), 'SecurePass123!');
      await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

      expect(screen.queryByText(/Please enter your email and password/i)).not.toBeInTheDocument();
    });
  });

  describe('SignUpPage', () => {
    it('renders sign up form with password strength requirements', () => {
      renderWithRouter(<SignUpPage />, { route: '/signup' });

      expect(screen.getByPlaceholderText(/Full name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Email address/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/^Password$/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Account & Sign In/i })).toBeInTheDocument();
    });

    it('validates matching passwords and displays strength criteria', async () => {
      const user = userEvent.setup();
      renderWithRouter(<SignUpPage />, { route: '/signup' });

      const nameInput = screen.getByPlaceholderText(/Full name/i);
      const emailInput = screen.getByPlaceholderText(/Email address/i);
      const passInput = screen.getByPlaceholderText(/^Password$/i);
      const confirmInput = screen.getByPlaceholderText(/Confirm password/i);

      await user.type(nameInput, 'Sarah Connor');
      await user.type(emailInput, 'sarah@resistance.org');
      await user.type(passInput, 'Weak');
      await user.type(confirmInput, 'Different');

      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
      expect(screen.getByText(/Strength: Weak/i)).toBeInTheDocument();
    });
  });
});
