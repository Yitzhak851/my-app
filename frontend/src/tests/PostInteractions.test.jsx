import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostInteractions from '../components/PostInteractions';
import { AuthProvider } from '../auth/AuthContext';
import * as api from '../api/api';

vi.mock('../api/api');

const USER = { id: 1, email: 'dana@example.com', name: 'Dana Levi', role: 'user' };

const POST = {
  id: 7,
  user_id: 2,
  title: 'A post',
  like_count: 3,
  comment_count: 1,
  liked_by_me: false,
};

function renderInteractions(post = POST) {
  return render(
    <AuthProvider>
      <PostInteractions post={post} />
    </AuthProvider>
  );
}

async function renderSignedIn(post = POST) {
  api.fetchCurrentUser.mockResolvedValue({ user: USER });
  renderInteractions(post);
  await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
}

async function renderSignedOut(post = POST) {
  const err = new Error('Authentication required');
  err.status = 401;
  api.fetchCurrentUser.mockRejectedValue(err);
  renderInteractions(post);
  await screen.findByText(/sign in to like and comment/i);
}

describe('Likes (requirement 2.b.i)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the like count that came with the post', async () => {
    await renderSignedIn();
    expect(screen.getByTestId('like-count')).toHaveTextContent('3');
  });

  it('likes a post and takes the count from the server', async () => {
    api.likePost.mockResolvedValue({ liked: true, count: 4 });
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /like this post/i }));

    await waitFor(() => expect(screen.getByTestId('like-count')).toHaveTextContent('4'));
    expect(api.likePost).toHaveBeenCalledWith(7);
  });

  it('unlikes a post that is already liked', async () => {
    api.unlikePost.mockResolvedValue({ liked: false, count: 2 });
    await renderSignedIn({ ...POST, liked_by_me: true });

    await userEvent.click(screen.getByRole('button', { name: /unlike this post/i }));

    await waitFor(() => expect(screen.getByTestId('like-count')).toHaveTextContent('2'));
    expect(api.unlikePost).toHaveBeenCalledWith(7);
  });

  it('rolls the count back when the request fails', async () => {
    api.likePost.mockRejectedValue(new Error('network down'));
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /like this post/i }));

    // Optimistic 4, then back to 3 once the server refuses.
    await waitFor(() => expect(screen.getByTestId('like-count')).toHaveTextContent('3'));
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });

  it('does not let a signed-out visitor like', async () => {
    await renderSignedOut();
    expect(screen.getByRole('button', { name: /like this post/i })).toBeDisabled();
  });
});

describe('Comments (requirement 2.b.ii)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('loads comments only when the section is opened', async () => {
    api.fetchComments.mockResolvedValue([]);
    await renderSignedIn();

    // A feed of 10 posts should not fire 10 comment requests on load.
    expect(api.fetchComments).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));

    await waitFor(() => expect(api.fetchComments).toHaveBeenCalledWith(7));
  });

  it('renders the comments it loaded', async () => {
    api.fetchComments.mockResolvedValue([
      { id: 1, post_id: 7, user_id: 2, body: 'Nice one', name: 'Omri', created_at: '2026-01-01T00:00:00' },
    ]);
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));

    expect(await screen.findByText('Nice one')).toBeInTheDocument();
    expect(screen.getByText('Omri')).toBeInTheDocument();
  });

  it('adds a new comment and bumps the count', async () => {
    api.fetchComments.mockResolvedValue([]);
    api.createComment.mockResolvedValue({
      comment: { id: 9, post_id: 7, user_id: 1, body: 'My thoughts', name: 'Dana Levi', created_at: '2026-01-02T00:00:00' },
    });
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));
    await userEvent.type(await screen.findByLabelText(/write a comment/i), 'My thoughts');
    await userEvent.click(screen.getByRole('button', { name: /^comment$/i }));

    expect(await screen.findByText('My thoughts')).toBeInTheDocument();
    expect(api.createComment).toHaveBeenCalledWith(7, 'My thoughts');
    expect(screen.getByRole('button', { name: /2 comments/i })).toBeInTheDocument();
  });

  it('will not submit an empty comment', async () => {
    api.fetchComments.mockResolvedValue([]);
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));

    expect(await screen.findByRole('button', { name: /^comment$/i })).toBeDisabled();
  });

  it('offers Delete on your own comment only', async () => {
    api.fetchComments.mockResolvedValue([
      { id: 1, post_id: 7, user_id: 1, body: 'mine', name: 'Dana Levi', created_at: '2026-01-01T00:00:00' },
      { id: 2, post_id: 7, user_id: 2, body: 'theirs', name: 'Omri', created_at: '2026-01-01T00:00:00' },
    ]);
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));
    await screen.findByText('mine');

    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(1);
  });

  it('offers Delete on every comment for a moderator', async () => {
    api.fetchCurrentUser.mockResolvedValue({ user: { ...USER, role: 'moderator' } });
    api.fetchComments.mockResolvedValue([
      { id: 1, post_id: 7, user_id: 1, body: 'mine', name: 'Dana Levi', created_at: '2026-01-01T00:00:00' },
      { id: 2, post_id: 7, user_id: 2, body: 'theirs', name: 'Omri', created_at: '2026-01-01T00:00:00' },
    ]);
    renderInteractions();
    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));
    await screen.findByText('mine');

    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
  });

  it('does not offer a comment box to a signed-out visitor', async () => {
    api.fetchComments.mockResolvedValue([]);
    await renderSignedOut();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));

    await waitFor(() => expect(api.fetchComments).toHaveBeenCalled());
    expect(screen.queryByLabelText(/write a comment/i)).toBeNull();
  });

  it('renders a comment body as text, never as HTML', async () => {
    api.fetchComments.mockResolvedValue([
      { id: 1, post_id: 7, user_id: 2, body: '<img src=x onerror=alert(1)>', name: 'Omri', created_at: '2026-01-01T00:00:00' },
    ]);
    await renderSignedIn();

    await userEvent.click(screen.getByRole('button', { name: /1 comment/i }));

    // The markup shows up as literal characters, and no element was created.
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
