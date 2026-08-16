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

  it('should render post title', () => {
    renderPost(mockPost);
    const titleElement = screen.getByText('Test Post Title');
    expect(titleElement).toBeTruthy();
  });

  it('should render post body content', () => {
    renderPost(mockPost);
    const bodyElement = screen.getByText(/This is a test post body/i);
    expect(bodyElement).toBeTruthy();
  });

  it('should render user name', () => {
    renderPost(mockPost);
    const nameElement = screen.getByText(/John Doe/i);
    expect(nameElement).toBeTruthy();
  });

  it('shows a neutral label when the post has no author name', () => {
    // The feed no longer carries the author's email, so there is nothing
    // private to fall back to.
    renderPost({ ...mockPost, name: null });
    expect(screen.getByText(/unknown user/i)).toBeTruthy();
  });
});
