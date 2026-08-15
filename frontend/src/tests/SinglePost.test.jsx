import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SinglePost from '../components/SinglePost';

describe('SinglePost Component', () => {
  const mockPost = {
    id: 1,
    title: 'Test Post Title',
    body: 'This is a test post body',
    name: 'John Doe',
    email: 'john@example.com',
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

  it('should fall back to the email when the post has no name', () => {
    // SinglePost renders `post.name || post.email`, so the email only appears
    // when name is absent. The previous version of this test asserted the
    // impossible: that both render at once.
    render(<SinglePost post={{ ...mockPost, name: null }} />);
    const emailElement = screen.getByText(/john@example.com/i);
    expect(emailElement).toBeTruthy();
  });
});
