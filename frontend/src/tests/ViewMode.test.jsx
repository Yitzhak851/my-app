import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Feed from '../components/Feed';
import ViewModeToggle from '../components/ViewModeToggle';
import { VIEW_MODES, gridColumnsFor } from '../components/viewMode';
import { AuthProvider } from '../auth/AuthContext';
import * as api from '../api/api';

vi.mock('../api/api');

// The feed rendered Grid/List buttons and changed its own container, but never
// passed viewMode down to SinglePost — so every card stayed in list layout and
// the buttons looked broken. These tests assert the value actually reaches the
// card, which is the part that was missing.
vi.mock('../components/SinglePost', () => ({
  default: ({ post, viewMode }) => (
    <div data-testid="post" data-view-mode={viewMode}>
      {post.title}
    </div>
  ),
}));

const POSTS = [
  { id: 1, user_id: 1, title: 'Post one', body: '<p>a</p>', created_at: '2026-01-01T00:00:00' },
  { id: 2, user_id: 2, title: 'Post two', body: '<p>b</p>', created_at: '2026-01-02T00:00:00' },
];

const renderFeed = () =>
  render(
    <BrowserRouter>
      <AuthProvider>
        <Feed />
      </AuthProvider>
    </BrowserRouter>
  );

describe('gridColumnsFor', () => {
  it('returns a multi-column track in grid mode', () => {
    expect(gridColumnsFor(VIEW_MODES.GRID, 320)).toBe('repeat(auto-fill, minmax(320px, 1fr))');
  });

  it('returns a single column in list mode', () => {
    expect(gridColumnsFor(VIEW_MODES.LIST, 320)).toBe('1fr');
  });
});

describe('ViewModeToggle', () => {
  it('marks the active mode as pressed', () => {
    render(<ViewModeToggle value={VIEW_MODES.GRID} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the mode the user picked', async () => {
    const onChange = vi.fn();
    render(<ViewModeToggle value={VIEW_MODES.GRID} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith(VIEW_MODES.LIST);
  });
});

describe('Feed view mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.fetchPosts.mockResolvedValue(POSTS);
  });

  it('passes the view mode down to every post card', async () => {
    renderFeed();
    await waitFor(() => expect(screen.getAllByTestId('post')).toHaveLength(2));

    for (const card of screen.getAllByTestId('post')) {
      // The regression: this attribute was undefined, so cards fell back to "list".
      expect(card).toHaveAttribute('data-view-mode', VIEW_MODES.GRID);
    }
  });

  it('updates every card when the user switches to list', async () => {
    renderFeed();
    await waitFor(() => expect(screen.getAllByTestId('post')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'List' }));

    await waitFor(() => {
      for (const card of screen.getAllByTestId('post')) {
        expect(card).toHaveAttribute('data-view-mode', VIEW_MODES.LIST);
      }
    });
  });

  it('keeps the chosen mode when switching back to grid', async () => {
    renderFeed();
    await waitFor(() => expect(screen.getAllByTestId('post')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('post')[0]).toHaveAttribute('data-view-mode', VIEW_MODES.GRID);
    });
  });
});
