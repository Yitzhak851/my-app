import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import UserProfile from '../components/UserProfile';
import { AuthProvider } from '../auth/AuthContext';
import * as api from '../api/api';

// The route parameter is what the component reads to know whose profile to show.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '11' }) };
});

vi.mock('../api/api');

// Shaped exactly like the real API responses. GET /api/users/<id> returns the
// user at the TOP LEVEL — not wrapped in { user: ... }. The original component
// read `data.user.followers`, which threw and rendered "Failed to load user
// profile" for every profile. These fixtures lock that contract down.
// No `email`: public profiles do not expose it any more.
const USER = {
  id: 11,
  name: 'Sergey Gurin',
  bio: 'Student',
  profile_picture: 'https://example.com/a.svg',
  role: 'user',
  created_at: '2026-01-01T00:00:00',
};

const STATS = { followers: 4, following: 7, posts: 2 };

const POSTS = [
  { id: 101, user_id: 11, title: 'First post', body: '<p>hello</p>', created_at: '2026-01-02T00:00:00' },
  { id: 102, user_id: 11, title: 'Second post', body: '<p>world</p>', created_at: '2026-01-03T00:00:00' },
];

function renderProfile() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <UserProfile />
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('UserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.fetchUser.mockResolvedValue(USER);
    api.fetchFollowStats.mockResolvedValue(STATS);
    api.fetchPosts.mockResolvedValue(POSTS);
    api.checkIfFollowing.mockResolvedValue(false);
  });

  it('requests the profile for the id in the route', async () => {
    renderProfile();
    await waitFor(() => expect(api.fetchUser).toHaveBeenCalledWith('11'));
  });

  it('renders name and bio (requirement 1.b)', async () => {
    renderProfile();
    expect(await screen.findByText('Sergey Gurin')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  it('never renders an email on a public profile', async () => {
    renderProfile();
    await screen.findByText('Sergey Gurin');
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('renders the profile picture', async () => {
    renderProfile();
    const img = await screen.findByAltText(/Sergey Gurin profile picture/i);
    expect(img).toBeInTheDocument();
  });

  it('shows follower and following counts (requirement 1.c.ii)', async () => {
    renderProfile();
    await screen.findByText('Sergey Gurin');
    expect(screen.getByText('Followers:').parentElement).toHaveTextContent('4');
    expect(screen.getByText('Following:').parentElement).toHaveTextContent('7');
  });

  it("lists the user's own posts (requirement 1.b)", async () => {
    renderProfile();
    expect(await screen.findByText('First post')).toBeInTheDocument();
    expect(screen.getByText('Second post')).toBeInTheDocument();
    expect(api.fetchPosts).toHaveBeenCalledWith(0, expect.any(Number), '11');
  });

  it('does NOT show "Failed to load user profile" on a valid response', async () => {
    renderProfile();
    await screen.findByText('Sergey Gurin');
    expect(screen.queryByText(/failed to load user profile/i)).toBeNull();
  });

  it('surfaces an error and offers a retry when the request fails', async () => {
    api.fetchUser.mockRejectedValue(new Error('User not found'));
    renderProfile();
    expect(await screen.findByText('User not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says so when the user has no posts', async () => {
    api.fetchPosts.mockResolvedValue([]);
    renderProfile();
    expect(await screen.findByText(/has no posts yet/i)).toBeInTheDocument();
  });

  // ── the follow button ────────────────────────────────────────────────────

  describe('following', () => {
    const VIEWER = { id: 99, name: 'Viewer', role: 'user' };

    beforeEach(() => {
      api.fetchCurrentUser.mockResolvedValue({ user: VIEWER });
      api.checkIfFollowing.mockResolvedValue(false);
      api.followUser.mockResolvedValue({ message: 'ok' });
      api.unfollowUser.mockResolvedValue({ message: 'ok' });
    });

    it('follows, and the count goes up straight away', async () => {
      renderProfile();
      const button = await screen.findByRole('button', { name: /^follow$/i });

      await userEvent.setup().click(button);

      await waitFor(() => expect(api.followUser).toHaveBeenCalledWith(11));
      expect(await screen.findByRole('button', { name: /^unfollow$/i })).toBeInTheDocument();
      expect(screen.getByText('Followers:').parentElement).toHaveTextContent('5');
    });

    it('unfollows again', async () => {
      api.checkIfFollowing.mockResolvedValue(true);
      renderProfile();
      const button = await screen.findByRole('button', { name: /^unfollow$/i });

      await userEvent.setup().click(button);

      await waitFor(() => expect(api.unfollowUser).toHaveBeenCalledWith(11));
      expect(await screen.findByRole('button', { name: /^follow$/i })).toBeInTheDocument();
      expect(screen.getByText('Followers:').parentElement).toHaveTextContent('3');
    });

    it('puts the button back and explains when the request fails', async () => {
      // A failed click must not take the profile down with it. This used to
      // write to the same `error` state as a failed page load, so one rejected
      // Follow replaced the whole profile with a "Try again" screen.
      api.followUser.mockRejectedValue(new Error('Already following this user'));
      renderProfile();

      await userEvent.setup().click(await screen.findByRole('button', { name: /^follow$/i }));

      expect(await screen.findByText(/already following this user/i)).toBeInTheDocument();
      expect(screen.getByText('Sergey Gurin')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^follow$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
      expect(screen.getByText('Followers:').parentElement).toHaveTextContent('4');
    });

    it('a check still in flight does not undo a click that came after it', async () => {
      // The race this fixes: the button is on screen before the "are you
      // already following?" answer arrives, so it can be pressed first. The
      // late answer — from before the click — used to overwrite the new state,
      // and the screen said "Follow" while the server had recorded the follow.
      let answerTheCheck;
      api.checkIfFollowing.mockReturnValue(new Promise((r) => { answerTheCheck = r; }));

      renderProfile();
      await userEvent.setup().click(await screen.findByRole('button', { name: /^follow$/i }));
      await waitFor(() => expect(api.followUser).toHaveBeenCalled());

      answerTheCheck(false);          // the stale answer lands now

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^unfollow$/i })).toBeInTheDocument());
    });

    it('offers nobody a follow button on their own profile', async () => {
      api.fetchCurrentUser.mockResolvedValue({ user: { id: 11, name: 'Sergey Gurin', role: 'user' } });

      renderProfile();
      await screen.findByText('Sergey Gurin');

      expect(screen.queryByRole('button', { name: /^follow$/i })).not.toBeInTheDocument();
      expect(api.checkIfFollowing).not.toHaveBeenCalled();
    });
  });
});
