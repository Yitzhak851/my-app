import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as api from "../api/api";

// Every HTTP call in the app goes through api.js. Two classes of bug live here
// and neither shows up in a component test:
//
//   • the wrong URL, verb or field name — the component works, the server 404s;
//   • a dropped `credentials: "include"` — the browser silently omits the
//     session cookie and the API treats a signed-in person as anonymous. That
//     one is invisible in development until something needs authentication.
//
// So the calls are checked as a table: one row per exported function.

function stubFetch(body, { ok = true, status = 200 } = {}) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const lastCall = (spy) => {
  const [url, options = {}] = spy.mock.calls.at(-1);
  const isJson = typeof options.body === "string";
  return { url, options, body: isJson ? JSON.parse(options.body) : undefined };
};

describe("api client — the request wrapper", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("sends the session cookie on every request", async () => {
    const spy = stubFetch({});
    await api.fetchPosts();
    expect(lastCall(spy).options.credentials).toBe("include");
  });

  it("turns a network failure into a message a person can act on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.fetchPosts()).rejects.toThrow(/Cannot reach the server/);
  });

  it("uses the server's error message when there is one", async () => {
    stubFetch({ error: "Already following this user" }, { ok: false, status: 400 });
    await expect(api.followUser(2)).rejects.toThrow("Already following this user");
  });

  it("falls back to the status code when the body has no message", async () => {
    stubFetch({}, { ok: false, status: 503 });
    await expect(api.fetchPosts()).rejects.toThrow("Request failed (503)");
  });

  it("attaches the status so callers can tell 401 from 403", async () => {
    stubFetch({ error: "nope" }, { ok: false, status: 403 });
    await expect(api.fetchPosts()).rejects.toMatchObject({ status: 403 });

    stubFetch({ error: "nope" }, { ok: false, status: 401 });
    await expect(api.fetchCurrentUser()).rejects.toMatchObject({ status: 401 });
  });

  it("resolves to null for an empty body rather than throwing", async () => {
    stubFetch(undefined);
    await expect(api.logout()).resolves.toBeNull();
  });

  it("resolves to null when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => "<html>proxy error</html>",
    }));
    await expect(api.fetchPosts()).resolves.toBeNull();
  });

  it("omits empty query parameters instead of sending the string 'undefined'", async () => {
    const spy = stubFetch([]);
    await api.fetchUsers(0, 10, "");
    const { url } = lastCall(spy);
    expect(url).not.toContain("search=");
    expect(url).not.toContain("undefined");
  });
});

// One row per exported call: what it should ask the server to do.
const CALLS = [
  ["fetchPosts", () => api.fetchPosts(0, 10, 5), "GET", "/posts/?start=0&limit=10&userId=5"],
  ["fetchPosts following", () => api.fetchPosts(0, 10, null, true), "GET", "followingOnly=true"],
  ["createPost", () => api.createPost({ title: "t", body: "b" }), "POST", "/posts/", { title: "t", body: "b" }],
  ["fetchUsers", () => api.fetchUsers(10, 5, "dana"), "GET", "/users/?start=10&limit=5&search=dana"],
  ["fetchUser", () => api.fetchUser(3), "GET", "/users/3"],
  ["fetchFollowStats", () => api.fetchFollowStats(3), "GET", "/users/3/follow-stats"],
  ["likePost", () => api.likePost(9), "POST", "/posts/9/like"],
  ["unlikePost", () => api.unlikePost(9), "DELETE", "/posts/9/like"],
  ["fetchComments", () => api.fetchComments(9), "GET", "/posts/9/comments"],
  ["createComment", () => api.createComment(9, "hi", 4), "POST", "/posts/9/comments", { body: "hi", parent_id: 4 }],
  ["deleteComment", () => api.deleteComment(4), "DELETE", "/comments/4"],
  ["reportContent", () => api.reportContent({ postId: 9, reason: "spam" }), "POST", "/reports",
    { post_id: 9, comment_id: null, reason: "spam" }],
  ["fetchReportReasons", () => api.fetchReportReasons(), "GET", "/reports/reasons"],
  ["fetchModerationQueue", () => api.fetchModerationQueue("closed"), "GET", "/moderation/queue?status=closed"],
  ["fetchFlaggedContent", () => api.fetchFlaggedContent(), "GET", "/moderation/flagged"],
  ["resolveReport", () => api.resolveReport(2, "dismissed"), "PATCH", "/moderation/reports/2", { action: "dismissed" }],
  ["moderatorDeletePost", () => api.moderatorDeletePost(9), "DELETE", "/moderation/posts/9"],
  ["moderatorDeleteComment", () => api.moderatorDeleteComment(4), "DELETE", "/moderation/comments/4"],
  ["clearFlag", () => api.clearFlag("post", 9), "DELETE", "/moderation/flags/post/9"],
  ["fetchModerationUsers", () => api.fetchModerationUsers("dana"), "GET", "/moderation/users?search=dana"],
  ["setUserBanned", () => api.setUserBanned(3, true), "POST", "/moderation/users/3/ban", { banned: true }],
  ["setUserRole", () => api.setUserRole(3, "moderator"), "POST", "/moderation/users/3/role", { role: "moderator" }],
  ["autocorrectText", () => api.autocorrectText("teh"), "POST", "/ai/autocorrect", { text: "teh" }],
  ["generatePostDraft", () => api.generatePostDraft(), "POST", "/ai/generate-post", { style: null }],
  ["fetchCommentSuggestions", () => api.fetchCommentSuggestions(9), "GET", "/ai/suggest-comments/9"],
  ["analyzeText", () => api.analyzeText("hello"), "POST", "/ai/analyze", { text: "hello" }],
  ["followUser", () => api.followUser(2), "POST", "/follows/", { following_id: 2 }],
  ["unfollowUser", () => api.unfollowUser(2), "DELETE", "/follows/", { following_id: 2 }],
  ["fetchFollowers", () => api.fetchFollowers(3), "GET", "/follows/3/followers"],
  ["fetchFollowing", () => api.fetchFollowing(3), "GET", "/follows/3/following"],
  ["login", () => api.login("a@b.com", "pw"), "POST", "/auth/login", { email: "a@b.com", password: "pw" }],
  ["signup", () => api.signup("a@b.com", "pw", "A"), "POST", "/auth/signup", { email: "a@b.com", password: "pw", name: "A" }],
  ["logout", () => api.logout(), "POST", "/auth/logout"],
  ["requestPasswordReset", () => api.requestPasswordReset("a@b.com"), "POST", "/auth/forgot-password", { email: "a@b.com" }],
  ["resetPassword", () => api.resetPassword("tok", "pw"), "POST", "/auth/reset-password", { token: "tok", password: "pw" }],
  ["fetchCurrentUser", () => api.fetchCurrentUser(), "GET", "/auth/me"],
];

describe("api client — every endpoint", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it.each(CALLS)("%s calls the right endpoint", async (_name, call, method, fragment, body) => {
    const spy = stubFetch({ is_following: false });

    await call();

    const sent = lastCall(spy);
    expect(sent.url).toContain(fragment);
    expect(sent.options.method || "GET").toBe(method);
    expect(sent.options.credentials).toBe("include");
    if (body !== undefined) expect(sent.body).toEqual(body);
  });
});

describe("api client — response shapes the UI depends on", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("checkIfFollowing returns a boolean, not the raw snake_case object", async () => {
    // Returning the object invited callers to read `result.isFollowing`, which
    // is always undefined — the follow button was permanently stuck on "Follow".
    stubFetch({ is_following: true });
    await expect(api.checkIfFollowing(2)).resolves.toBe(true);

    stubFetch({ is_following: false });
    await expect(api.checkIfFollowing(2)).resolves.toBe(false);

    stubFetch({});
    await expect(api.checkIfFollowing(2)).resolves.toBe(false);
  });

  it("fetchUser returns the user object itself, not a wrapper", async () => {
    // GET /api/users/<id> answers with the user at the TOP level. Reading
    // `data.user` here is what made every profile page render
    // "Failed to load user profile".
    stubFetch({ id: 11, name: "Sergey Gurin" });

    const result = await api.fetchUser(11);

    expect(result).toMatchObject({ id: 11, name: "Sergey Gurin" });
    expect(result.user).toBeUndefined();
  });

  it("uploadImage sends multipart and does not set Content-Type by hand", async () => {
    // The browser has to set it itself so it can add the multipart boundary;
    // setting it manually produces a body the server cannot parse.
    const spy = stubFetch({ url: "/uploads/x.png" });
    const file = new File(["bytes"], "x.png", { type: "image/png" });

    await api.uploadImage(file);

    const { options } = lastCall(spy);
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("image")).toBe(file);
    expect(options.headers).toBeUndefined();
  });

  it("does not send a currentUserId with the following feed", async () => {
    // The server reads the viewer from the session; accepting it from the query
    // string let one person request another person's personal feed.
    const spy = stubFetch([]);
    await api.fetchPosts(0, 10, null, true);
    expect(lastCall(spy).url).not.toContain("currentUserId");
  });
});
