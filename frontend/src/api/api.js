// my-YBO-app/src/api/api.js
//
// Every HTTP call in the app goes through this module. Components must not call
// fetch() directly: when they do, the API base URL gets hardcoded in several
// places and the app cannot be deployed anywhere other than localhost.

// Configurable so the same build can point at localhost, staging or production.
// The fallback keeps the app working if .env is missing after a fresh clone.
const BASE_URL =
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:5000/api";

/**
 * Single place where a failed response becomes an Error, so every caller gets a
 * useful message instead of "undefined" or a silent success.
 */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      // Without this the browser silently drops the session cookie on every
      // cross-origin call, and the API sees an anonymous request.
      credentials: "include",
      ...options,
    });
  } catch {
    // fetch() only rejects on a network-level failure.
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    // Callers need to tell "you are signed out" (401) and "you are not allowed"
    // (403) apart from a generic failure.
    error.status = response.status;
    throw error;
  }
  return data;
}

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.append(key, value);
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

// ─────────────────────────────────────────────────────────────── posts ──────

export function fetchPosts(start = 0, limit = 10, userId = null, followingOnly = false) {
  // followingOnly no longer takes a user id: the server reads it from the
  // session, so one person cannot request another person's personal feed.
  return request(
    `/posts/${query({
      start,
      limit,
      userId,
      ...(followingOnly ? { followingOnly: "true" } : {}),
    })}`
  );
}

/**
 * Uploads one image and resolves to { url, filename }.
 *
 * No Content-Type header: the browser must set it itself so it can add the
 * multipart boundary. Setting it by hand produces a body the server cannot parse.
 */
export function uploadImage(file) {
  const form = new FormData();
  form.append("image", file);
  return request("/uploads/image", { method: "POST", body: form });
}

export function createPost(postData) {
  return request("/posts/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postData),
  });
}

// ─────────────────────────────────────────────────────────────── users ──────

export function fetchUsers(start = 0, limit = 10, search = "") {
  return request(`/users/${query({ start, limit, search })}`);
}

/**
 * Returns the user object itself. The API responds with the user at the top
 * level — NOT wrapped in { user: ... }. Reading `data.user` here is what made
 * the profile page throw and render "Failed to load user profile".
 */
export function fetchUser(userId) {
  return request(`/users/${userId}`);
}

export function fetchFollowStats(userId) {
  return request(`/users/${userId}/follow-stats`);
}

// ───────────────────────────────────────────────── likes and comments ──────

/** Resolves to { liked, count } so the caller can trust the server's total. */
export function likePost(postId) {
  return request(`/posts/${postId}/like`, { method: "POST" });
}

export function unlikePost(postId) {
  return request(`/posts/${postId}/like`, { method: "DELETE" });
}

export function fetchComments(postId) {
  return request(`/posts/${postId}/comments`);
}

export function createComment(postId, body, parentId = null) {
  return request(`/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, parent_id: parentId }),
  });
}

export function deleteComment(commentId) {
  return request(`/comments/${commentId}`, { method: "DELETE" });
}

// ──────────────────────────────────────────────── moderation & admin ──────

export function reportContent({ postId = null, commentId = null, reason }) {
  return request("/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId, comment_id: commentId, reason }),
  });
}

export function fetchReportReasons() {
  return request("/reports/reasons");
}

export function fetchModerationQueue(status = "open") {
  return request(`/moderation/queue${query({ status })}`);
}

export function fetchFlaggedContent() {
  return request("/moderation/flagged");
}

export function resolveReport(reportId, action) {
  return request(`/moderation/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function moderatorDeletePost(postId) {
  return request(`/moderation/posts/${postId}`, { method: "DELETE" });
}

export function moderatorDeleteComment(commentId) {
  return request(`/moderation/comments/${commentId}`, { method: "DELETE" });
}

export function clearFlag(kind, itemId) {
  return request(`/moderation/flags/${kind}/${itemId}`, { method: "DELETE" });
}

export function fetchModerationUsers(search = "") {
  return request(`/moderation/users${query({ search })}`);
}

export function setUserBanned(userId, banned) {
  return request(`/moderation/users/${userId}/ban`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ banned }),
  });
}

export function setUserRole(userId, role) {
  return request(`/moderation/users/${userId}/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

// ───────────────────────────────────────────────────── AI assistance ──────

export function autocorrectText(text) {
  return request("/ai/autocorrect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function generatePostDraft(style = null) {
  return request("/ai/generate-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style }),
  });
}

export function fetchCommentSuggestions(postId) {
  return request(`/ai/suggest-comments/${postId}`);
}

export function analyzeText(text) {
  return request("/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

// ───────────────────────────────────────────────────────────── follows ──────

export function followUser(followingId) {
  return request("/follows/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ following_id: followingId }),
  });
}

export function unfollowUser(followingId) {
  return request("/follows/", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ following_id: followingId }),
  });
}

/**
 * Resolves to a plain boolean. The API field is snake_case (`is_following`);
 * returning the raw object invited callers to read `result.isFollowing`, which
 * is always undefined — the follow button was permanently stuck on "Follow".
 */
export async function checkIfFollowing(followingId) {
  const data = await request(`/follows/check${query({ following_id: followingId })}`);
  return Boolean(data?.is_following);
}

export function fetchFollowers(userId) {
  return request(`/follows/${userId}/followers`);
}

export function fetchFollowing(userId) {
  return request(`/follows/${userId}/following`);
}

// ──────────────────────────────────────────────────────────────── auth ──────

export function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function signup(email, password, name) {
  return request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
}

/**
 * Starts a password reset. Always resolves — the server answers identically
 * whether or not the address has an account, so the UI must not branch on it.
 */
export function requestPasswordReset(email) {
  return request("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token, password) {
  return request("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

/**
 * Who the session cookie belongs to. Rejects with status 401 when signed out.
 * This is the source of truth for the signed-in user — localStorage is not,
 * because the server can end a session at any time.
 */
export function fetchCurrentUser() {
  return request("/auth/me");
}
