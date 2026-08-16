import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SinglePost from '../components/SinglePost';
import { AuthProvider } from '../auth/AuthContext';
import * as api from '../api/api';

// SinglePost renders the like/comment bar, which reads the auth context.
vi.mock('../api/api');

const renderPost = (post) =>
  render(
    <AuthProvider>
      <SinglePost post={post} />
    </AuthProvider>
  );

describe('SinglePost Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const err = new Error('Authentication required');
    err.status = 401;
    api.fetchCurrentUser.mockRejectedValue(err);
  });

  const mockPost = {
    id: 1,
    title: 'Test Post Title',
    body: 'This is a test post body',
    name: 'John Doe',
    profile_picture: 'https://example.com/avatar.jpg',
    user_id: 1,
    created_at: '2024-01-01T00:00:00',
  };

  it('renders the title, the body and the author', () => {
    renderPost(mockPost);

    expect(screen.getByText('Test Post Title')).toBeInTheDocument();
    expect(screen.getByText(/This is a test post body/i)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
  });

  it('shows a neutral label when the post has no author name', () => {
    // The feed no longer carries the author's email, so there is nothing
    // private to fall back to.
    renderPost({ ...mockPost, name: null });

    expect(screen.getByText(/unknown user/i)).toBeInTheDocument();
  });

  it("never renders the author's email address", () => {
    // The feed projection used to include it, so every post published the
    // author's address to anyone who could read the page.
    renderPost({ ...mockPost, email: 'john@example.com' });

    expect(screen.queryByText(/john@example.com/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('@example.com');
  });

  it('renders the body as HTML, not as escaped markup', () => {
    // The composer stores Quill's HTML; showing the tags as text would make
    // every formatted post unreadable.
    renderPost({ ...mockPost, body: '<p>bold <strong>bit</strong></p>' });

    expect(screen.getByText('bit').tagName).toBe('STRONG');
  });

  it('strips script out of a post body before rendering it', () => {
    // Stored XSS: the body is written by another user and rendered with
    // dangerouslySetInnerHTML, so it has to be sanitised first.
    renderPost({ ...mockPost, body: '<p>hi</p><script>window.pwned = 1</script>' });

    expect(document.body.innerHTML).not.toContain('<script>');
    expect(window.pwned).toBeUndefined();
  });

  it('shows when the post was written, not a raw timestamp', () => {
    const minutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();

    renderPost({ ...mockPost, created_at: minutesAgo });

    expect(screen.getByText(/לפני 5 דקות/)).toBeInTheDocument();
  });
});
