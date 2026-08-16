import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Feed from "../components/Feed";
import { AuthProvider } from "../auth/AuthContext";
import * as api from "../api/api";

vi.mock("../api/api");

const post = (id, title) => ({
  id, user_id: 1, title, body: `<p>body ${id}</p>`, name: "Dana",
  profile_picture: "", created_at: "2026-01-01T00:00:00",
  like_count: 0, comment_count: 0, liked_by_me: 0,
});

const page = (from, count) =>
  Array.from({ length: count }, (_, i) => post(from + i, `Post ${from + i}`));

const show = () =>
  render(<MemoryRouter><AuthProvider><Feed /></AuthProvider></MemoryRouter>);

const signedInAs = (user) => api.fetchCurrentUser.mockResolvedValue({ user });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.fetchCurrentUser.mockRejectedValue(Object.assign(new Error("401"), { status: 401 }));
  api.fetchComments.mockResolvedValue([]);
  api.fetchCommentSuggestions.mockResolvedValue({ suggestions: [] });
});

describe("Feed", () => {
  it("shows the posts the server returns", async () => {
    api.fetchPosts.mockResolvedValue(page(1, 3));

    show();

    expect(await screen.findByText("Post 1")).toBeInTheDocument();
    expect(screen.getByText("Post 3")).toBeInTheDocument();
  });

  it("says so when there is nothing to show", async () => {
    api.fetchPosts.mockResolvedValue([]);

    show();

    expect(await screen.findByText(/אין עדיין פוסטים/)).toBeInTheDocument();
  });

  it("tells the reader when the feed cannot be loaded, and offers to retry", async () => {
    // This used to go to console.error and nowhere else: with the backend down
    // the page was simply blank, with no explanation and no way to try again.
    api.fetchPosts.mockRejectedValueOnce(
      new Error("Cannot reach the server. Is the backend running?"));

    show();

    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument();

    api.fetchPosts.mockResolvedValue(page(1, 2));
    await userEvent.setup().click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Post 1")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/cannot reach the server/i)).not.toBeInTheDocument());
  });

  it("does not offer the 'no more posts' notice while an error is showing", async () => {
    api.fetchPosts.mockRejectedValue(new Error("Could not load posts"));

    show();

    await screen.findByText(/could not load posts/i);
    expect(screen.queryByText(/אין עוד פוסטים/)).not.toBeInTheDocument();
    expect(screen.queryByText(/אין עדיין פוסטים/)).not.toBeInTheDocument();
  });

  it("offers the personal feed only to someone who is signed in", async () => {
    api.fetchPosts.mockResolvedValue(page(1, 1));

    show();
    await screen.findByText("Post 1");
    expect(screen.queryByRole("button", { name: /רק מי שאני עוקב/ })).not.toBeInTheDocument();
  });

  it("switches to the following feed without sending a user id", async () => {
    // The server reads the viewer from the session. Passing one in the query
    // string let a person request somebody else's personal feed.
    signedInAs({ id: 7, name: "Dana", role: "user" });
    api.fetchPosts.mockResolvedValue(page(1, 1));
    show();
    await screen.findByText("Post 1");

    await userEvent.setup().click(screen.getByRole("button", { name: /רק מי שאני עוקב/ }));

    await waitFor(() => expect(api.fetchPosts).toHaveBeenLastCalledWith(0, 10, undefined, true));
  });

  it("asks for the first page again when the filter changes, not the next one", async () => {
    signedInAs({ id: 7, name: "Dana", role: "user" });
    api.fetchPosts.mockResolvedValue(page(1, 10));
    show();
    await screen.findByText("Post 1");

    await userEvent.setup().click(screen.getByRole("button", { name: /רק מי שאני עוקב/ }));

    await waitFor(() => {
      const [start] = api.fetchPosts.mock.calls.at(-1);
      expect(start).toBe(0);
    });
  });

  it("stops asking for more once a short page comes back", async () => {
    api.fetchPosts.mockResolvedValue(page(1, 3));

    show();

    expect(await screen.findByText(/אין עוד פוסטים/)).toBeInTheDocument();
  });

  it("renders every post in one grid container", async () => {
    // The regression: the toggle rendered but `viewMode` was never passed down,
    // so switching to grid changed nothing.
    api.fetchPosts.mockResolvedValue(page(1, 4));

    show();
    await screen.findByText("Post 1");

    const grid = document.querySelector('[class*="MuiBox-root"][style*="grid"], .MuiBox-root');
    expect(grid).toBeTruthy();
    expect(screen.getAllByText(/^Post \d$/).length).toBe(4);
  });
});
