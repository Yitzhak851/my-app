import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Users from "../components/Users";
import Search from "../components/Search";
import User from "../components/User";
import * as api from "../api/api";

vi.mock("../api/api");

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const person = (id, name, extra = {}) => ({
  id, name, bio: `bio ${id}`, profile_picture: `https://example.com/${id}.svg`, ...extra,
});

const page = (from, count) =>
  Array.from({ length: count }, (_, i) => person(from + i, `User ${from + i}`));

const show = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
});

// ───────────────────────────────────────────────────────────── the table ────

describe("Users", () => {
  it("lists the users the server returns", async () => {
    api.fetchUsers.mockResolvedValue([person(1, "Dana"), person(2, "Ruth")]);

    show(<Users />);

    expect(await screen.findByText("Dana")).toBeInTheDocument();
    expect(screen.getByText("Ruth")).toBeInTheDocument();
  });

  it("says so when there is nobody to show", async () => {
    api.fetchUsers.mockResolvedValue([]);

    show(<Users />);

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  it("survives a response that is not an array", async () => {
    // A 500 handler returns `{error: ...}`; mapping over that throws and blanks
    // the page.
    api.fetchUsers.mockResolvedValue({ error: "boom" });

    show(<Users />);

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  it("shows the reason when the list cannot be loaded", async () => {
    api.fetchUsers.mockRejectedValue(new Error("Cannot reach the server"));

    show(<Users />);

    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument();
  });

  it("filters by name, one request per pause rather than per keystroke", async () => {
    api.fetchUsers.mockResolvedValue([person(1, "Dana")]);
    const user = userEvent.setup();
    show(<Users />);
    await screen.findByText("Dana");
    api.fetchUsers.mockClear();

    await user.type(screen.getByLabelText(/filter users by name/i), "dan");

    await waitFor(() => expect(api.fetchUsers).toHaveBeenCalledWith(0, 10, "dan"));
    expect(api.fetchUsers).toHaveBeenCalledTimes(1);
  });

  it("offers Load More only while a full page keeps coming back", async () => {
    // The old code advanced by a fixed 10 whatever the server returned, so the
    // button stayed on forever and the last click appended nothing.
    api.fetchUsers.mockResolvedValueOnce(page(1, 10));
    show(<Users />);
    await screen.findByText("User 1");

    const more = screen.getByRole("button", { name: /load more/i });
    api.fetchUsers.mockResolvedValueOnce(page(11, 3));
    await userEvent.setup().click(more);

    expect(await screen.findByText("User 13")).toBeInTheDocument();
    expect(screen.getByText("User 1")).toBeInTheDocument();     // appended, not replaced
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument());
  });

  it("asks for the next page starting after what it already has", async () => {
    api.fetchUsers.mockResolvedValueOnce(page(1, 10));
    show(<Users />);
    await screen.findByText("User 1");

    api.fetchUsers.mockResolvedValueOnce([]);
    await userEvent.setup().click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(api.fetchUsers).toHaveBeenLastCalledWith(10, 10, ""));
  });
});

// ──────────────────────────────────────────────────────────── a table row ───

describe("User row", () => {
  it("shows the name and bio", () => {
    show(<table><tbody><User user={person(3, "Ruth Bar")} /></tbody></table>);

    expect(screen.getByText("Ruth Bar")).toBeInTheDocument();
    expect(screen.getByText("bio 3")).toBeInTheDocument();
  });

  it("falls back to a placeholder when a user has no name", () => {
    show(<table><tbody><User user={{ id: 4, name: null }} /></tbody></table>);

    expect(screen.getByText("Unknown user")).toBeInTheDocument();
  });

  it("opens that person's profile", async () => {
    show(<table><tbody><User user={person(3, "Ruth")} /></tbody></table>);

    await userEvent.setup().click(screen.getByRole("button", { name: /view profile/i }));

    expect(navigate).toHaveBeenCalledWith("/user/3");
  });
});

// ─────────────────────────────────────────────────────────────── search ─────

describe("Search", () => {
  it("does not call the server until something is typed", async () => {
    show(<Search />);

    await new Promise((r) => setTimeout(r, 400));
    expect(api.fetchUsers).not.toHaveBeenCalled();
  });

  it("searches by name and lists the matches", async () => {
    api.fetchUsers.mockResolvedValue([person(1, "Dana Cohen"), person(2, "Danny Levi")]);
    const user = userEvent.setup();
    show(<Search />);

    await user.type(screen.getByLabelText(/search users by name/i), "dan");

    expect(await screen.findByText("Dana Cohen")).toBeInTheDocument();
    expect(screen.getByText("Danny Levi")).toBeInTheDocument();
    await waitFor(() => expect(api.fetchUsers).toHaveBeenCalledWith(0, 10, "dan"));
  });

  it("debounces instead of firing one request per character", async () => {
    api.fetchUsers.mockResolvedValue([]);
    const user = userEvent.setup();
    show(<Search />);

    await user.type(screen.getByLabelText(/search users by name/i), "dana");

    await waitFor(() => expect(api.fetchUsers).toHaveBeenCalled());
    expect(api.fetchUsers).toHaveBeenCalledTimes(1);
  });

  it("says when nothing matched", async () => {
    api.fetchUsers.mockResolvedValue([]);
    const user = userEvent.setup();
    show(<Search />);

    await user.type(screen.getByLabelText(/search users by name/i), "zzz");

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  it("clears the results when the box is emptied", async () => {
    api.fetchUsers.mockResolvedValue([person(1, "Dana")]);
    const user = userEvent.setup();
    show(<Search />);
    const box = screen.getByLabelText(/search users by name/i);

    await user.type(box, "dana");
    await screen.findByText("Dana");

    await user.clear(box);

    await waitFor(() => expect(screen.queryByText("Dana")).not.toBeInTheDocument());
    expect(screen.queryByText(/no users found/i)).not.toBeInTheDocument();
  });

  it("treats a failed search as no results rather than a broken page", async () => {
    api.fetchUsers.mockRejectedValue(new Error("Cannot reach the server"));
    const user = userEvent.setup();
    show(<Search />);

    await user.type(screen.getByLabelText(/search users by name/i), "dana");

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  it("goes to the profile of the result that was clicked", async () => {
    api.fetchUsers.mockResolvedValue([person(7, "Dana")]);
    const user = userEvent.setup();
    show(<Search />);

    await user.type(screen.getByLabelText(/search users by name/i), "dana");
    await user.click(await screen.findByText("Dana"));

    expect(navigate).toHaveBeenCalledWith("/users/7");
  });

  it("renders results as list items, not bare divs inside a list", async () => {
    // ListItemButton on its own produces <div role="button"> as a child of
    // <ul>, which is invalid markup and confuses screen readers.
    api.fetchUsers.mockResolvedValue([person(1, "Dana")]);
    const user = userEvent.setup();
    show(<Search />);

    await user.type(screen.getByLabelText(/search users by name/i), "dana");
    await screen.findByText("Dana");

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem").length).toBe(1);
  });

  it("ignores a slow earlier response that arrives after a newer one", async () => {
    // Without the request-id guard, results for "d" could land after results
    // for "dana" and overwrite them.
    let resolveFirst;
    api.fetchUsers
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValue([person(2, "Correct Result")]);

    const user = userEvent.setup();
    show(<Search />);
    const box = screen.getByLabelText(/search users by name/i);

    await user.type(box, "d");
    await waitFor(() => expect(api.fetchUsers).toHaveBeenCalledTimes(1));

    await user.type(box, "ana");
    await screen.findByText("Correct Result");

    resolveFirst([person(1, "Stale Result")]);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Stale Result")).not.toBeInTheDocument();
    expect(screen.getByText("Correct Result")).toBeInTheDocument();
  });
});
