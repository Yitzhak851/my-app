import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../components/Login';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render email input field', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    // MUI renders a <label>, not a placeholder.
    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toBeTruthy();
  });

  it('should render password input field', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toBeTruthy();
  });

  it('should render login button', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    const loginButton = screen.getByRole('button', { name: /sign in|login|התחבר/i });
    expect(loginButton).toBeTruthy();
  });
});
