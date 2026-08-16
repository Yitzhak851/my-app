// my-YBO-app/src/components/AdminDashboard.jsx
//
// The moderator dashboard (course requirement 2.e.ii).
//
// Three tabs, because a moderator has three different jobs:
//   Reports  — what people flagged
//   Flagged  — what the sentiment scorer held automatically
//   Users    — who to ban, and (admins only) who to promote

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "../auth/AuthContext";
import {
  clearFlag,
  fetchFlaggedContent,
  fetchModerationQueue,
  fetchModerationUsers,
  moderatorDeleteComment,
  moderatorDeletePost,
  resolveReport,
  setUserBanned,
  setUserRole,
} from "../api/api";
import { timeAgo } from "./timeAgo";

const stripHtml = (html) => (html || "").replace(/<[^>]+>/g, " ").trim();

function AdminDashboard() {
  const { currentUser, loading: authLoading } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const canModerate = isAdmin || currentUser?.role === "moderator";

  const [tab, setTab] = useState(0);
  const [reports, setReports] = useState([]);
  const [flagged, setFlagged] = useState({ posts: [], comments: [] });
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  // Debounced copy of the box above. Reloading on every keystroke put a request
  // per character on the server and made the list flicker while typing.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!canModerate) return;
    setLoading(true);
    setError("");
    try {
      const [queue, auto, userList] = await Promise.all([
        fetchModerationQueue("open"),
        fetchFlaggedContent(),
        fetchModerationUsers(appliedSearch),
      ]);
      setReports(queue || []);
      setFlagged(auto || { posts: [], comments: [] });
      setUsers(userList || []);
    } catch (err) {
      setError(err.message || "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [canModerate, appliedSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(userSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, message) {
    setError("");
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (err) {
      setError(err.message || "That action failed");
    }
  }

  if (authLoading) {
    return <Box sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Box>;
  }

  // The server rejects these calls anyway; this is just a clearer message than
  // a screen full of 403s.
  if (!canModerate) {
    return (
      <Box sx={{ mt: 8, textAlign: "center", px: 2 }}>
        <Alert severity="warning" sx={{ maxWidth: 460, mx: "auto" }}>
          This page is for moderators and admins.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, mx: "auto", mt: 4, px: 2, mb: 6, textAlign: "start" }}>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        Moderation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Signed in as {currentUser.name} ({currentUser.role})
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Reports (${reports.length})`} />
        <Tab label={`Auto-flagged (${flagged.posts.length + flagged.comments.length})`} />
        <Tab label={`Users (${users.length})`} />
      </Tabs>

      {loading && <CircularProgress size={24} />}

      {/* ─────────────────────────────────────────────── reported ───────── */}
      {!loading && tab === 0 && (
        reports.length === 0 ? (
          <Typography color="text.secondary">Nothing reported. Quiet day.</Typography>
        ) : (
          <Paper sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Reported</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Content</TableCell>
                  <TableCell>Author</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reports.map((r) => {
                  const isPost = Boolean(r.post_id);
                  const body = isPost
                    ? `${r.post_title || ""} — ${stripHtml(r.post_body)}`
                    : r.comment_body;
                  const author = isPost ? r.post_author_name : r.comment_author_name;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Chip size="small" label={isPost ? "Post" : "Comment"} />
                        <Typography variant="caption" display="block" color="text.secondary">
                          by {r.reporter_name}, {timeAgo(r.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>{r.reason}</TableCell>
                      <TableCell sx={{ maxWidth: 380 }}>
                        <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                          {(body || "(content deleted)").slice(0, 220)}
                        </Typography>
                      </TableCell>
                      <TableCell>{author || "—"}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="error"
                          onClick={() =>
                            act(async () => {
                              if (isPost) await moderatorDeletePost(r.post_id);
                              else await moderatorDeleteComment(r.comment_id);
                              await resolveReport(r.id, "actioned");
                            }, "Content removed")
                          }
                        >
                          Delete content
                        </Button>
                        <Button
                          size="small"
                          onClick={() => act(() => resolveReport(r.id, "dismissed"), "Report dismissed")}
                        >
                          Dismiss
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )
      )}

      {/* ────────────────────────────────────────── automatically held ──── */}
      {!loading && tab === 1 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Held by the sentiment check when it was written. A flag is a hint,
            not a verdict — read it before acting.
          </Typography>
          {flagged.posts.length + flagged.comments.length === 0 ? (
            <Typography color="text.secondary">Nothing held for review.</Typography>
          ) : (
            <Paper sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Content</TableCell>
                    <TableCell>Author</TableCell>
                    <TableCell>Score</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flagged.posts.map((p) => (
                    <TableRow key={`p${p.id}`}>
                      <TableCell><Chip size="small" label="Post" /></TableCell>
                      <TableCell sx={{ maxWidth: 380 }}>
                        {`${p.title} — ${stripHtml(p.body)}`.slice(0, 220)}
                      </TableCell>
                      <TableCell>{p.author_name}</TableCell>
                      <TableCell>{p.sentiment_score}</TableCell>
                      <TableCell>
                        <Button size="small" color="error"
                          onClick={() => act(() => moderatorDeletePost(p.id), "Post removed")}>
                          Delete
                        </Button>
                        <Button size="small"
                          onClick={() => act(() => clearFlag("post", p.id), "Flag cleared")}>
                          It is fine
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {flagged.comments.map((c) => (
                    <TableRow key={`c${c.id}`}>
                      <TableCell><Chip size="small" label="Comment" /></TableCell>
                      <TableCell sx={{ maxWidth: 380 }}>{(c.body || "").slice(0, 220)}</TableCell>
                      <TableCell>{c.author_name}</TableCell>
                      <TableCell>{c.sentiment_score}</TableCell>
                      <TableCell>
                        <Button size="small" color="error"
                          onClick={() => act(() => moderatorDeleteComment(c.id), "Comment removed")}>
                          Delete
                        </Button>
                        <Button size="small"
                          onClick={() => act(() => clearFlag("comment", c.id), "Flag cleared")}>
                          It is fine
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}

      {/* ──────────────────────────────────────────────────── users ─────── */}
      {/* The search box stays mounted while the list reloads. Hiding it behind
          `!loading` unmounted the field on the first keystroke, so it lost
          focus and swallowed everything typed after it. */}
      {tab === 2 && (
        <>
          <TextField
            size="small"
            label="Search users"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            sx={{ mb: 2, width: 320 }}
          />
          {!loading && <Paper sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Posts</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      {/* component="div": Typography renders a <p> by default,
                          and Chip renders a <div>. A <div> inside a <p> is
                          invalid HTML — React logs "In HTML, <div> cannot be a
                          descendant of <p>" and the browser silently closes the
                          paragraph early, which breaks the layout of this cell. */}
                      <Typography variant="body2" fontWeight="bold" component="div">
                        {u.name} {u.is_agent ? <Chip size="small" label="agent" sx={{ ml: 1 }} /> : null}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                    </TableCell>
                    <TableCell>
                      {isAdmin && u.id !== currentUser.id ? (
                        <Select
                          size="small"
                          value={u.role}
                          onChange={(e) => act(() => setUserRole(u.id, e.target.value), "Role updated")}
                          sx={{ minWidth: 130 }}
                        >
                          <MenuItem value="user">user</MenuItem>
                          <MenuItem value="moderator">moderator</MenuItem>
                          <MenuItem value="admin">admin</MenuItem>
                        </Select>
                      ) : (
                        <Chip size="small" label={u.role} />
                      )}
                    </TableCell>
                    <TableCell>{u.post_count}</TableCell>
                    <TableCell>
                      {u.is_banned
                        ? <Chip size="small" color="error" label="banned" />
                        : <Chip size="small" color="success" label="active" />}
                    </TableCell>
                    <TableCell>
                      {u.id !== currentUser.id && u.role !== "admin" && (
                        <Button
                          size="small"
                          color={u.is_banned ? "success" : "error"}
                          onClick={() =>
                            act(() => setUserBanned(u.id, !u.is_banned),
                                u.is_banned ? "Account restored" : "Account banned")
                          }
                        >
                          {u.is_banned ? "Unban" : "Ban"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>}
        </>
      )}
    </Box>
  );
}

export default AdminDashboard;
