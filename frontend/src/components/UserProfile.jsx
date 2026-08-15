// my-YBO-app/src/components/UserProfile.jsx
//
// Profile page: name, bio, picture, follower/following counts and the user's
// own posts (course requirements 1.b and 1.c.ii).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useAuth } from "../auth/AuthContext";
import {
  fetchUser,
  fetchFollowStats,
  fetchPosts,
  followUser,
  unfollowUser,
  checkIfFollowing,
} from "../api/api";
import SinglePost from "./SinglePost";
import ViewModeToggle from "./ViewModeToggle";
import { VIEW_MODES, gridColumnsFor } from "./viewMode";

const PROFILE_POST_LIMIT = 20;

function UserProfile() {
  const { id } = useParams();
  const { currentUser } = useAuth();

  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState(VIEW_MODES.GRID);
  const [busy, setBusy] = useState(false);

  const isOwnProfile = Boolean(currentUser && user && currentUser.id === user.id);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The three calls are independent, so run them together rather than
      // waiting for each in turn.
      const [userData, statsData, postsData] = await Promise.all([
        fetchUser(id),
        fetchFollowStats(id),
        fetchPosts(0, PROFILE_POST_LIMIT, id),
      ]);

      if (!userData || !userData.id) {
        throw new Error("User not found");
      }

      setUser(userData);
      setStats({
        followers: statsData?.followers ?? 0,
        following: statsData?.following ?? 0,
        posts: statsData?.posts ?? 0,
      });
      setPosts(Array.isArray(postsData) ? postsData : []);
    } catch (err) {
      setError(err.message || "Failed to load user profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    async function loadFollowState() {
      if (!currentUser || !user || currentUser.id === user.id) {
        setIsFollowing(false);
        return;
      }
      try {
        const following = await checkIfFollowing(user.id);
        if (!cancelled) setIsFollowing(following);
      } catch {
        // A failed check should not break the page; default to "not following".
        if (!cancelled) setIsFollowing(false);
      }
    }

    loadFollowState();
    return () => {
      cancelled = true;
    };
  }, [currentUser, user]);

  async function handleFollowClick() {
    if (!currentUser || !user || busy) return;

    const wasFollowing = isFollowing;
    setBusy(true);

    // Optimistic update, rolled back if the request fails.
    setIsFollowing(!wasFollowing);
    setStats((s) => ({
      ...s,
      followers: s.followers + (wasFollowing ? -1 : 1),
    }));

    try {
      if (wasFollowing) await unfollowUser(user.id);
      else await followUser(user.id);
    } catch (err) {
      setIsFollowing(wasFollowing);
      setStats((s) => ({
        ...s,
        followers: s.followers + (wasFollowing ? 1 : -1),
      }));
      setError(err.message || "Could not update follow status");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ mt: 6, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !user) {
    return (
      <Box sx={{ mt: 6, textAlign: "center" }}>
        <Typography color="error" sx={{ mb: 2 }}>
          {error || "User not found"}
        </Typography>
        <Button variant="outlined" onClick={load}>
          Try again
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", maxWidth: 1100, mx: "auto", mt: 4, px: 2, mb: 6 }}>
      <Card>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              gap: 3,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Avatar
              src={user.profile_picture}
              alt={`${user.name || "User"} profile picture`}
              sx={{ width: 100, height: 100 }}
            />

            <Box sx={{ minWidth: 0, textAlign: "start" }}>
              <Typography variant="h5">{user.name || "Unknown User"}</Typography>
              {/* Email is intentionally not shown: it is private and the API
                  no longer returns it for other people's profiles. */}
              <Typography sx={{ mt: 1 }}>{user.bio || "No bio yet"}</Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 4, mt: 3, flexWrap: "wrap" }}>
            <Typography>
              <strong>Followers:</strong> {stats.followers}
            </Typography>
            <Typography>
              <strong>Following:</strong> {stats.following}
            </Typography>
            <Typography>
              <strong>Posts:</strong> {stats.posts}
            </Typography>
          </Box>

          {currentUser && !isOwnProfile && (
            <Button
              variant={isFollowing ? "outlined" : "contained"}
              onClick={handleFollowClick}
              disabled={busy}
              sx={{ mt: 3 }}
            >
              {isFollowing ? "Unfollow" : "Follow"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mt: 4, mb: 2, textAlign: "center" }}>
        {isOwnProfile ? "My Posts" : "User Posts"}
      </Typography>

      {posts.length > 0 && (
        <ViewModeToggle value={viewMode} onChange={setViewMode} sx={{ mb: 2 }} />
      )}

      {posts.length === 0 ? (
        <Typography sx={{ mt: 2, textAlign: "center" }}>
          {isOwnProfile
            ? "You have not posted anything yet."
            : "This user has no posts yet."}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: gridColumnsFor(viewMode, 260),
            gap: 2,
          }}
        >
          {posts.map((post) => (
            <SinglePost key={post.id} post={post} viewMode={viewMode} />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default UserProfile;
