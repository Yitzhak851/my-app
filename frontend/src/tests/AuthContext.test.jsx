import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  function TestComponent() {
    const { currentUser, isLoggedIn, login, logout } = useAuth();

    return (
      <div>
        {isLoggedIn ? (
          <>
            <div>Logged in as: {currentUser?.email}</div>
            <button onClick={() => logout()}>Logout</button>
          </>
        ) : (
          <>
            <div>Not logged in</div>
            <button
              onClick={() =>
                login({
                  id: 1,
                  email: 'test@example.com',
                  name: 'Test User',
                })
              }
            >
              Login
            </button>
          </>
        )}
      </div>
    );
  }

  it('should login user and save to localStorage', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const loginButton = screen.getByText('Login');
    loginButton.click();

    await waitFor(() => {
      expect(screen.getByText(/Logged in as: test@example.com/i)).toBeTruthy();
    });

    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it('should logout user and clear localStorage', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const loginButton = screen.getByText('Login');
    loginButton.click();

    await waitFor(() => {
      expect(screen.getByText(/Logged in as: test@example.com/i)).toBeTruthy();
    });

    const logoutButton = screen.getByText('Logout');
    logoutButton.click();

    await waitFor(() => {
      expect(screen.getByText('Not logged in')).toBeTruthy();
    });

    expect(localStorage.removeItem).toHaveBeenCalled();
  });

  it('should initialize with user from localStorage', () => {
    const mockUser = {
      id: 1,
      email: 'stored@example.com',
      name: 'Stored User',
    };

    localStorage.getItem.mockReturnValue(JSON.stringify(mockUser));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(localStorage.getItem).toHaveBeenCalledWith('currentUser');
  });
});
