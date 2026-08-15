import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchUser,
  fetchPosts,
  checkIfFollowing,
  login,
} from '../api/api';

// These tests lock down the two response-shape mistakes that broke the profile
// page, so neither can come back silently.

function mockFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
  });
}

describe('api client', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetchUser returns the user object itself, not a wrapper', async () => {
    // The backend responds with the user at the top level.
    const user = { id: 11, name: 'Sergey Gurin', email: 's@runi.com' };
    vi.stubGlobal('fetch', mockFetch(user));

    const result = await fetchUser(11);

    expect(result.id).toBe(11);
    expect(result.name).toBe('Sergey Gurin');
    // The old component expected result.user — guard against that returning.
    expect(result.user).toBeUndefined();
  });

  it('checkIfFollowing reads the snake_case field and returns a boolean', async () => {
    vi.stubGlobal('fetch', mockFetch({ is_following: true }));
    await expect(checkIfFollowing(1, 2)).resolves.toBe(true);

    vi.stubGlobal('fetch', mockFetch({ is_following: false }));
    await expect(checkIfFollowing(1, 2)).resolves.toBe(false);
  });

  it('fetchPosts filters by user id when one is given', async () => {
    const spy = mockFetch([]);
    vi.stubGlobal('fetch', spy);

    await fetchPosts(0, 20, 11);

    const url = spy.mock.calls[0][0];
    expect(url).toContain('/posts/');
    expect(url).toContain('userId=11');
  });

  it('omits empty query parameters instead of sending "undefined"', async () => {
    const spy = mockFetch([]);
    vi.stubGlobal('fetch', spy);

    await fetchPosts(0, 10);

    expect(spy.mock.calls[0][0]).not.toContain('userId');
  });

  it('raises the error message the server sent', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Invalid credentials' }, { ok: false, status: 401 }));
    await expect(login('a@b.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });

  it('explains a network failure in plain language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchUser(1)).rejects.toThrow(/Is the backend running/i);
  });
});
