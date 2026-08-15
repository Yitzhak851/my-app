import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import * as api from '../api/api';

vi.mock('../api/api');

// The session now lives in an HttpOnly cookie that JavaScript cannot read, so
// the context has to ask the server who is signed in. localStorage is only a
// cache to avoid a blank flash — the server's answer is what counts.

const USER = { id: 1, email: 'dana@example.com', name: 'Dana Levi', role: 'user' };

function Probe() {
  const { currentUser, isLoggedIn, loading, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="state">
        {loading ? 'loading' : isLoggedIn ? `in:${currentUser.email}` : 'out'}
      </div>
      <button onClick={() => login('dana@example.com', 'Password123!')}>Sign in</button>
      <button onClick={() => logout()}>Sign out</button>
    </div>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

const state = () => screen.getByTestId('state').textContent;

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('asks the server who is signed in on load', async () => {
    api.fetchCurrentUser.mockResolvedValue({ user: USER });

    renderAuth();

    await waitFor(() => expect(state()).toBe('in:dana@example.com'));
    expect(api.fetchCurrentUser).toHaveBeenCalled();
  });

  it('ends up signed out when the server says there is no session', async () => {
    const err = new Error('Authentication required');
    err.status = 401;
    api.fetchCurrentUser.mockRejectedValue(err);

    renderAuth();

    await waitFor(() => expect(state()).toBe('out'));
  });

  it('discards a cached user the server does not recognise', async () => {
    // The dangerous case: a stale localStorage entry after the session was
    // revoked. The cache must not be able to keep the UI "signed in".
    localStorage.setItem('currentUser', JSON.stringify(USER));
    const err = new Error('Authentication required');
    err.status = 401;
    api.fetchCurrentUser.mockRejectedValue(err);

    renderAuth();

    await waitFor(() => expect(state()).toBe('out'));
    expect(localStorage.getItem('currentUser')).toBeNull();
  });

  it('signs in through the API and keeps the returned user', async () => {
    const err = new Error('Authentication required');
    err.status = 401;
    api.fetchCurrentUser.mockRejectedValue(err);
    api.login.mockResolvedValue({ user: USER });

    renderAuth();
    await waitFor(() => expect(state()).toBe('out'));

    await userEvent.click(screen.getByText('Sign in'));

    await waitFor(() => expect(state()).toBe('in:dana@example.com'));
    expect(api.login).toHaveBeenCalledWith('dana@example.com', 'Password123!');
  });

  it('calls the server on sign out, not just localStorage', async () => {
    api.fetchCurrentUser.mockResolvedValue({ user: USER });
    api.logout.mockResolvedValue({ message: 'Logged out' });

    renderAuth();
    await waitFor(() => expect(state()).toBe('in:dana@example.com'));

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => expect(state()).toBe('out'));
    // Clearing localStorage alone would leave the session alive on the server.
    expect(api.logout).toHaveBeenCalled();
    expect(localStorage.getItem('currentUser')).toBeNull();
  });

  it('still signs out locally if the logout request fails', async () => {
    api.fetchCurrentUser.mockResolvedValue({ user: USER });
    api.logout.mockRejectedValue(new Error('network down'));

    renderAuth();
    await waitFor(() => expect(state()).toBe('in:dana@example.com'));

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => expect(state()).toBe('out'));
  });

  it('logout never rejects, so callers cannot leak an unhandled rejection', async () => {
    // A rejecting logout() showed up as "Unhandled Rejection" in the test run
    // and as a red error in the browser console, because neither the toolbar
    // nor an onClick handler wraps the call.
    api.fetchCurrentUser.mockResolvedValue({ user: USER });
    api.logout.mockRejectedValue(new Error('network down'));

    let capturedLogout;
    function Grab() {
      capturedLogout = useAuth().logout;
      return null;
    }
    render(
      <AuthProvider>
        <Grab />
      </AuthProvider>
    );

    await waitFor(() => expect(capturedLogout).toBeTypeOf('function'));
    await expect(capturedLogout()).resolves.toBeUndefined();
  });

  it('survives a corrupted cache entry without crashing', async () => {
    localStorage.setItem('currentUser', '{not valid json');
    api.fetchCurrentUser.mockResolvedValue({ user: USER });

    renderAuth();

    await waitFor(() => expect(state()).toBe('in:dana@example.com'));
  });
});
