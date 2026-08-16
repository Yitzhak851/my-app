import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ToolbarComponent from "../components/ToolbarComponent";
import ReportButton from "../components/ReportButton";
import About from "../components/About";
import { AuthProvider } from "../auth/AuthContext";
import { timeAgo } from "../components/timeAgo";
import * as api from "../api/api";

vi.mock("../api/api");

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const show = (ui) => render(<MemoryRouter><AuthProvider>{ui}</AuthProvider></MemoryRouter>);

const signedInAs = (user) => api.fetchCurrentUser.mockResolvedValue({ user });
const signedOut = () =>
  api.fetchCurrentUser.mockRejectedValue(Object.assign(new Error("401"), { status: 401 }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  signedOut();
});

// ────────────────────────────────────────────────────────────── the bar ─────

describe("ToolbarComponent", () => {
  it("offers sign-in and nothing private to a visitor", async () => {
    show(<ToolbarComponent />);

    expect(await screen.findByRole("link", { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new post/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /my profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /moderation/i })).not.toBeInTheDocument();
  });

  it("links a signed-in user to their own profile", async () => {
    signedInAs({ id: 7, name: "Dana", email: "dana@example.com", role: "user" });
    show(<ToolbarComponent />);

    expect(await screen.findByRole("link", { name: /my profile/i }))
      .toHaveAttribute("href", "/users/7");
    expect(screen.getByRole("link", { name: /new post/i })).toBeInTheDocument();
  });

  it("hides the moderation link from an ordinary user", async () => {
    signedInAs({ id: 7, name: "Dana", email: "dana@example.com", role: "user" });
    show(<ToolbarComponent />);

    await screen.findByRole("link", { name: /my profile/i });
    expect(screen.queryByRole("link", { name: /moderation/i })).not.toBeInTheDocument();
  });

  it("shows the moderation link to a moderator", async () => {
    // The bug this catches: login used to omit `role` from its response, so a
    // moderator who had just signed in saw no Moderation link until they
    // happened to refresh the page.
    signedInAs({ id: 2, name: "Mod", email: "mod@example.com", role: "moderator" });
    show(<ToolbarComponent />);

    expect(await screen.findByRole("link", { name: /moderation/i }))
      .toHaveAttribute("href", "/admin");
  });

  it("shows the moderation link to an admin", async () => {
    signedInAs({ id: 1, name: "Root", email: "root@example.com", role: "admin" });
    show(<ToolbarComponent />);

    expect(await screen.findByRole("link", { name: /moderation/i })).toBeInTheDocument();
  });

  it("signs out and returns to the feed", async () => {
    signedInAs({ id: 7, name: "Dana", email: "dana@example.com", role: "user" });
    api.logout.mockResolvedValue({ message: "Logged out" });
    show(<ToolbarComponent />);

    await userEvent.setup().click(await screen.findByRole("button", { name: /logout/i }));

    await waitFor(() => expect(api.logout).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith("/");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /login/i })).toBeInTheDocument());
  });

  it("signs out locally even when the server cannot be reached", async () => {
    // Failing to reach the server is not a reason to stay "signed in" in the
    // UI — and logout must never reject, or every caller leaks an unhandled
    // rejection.
    signedInAs({ id: 7, name: "Dana", email: "dana@example.com", role: "user" });
    api.logout.mockRejectedValue(new Error("Cannot reach the server"));
    show(<ToolbarComponent />);

    await userEvent.setup().click(await screen.findByRole("button", { name: /logout/i }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /login/i })).toBeInTheDocument());
    expect(navigate).toHaveBeenCalledWith("/");
  });
});

// ──────────────────────────────────────────────────────── the report flow ───

describe("ReportButton", () => {
  it("is not offered to someone who is not signed in", async () => {
    show(<ReportButton postId={5} />);

    await waitFor(() => expect(api.fetchCurrentUser).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /report/i })).not.toBeInTheDocument();
  });

  it("sends the chosen reason for a post", async () => {
    signedInAs({ id: 7, name: "Dana", role: "user" });
    api.reportContent.mockResolvedValue({ message: "thanks" });
    const user = userEvent.setup();
    show(<ReportButton postId={5} />);

    await user.click(await screen.findByRole("button", { name: /report/i }));
    expect(screen.getByText(/report this post/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/reason/i));
    await user.click(await screen.findByRole("option", { name: /hate speech/i }));
    await user.click(screen.getByRole("button", { name: /^report$/i }));

    await waitFor(() => expect(api.reportContent).toHaveBeenCalledWith({
      postId: 5, commentId: null, reason: "hate",
    }));
    expect(await screen.findByText(/a moderator will take a look/i)).toBeInTheDocument();
  });

  it("labels itself for a comment when that is what it reports", async () => {
    signedInAs({ id: 7, name: "Dana", role: "user" });
    const user = userEvent.setup();
    show(<ReportButton commentId={9} />);

    await user.click(await screen.findByRole("button", { name: /report/i }));

    expect(screen.getByText(/report this comment/i)).toBeInTheDocument();
  });

  it("defaults to spam so the dialog can be sent without choosing", async () => {
    signedInAs({ id: 7, name: "Dana", role: "user" });
    api.reportContent.mockResolvedValue({});
    const user = userEvent.setup();
    show(<ReportButton commentId={9} />);

    await user.click(await screen.findByRole("button", { name: /report/i }));
    await user.click(screen.getByRole("button", { name: /^report$/i }));

    await waitFor(() => expect(api.reportContent).toHaveBeenCalledWith({
      postId: null, commentId: 9, reason: "spam",
    }));
  });

  it("shows the reason when the report cannot be sent", async () => {
    signedInAs({ id: 7, name: "Dana", role: "user" });
    api.reportContent.mockRejectedValue(new Error("Post not found"));
    const user = userEvent.setup();
    show(<ReportButton postId={5} />);

    await user.click(await screen.findByRole("button", { name: /report/i }));
    await user.click(screen.getByRole("button", { name: /^report$/i }));

    expect(await screen.findByText(/post not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/a moderator will take a look/i)).not.toBeInTheDocument();
  });

  it("can be closed without sending anything", async () => {
    signedInAs({ id: 7, name: "Dana", role: "user" });
    const user = userEvent.setup();
    show(<ReportButton postId={5} />);

    await user.click(await screen.findByRole("button", { name: /report/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/report this post/i)).not.toBeInTheDocument());
    expect(api.reportContent).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────── about ───────

describe("About", () => {
  it("renders the description of the app", () => {
    render(<About />);

    expect(screen.getByText(/about instaruni/i)).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────── relative times ────

describe("timeAgo (requirement 1.c.iii)", () => {
  const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();

  it("is empty for a missing or unparseable date rather than 'Invalid Date'", () => {
    expect(timeAgo(null)).toBe("");
    expect(timeAgo("")).toBe("");
    expect(timeAgo("not a date")).toBe("");
  });

  it("says 'just now' under a minute", () => {
    expect(timeAgo(minutesAgo(0))).toBe("הרגע");
  });

  it("counts minutes under an hour", () => {
    expect(timeAgo(minutesAgo(5))).toBe("לפני 5 דקות");
    expect(timeAgo(minutesAgo(59))).toBe("לפני 59 דקות");
  });

  it("counts whole hours, and hours with minutes", () => {
    expect(timeAgo(minutesAgo(120))).toBe("לפני 2 שעות");
    expect(timeAgo(minutesAgo(150))).toBe("לפני 2 שעות ו-30 דקות");
  });

  it("counts days, with the singular form for one", () => {
    expect(timeAgo(minutesAgo(60 * 24))).toBe("לפני יום אחד");
    expect(timeAgo(minutesAgo(60 * 24 * 3))).toBe("לפני 3 ימים");
  });
});
