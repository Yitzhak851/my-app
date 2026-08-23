import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SuggestedUsers from "../components/SuggestedUsers";
import { AuthProvider } from "../auth/AuthContext";
import * as api from "../api/api";

// Optional requirement 3.e.i.

vi.mock("../api/api");

const SUGGESTIONS = [
  {
    id: 5, name: "Gil Bar", bio: "", profile_picture: "", is_agent: false,
    basis: "mutual", mutual_count: 2, reason: "Followed by 2 people you follow",
  },
  {
    id: 6, name: "Hila Ron", bio: "", profile_picture: "", is_agent: false,
    basis: "mutual", mutual_count: 1, reason: "Followed by 1 person you follow",
  },
  {
    id: 7, name: "Night Owl", bio: "", profile_picture: "", is_agent: true,
    basis: "popular", mutual_count: 0, reason: "Popular right now",
  },
];

const show = () =>
  render(<MemoryRouter><AuthProvider><SuggestedUsers /></AuthProvider></MemoryRouter>);

const signedIn = () =>
  api.fetchCurrentUser.mockResolvedValue({ user: { id: 1, name: "Dana", role: "user" } });
const signedOut = () =>
  api.fetchCurrentUser.mockRejectedValue(Object.assign(new Error("401"), { status: 401 }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  signedIn();
  api.fetchSuggestedUsers.mockResolvedValue(SUGGESTIONS);
  api.followUser.mockResolvedValue({ message: "ok" });
});

describe("SuggestedUsers", () => {
  it("lists who to follow next", async () => {
    show();

    expect(await screen.findByText("Gil Bar")).toBeInTheDocument();
    expect(screen.getByText("Hila Ron")).toBeInTheDocument();
    expect(screen.getByText("Night Owl")).toBeInTheDocument();
  });

  it("says why each person is being suggested", async () => {
    // A name on its own is not a recommendation; the shared connections are
    // the whole reason this list is worth showing.
    show();

    expect(await screen.findByText("Followed by 2 people you follow")).toBeInTheDocument();
    expect(screen.getByText("Followed by 1 person you follow")).toBeInTheDocument();
    expect(screen.getByText("Popular right now")).toBeInTheDocument();
  });

  it("keeps the server's order — the strongest connection first", async () => {
    show();
    await screen.findByText("Gil Bar");

    const names = screen.getAllByRole("link").map((a) => a.textContent);
    expect(names).toEqual(["Gil Bar", "Hila Ron", "Night Owl"]);
  });

  it("links each suggestion to that profile", async () => {
    show();

    expect(await screen.findByRole("link", { name: "Gil Bar" }))
      .toHaveAttribute("href", "/users/5");
  });

  it("marks the agent accounts", async () => {
    show();
    await screen.findByText("Night Owl");

    expect(screen.getByText("agent")).toBeInTheDocument();
  });

  it("follows someone and takes them off the list", async () => {
    // The panel is about who is not followed yet, so a followed row has no
    // business staying in it.
    show();
    const row = (await screen.findByText("Gil Bar")).closest("div").parentElement;

    await userEvent.setup().click(within(row).getByRole("button", { name: /follow/i }));

    await waitFor(() => expect(api.followUser).toHaveBeenCalledWith(5));
    await waitFor(() => expect(screen.queryByText("Gil Bar")).not.toBeInTheDocument());
    expect(screen.getByText("Hila Ron")).toBeInTheDocument();
  });

  it("keeps the row and explains when following fails", async () => {
    api.followUser.mockRejectedValue(new Error("Already following this user"));
    show();
    const row = (await screen.findByText("Gil Bar")).closest("div").parentElement;

    await userEvent.setup().click(within(row).getByRole("button", { name: /follow/i }));

    expect(await screen.findByText(/already following this user/i)).toBeInTheDocument();
    expect(screen.getByText("Gil Bar")).toBeInTheDocument();
  });

  it("cannot be double-clicked into following twice", async () => {
    let finishTheRequest;
    api.followUser.mockReturnValue(new Promise((r) => { finishTheRequest = r; }));
    show();
    const row = (await screen.findByText("Gil Bar")).closest("div").parentElement;
    const button = within(row).getByRole("button", { name: /follow/i });
    const user = userEvent.setup();

    await user.click(button);
    expect(button).toBeDisabled();

    // fireEvent rather than userEvent: userEvent refuses to click a disabled
    // button at all, which would prove only that the test knows it is
    // disabled. Dispatching the event anyway checks that nothing happens.
    fireEvent.click(button);

    finishTheRequest({});
    await waitFor(() => expect(api.followUser).toHaveBeenCalledTimes(1));
  });

  it("shows nothing at all to someone who is not signed in", async () => {
    // These describe your own follow graph. There is nothing to show, and
    // nothing to ask the server for.
    signedOut();

    show();

    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
    expect(screen.queryByTestId("suggested-users")).not.toBeInTheDocument();
    expect(api.fetchSuggestedUsers).not.toHaveBeenCalled();
  });

  it("disappears rather than showing an empty box", async () => {
    api.fetchSuggestedUsers.mockResolvedValue([]);

    show();

    await waitFor(() => expect(api.fetchSuggestedUsers).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("suggested-users")).not.toBeInTheDocument());
  });

  it("survives a response that is not a list", async () => {
    api.fetchSuggestedUsers.mockResolvedValue({ error: "boom" });

    show();

    await waitFor(() => expect(api.fetchSuggestedUsers).toHaveBeenCalled());
    expect(screen.queryByTestId("suggested-users")).not.toBeInTheDocument();
  });

  it("reports a failure instead of failing silently", async () => {
    api.fetchSuggestedUsers.mockRejectedValue(new Error("Could not load suggestions"));

    show();

    expect(await screen.findByText(/could not load suggestions/i)).toBeInTheDocument();
  });

  it("asks for a sidebar-sized list, not the whole directory", async () => {
    show();

    await waitFor(() => expect(api.fetchSuggestedUsers).toHaveBeenCalledWith(5));
  });
});
