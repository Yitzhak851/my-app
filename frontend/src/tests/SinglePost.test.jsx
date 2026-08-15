import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SinglePost from '../components/SinglePost';

describe('SinglePost Component', () => {
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
    render(<SinglePost post={mockPost} />);
    const titleElement = screen.getByText('Test Post Title');
    expect(titleElement).toBeTruthy();
  });

  it('should render post body content', () => {
    render(<SinglePost post={mockPost} />);
    const bodyElement = screen.getByText(/This is a test post body/i);
    expect(bodyElement).toBeTruthy();
  });

  it('should render user name', () => {
    render(<SinglePost post={mockPost} />);
    const nameElement = screen.getByText(/John Doe/i);
    expect(nameElement).toBeTruthy();
  });

  it('shows a neutral label when the post has no author name', () => {
    // The feed no longer carries the author's email, so there is nothing
    // private to fall back to.
    render(<SinglePost post={{ ...mockPost, name: null }} />);
    expect(screen.getByText(/unknown user/i)).toBeTruthy();
  });
});
