// my-YBO-app/src/components/SuggestedUsers.jsx
//
// "Suggested users" (optional requirement 3.e.i).
//
// People followed by the people you follow, ranked by how many of them. The
// count is shown as the reason — "Followed by 2 people you follow" tells you
// why this name is here, where a bare list does not.
//
// Signed-in only: the suggestions describe your own follow graph, so there is
// nothing to show a visitor and nothing to ask the server for.

import { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Link as MuiLink,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchSuggestedUsers, followUser } from "../api/api";

const HOW_MANY = 5;

function SuggestedUsers() {
  const { isLoggedIn } = useAuth();

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Ids currently being followed, so a second click cannot double-post.
  const [pending, setPending] = useState([]);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError("");
    try {
      const list = await fetchSuggestedUsers(HOW_MANY);
      setSuggestions(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || "Could not load suggestions");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFollow(user) {
    setPending((ids) => [...ids, user.id]);
    setError("");
    try {
      await followUser(user.id);
      // Drop the row rather than leaving a "Following" button nobody will press
      // again — the whole panel is about who is NOT followed yet.
      setSuggestions((list) => list.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err.message || "Could not follow this user");
    } finally {
      setPending((ids) => ids.filter((id) => id !== user.id));
    }
  }

  // Nothing to say to a visitor, and nothing worth an empty box to anyone else.
  if (!isLoggedIn) return null;
  if (!loading && !error && suggestions.length === 0) return null;

  return (
    <Card sx={{ mb: 3 }} data-testid="suggested-users">
      <CardContent>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
          Suggested for you
        </Typography>
        <Typography variant="caption" color="text.secondary">
          People followed by the people you follow
        </Typography>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", my: 2 }}>
            <CircularProgress size={22} />
          </Box>
        )}

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}

        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          {suggestions.map((user) => (
            <Box
              key={user.id}
              sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
            >
              <Avatar
                src={user.profile_picture}
                alt=""
                sx={{ width: 40, height: 40 }}
              />

              <Box sx={{ minWidth: 0, flexGrow: 1, textAlign: "start" }}>
                <MuiLink
                  component={Link}
                  to={`/users/${user.id}`}
                  underline="hover"
                  color="inherit"
                  sx={{ fontWeight: "bold", fontSize: "0.9rem" }}
                >
                  {user.name || "Unknown user"}
                </MuiLink>
                {user.is_agent && (
                  <Chip size="small" label="agent" sx={{ ml: 1, height: 18 }} />
                )}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {user.reason}
                </Typography>
              </Box>

              <Button
                size="small"
                variant="outlined"
                disabled={pending.includes(user.id)}
                onClick={() => handleFollow(user)}
              >
                Follow
              </Button>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

export default SuggestedUsers;
