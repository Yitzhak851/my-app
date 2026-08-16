import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AdminDashboard from "../components/AdminDashboard";
import { AuthProvider } from "../auth/AuthContext";
import * as api from "../api/api";

vi.mock("../api/api");

const ADMIN = { id: 1, name: "Root", role: "admin" };
const MODERATOR = { id: 2, name: "Mod", role: "moderator" };
const PLAIN = { id: 3, name: "Dana", role: "user" };

const REPORT = {
  id: 10, reporter_name: "Dana", reason: "spam", status: "open",
  created_at: "2026-01-01T00:00:00", post_id: 100,
  post_title: "Buy now", post_body: "<p>cheap watches</p>",
  post_author_id: 5, post_author_name: "Spammer",
};

const COMMENT_REPORT = {
  id: 11, reporter_name: "Dana", reason: "harassment", status: "open",
  created_at: "2026-01-01T00:00:00", comment_id: 200,
  comment_body: "you are an idiot", comment_author_id: 6, comment_author_name: "Rude",
};

const FLAGGED = {
  posts: [{ id: 101, title: "Angry", body: "<p>awful</p>", author_name: "Nick", sentiment_score: -0.8 }],
  comments: [{ id: 201, body: "hostile comment", author_name: "Nick", sentiment_score: -0.9 }],
};

const USERS = [
  { id: 1, name: "Root", email: "root@example.com", role: "admin", post_count: 0, is_banned: false, is_agent: false },
  { id: 3, name: "Dana", email: "dana@example.com", role: "user", post_count: 4, is_banned: false, is_agent: false },
  { id: 4, name: "Nick", email: "nick@example.com", role: "user", post_count: 2, is_banned: true, is_agent: false },
  { id: 5, name: "Night Owl", email: "owl@agents.local", role: "user", post_count: 9, is_banned: false, is_agent: true },
];

function show(as = ADMIN) {
  api.fetchCurrentUser.mockResolvedValue({ user: as });
  return render(
    <MemoryRouter>
      <AuthProvider><AdminDashboard /></AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.fetchModerationQueue.mockResolvedValue([REPORT, COMMENT_REPORT]);
  api.fetchFlaggedContent.mockResolvedValue(FLAGGED);
  api.fetchModerationUsers.mockResolvedValue(USERS);
});

const openTab = async (name) => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name }));
  return user;
};

// ────────────────────────────────────────────────────────── who gets in ─────

describe("AdminDashboard — access", () => {
  it("turns an ordinary user away and does not call the moderation API", async () => {
    show(PLAIN);

    expect(await screen.findByText(/for moderators and admins/i)).toBeInTheDocument();
    expect(api.fetchModerationQueue).not.toHaveBeenCalled();
  });

  it("waits for the session check before deciding", async () => {
    // Deciding while `loading` is true would flash "not allowed" at a moderator
    // on every refresh.
    let resolveMe;
    api.fetchCurrentUser.mockReturnValue(new Promise((r) => { resolveMe = r; }));
    render(<MemoryRouter><AuthProvider><AdminDashboard /></AuthProvider></MemoryRouter>);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(/for moderators and admins/i)).not.toBeInTheDocument();

    resolveMe({ user: MODERATOR });
    expect(await screen.findByText(/moderation/i)).toBeInTheDocument();
  });

  it("lets a moderator in", async () => {
    show(MODERATOR);

    expect(await screen.findByText(/signed in as mod \(moderator\)/i)).toBeInTheDocument();
  });

  it("shows what failed when the dashboard cannot load", async () => {
    api.fetchModerationQueue.mockRejectedValue(new Error("Could not load the queue"));
    show();

    expect(await screen.findByText(/could not load the queue/i)).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────── the tabs ──────

describe("AdminDashboard — the three tabs", () => {
  it("counts each queue in its tab label", async () => {
    show();

    expect(await screen.findByRole("tab", { name: /reports \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /auto-flagged \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /users \(4\)/i })).toBeInTheDocument();
  });

  it("opens on the reports tab and shows what was reported", async () => {
    show();

    expect(await screen.findByText(/buy now — cheap watches/i)).toBeInTheDocument();
    expect(screen.getByText("Spammer")).toBeInTheDocument();
    expect(screen.getByText("spam")).toBeInTheDocument();
  });

  it("strips the HTML out of a reported post body", async () => {
    // The queue renders text, not markup — a reported post could otherwise
    // inject anything into the moderator's own page.
    show();

    await screen.findByText(/buy now/i);
    expect(document.body.innerHTML).not.toContain("<p>cheap watches</p>");
  });

  it("says so when nothing has been reported", async () => {
    api.fetchModerationQueue.mockResolvedValue([]);
    show();

    expect(await screen.findByText(/nothing reported/i)).toBeInTheDocument();
  });

  it("lists automatically held content with its score", async () => {
    show();
    await openTab(/auto-flagged/i);

    expect(await screen.findByText(/angry — awful/i)).toBeInTheDocument();
    expect(screen.getByText("hostile comment")).toBeInTheDocument();
    expect(screen.getByText("-0.8")).toBeInTheDocument();
  });

  it("says so when nothing is held for review", async () => {
    api.fetchFlaggedContent.mockResolvedValue({ posts: [], comments: [] });
    show();
    await openTab(/auto-flagged/i);

    expect(await screen.findByText(/nothing held for review/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────── acting on reports ──

describe("AdminDashboard — acting on a report", () => {
  it("deletes a reported post and closes the report in one step", async () => {
    api.moderatorDeletePost.mockResolvedValue({});
    api.resolveReport.mockResolvedValue({});
    show();
    await screen.findByText(/buy now/i);

    const row = screen.getByText("Spammer").closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /delete content/i }));

    await waitFor(() => expect(api.moderatorDeletePost).toHaveBeenCalledWith(100));
    expect(api.resolveReport).toHaveBeenCalledWith(10, "actioned");
    expect(await screen.findByText(/content removed/i)).toBeInTheDocument();
  });

  it("deletes a reported comment, not a post, when the report is about a comment", async () => {
    api.moderatorDeleteComment.mockResolvedValue({});
    api.resolveReport.mockResolvedValue({});
    show();
    await screen.findByText(/you are an idiot/i);

    const row = screen.getByText("Rude").closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /delete content/i }));

    await waitFor(() => expect(api.moderatorDeleteComment).toHaveBeenCalledWith(200));
    expect(api.moderatorDeletePost).not.toHaveBeenCalled();
  });

  it("dismisses a report without deleting anything", async () => {
    api.resolveReport.mockResolvedValue({});
    show();
    await screen.findByText(/buy now/i);

    const row = screen.getByText("Spammer").closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /^dismiss$/i }));

    await waitFor(() => expect(api.resolveReport).toHaveBeenCalledWith(10, "dismissed"));
    expect(api.moderatorDeletePost).not.toHaveBeenCalled();
    expect(await screen.findByText(/report dismissed/i)).toBeInTheDocument();
  });

  it("reloads the queue after acting, so a handled report disappears", async () => {
    api.resolveReport.mockResolvedValue({});
    show();
    await screen.findByText(/buy now/i);
    api.fetchModerationQueue.mockResolvedValue([COMMENT_REPORT]);

    const row = screen.getByText("Spammer").closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /^dismiss$/i }));

    await waitFor(() => expect(screen.queryByText(/buy now/i)).not.toBeInTheDocument());
  });

  it("reports a failed action instead of claiming it worked", async () => {
    api.resolveReport.mockRejectedValue(new Error("Report not found"));
    show();
    await screen.findByText(/buy now/i);

    const row = screen.getByText("Spammer").closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /^dismiss$/i }));

    expect(await screen.findByText(/report not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/report dismissed/i)).not.toBeInTheDocument();
  });

  it("clears an automatic flag without deleting the content", async () => {
    api.clearFlag.mockResolvedValue({});
    show();
    await openTab(/auto-flagged/i);
    await screen.findByText(/angry — awful/i);

    const row = screen.getByText(/angry — awful/i).closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /it is fine/i }));

    await waitFor(() => expect(api.clearFlag).toHaveBeenCalledWith("post", 101));
    expect(api.moderatorDeletePost).not.toHaveBeenCalled();
  });

  it("clears a flag on a comment with the comment kind", async () => {
    api.clearFlag.mockResolvedValue({});
    show();
    await openTab(/auto-flagged/i);
    await screen.findByText("hostile comment");

    const row = screen.getByText("hostile comment").closest("tr");
    await userEvent.setup().click(within(row).getByRole("button", { name: /it is fine/i }));

    await waitFor(() => expect(api.clearFlag).toHaveBeenCalledWith("comment", 201));
  });
});

// ──────────────────────────────────────────────────────── users and roles ───

describe("AdminDashboard — users", () => {
  it("shows each account with its email, post count and state", async () => {
    show();
    await openTab(/users/i);

    expect(await screen.findByText("dana@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("active").length).toBeGreaterThan(0);
    expect(screen.getByText("banned")).toBeInTheDocument();
  });

  it("marks the agent accounts", async () => {
    show();
    await openTab(/users/i);

    expect(await screen.findByText("agent")).toBeInTheDocument();
  });

  it("bans an active account and restores a banned one", async () => {
    api.setUserBanned.mockResolvedValue({ is_banned: true });
    show();
    const user = await openTab(/users/i);

    const dana = (await screen.findByText("Dana")).closest("tr");
    await user.click(within(dana).getByRole("button", { name: /^ban$/i }));
    await waitFor(() => expect(api.setUserBanned).toHaveBeenCalledWith(3, true));

    const nick = screen.getByText("Nick").closest("tr");
    await user.click(within(nick).getByRole("button", { name: /^unban$/i }));
    await waitFor(() => expect(api.setUserBanned).toHaveBeenCalledWith(4, false));
  });

  it("offers no ban button for yourself or for another admin", async () => {
    show();
    await openTab(/users/i);

    const root = (await screen.findByText("Root")).closest("tr");
    expect(within(root).queryByRole("button", { name: /ban/i })).not.toBeInTheDocument();
  });

  it("lets an admin change someone's role", async () => {
    api.setUserRole.mockResolvedValue({ role: "moderator" });
    show(ADMIN);
    const user = await openTab(/users/i);

    const dana = (await screen.findByText("Dana")).closest("tr");
    await user.click(within(dana).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "moderator" }));

    await waitFor(() => expect(api.setUserRole).toHaveBeenCalledWith(3, "moderator"));
  });

  it("does not offer a moderator the role selector at all", async () => {
    // Only an admin may hand out rights; the server enforces it too.
    show(MODERATOR);
    await openTab(/users/i);

    await screen.findByText("Dana");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("does not let an admin change their own role", async () => {
    show(ADMIN);
    await openTab(/users/i);

    const root = (await screen.findByText("Root")).closest("tr");
    expect(within(root).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("searches the user list on the server rather than filtering locally", async () => {
    show();
    const user = await openTab(/users/i);
    await screen.findByText("Dana");

    await user.type(screen.getByLabelText(/search users/i), "nick");

    await waitFor(() => expect(api.fetchModerationUsers).toHaveBeenLastCalledWith("nick"));
  });

  it("keeps everything typed into the search box while the list reloads", async () => {
    // The box used to be inside the `!loading` branch, so the first keystroke
    // triggered a reload, the field unmounted, and every character after the
    // first went nowhere. The box read "n" and the results were for "n".
    show();
    const user = await openTab(/users/i);
    await screen.findByText("Dana");

    const box = screen.getByLabelText(/search users/i);
    await user.type(box, "nick");

    expect(box).toHaveValue("nick");
    expect(box).toHaveFocus();
  });

  it("makes one search request per pause, not one per character", async () => {
    show();
    const user = await openTab(/users/i);
    await screen.findByText("Dana");
    api.fetchModerationUsers.mockClear();

    await user.type(screen.getByLabelText(/search users/i), "nick");

    await waitFor(() => expect(api.fetchModerationUsers).toHaveBeenCalledWith("nick"));
    expect(api.fetchModerationUsers).toHaveBeenCalledTimes(1);
  });
});
