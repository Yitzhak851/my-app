// my-YBO-app/src/components/UserProfile.jsx
//
// Profile page: name, bio, picture, follower/following counts and the user's
// own posts (course requirements 1.b and 1.c.ii).

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Two different severities, deliberately two different pieces of state.
  // `error` means the profile could not be loaded at all and the page is
  // replaced by a retry screen. `actionError` means one button did not work —
  // the profile is fine and stays on screen. Sharing one variable meant a
  // failed Follow click replaced the whole profile with "Try again".
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [viewMode, setViewMode] = useState(VIEW_MODES.GRID);
  const [busy, setBusy] = useState(false);

  // Identifies the follow state currently believed to be correct. Both the
  // background check and the button bump it; a check whose number is out of
  // date has been overtaken and its answer is thrown away.
  const followGeneration = useRef(0);

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
    // This check races the Follow button, and it used to win.
    //
    // The sequence: the profile renders, the check goes out, and the button is
    // already on screen — so it can be pressed while the answer is still in
    // flight. The button set "following" optimistically, then the check
    // resolved with the answer from before the click and set it straight back
    // to "not following". The server had recorded the follow; the screen said
    // it had not. Pressing the button again then unfollowed.
    //
    // The generation number is what settles it: pressing the button retires
    // every check already in flight.
    const generation = ++followGeneration.current;
    const current = () => followGeneration.current === generation;

    async function loadFollowState() {
      if (!currentUser || !user || currentUser.id === user.id) {
        if (current()) setIsFollowing(false);
        return;
      }
      try {
        const following = await checkIfFollowing(user.id);
        if (current()) setIsFollowing(following);
      } catch {
        // A failed check should not break the page; default to "not following".
        if (current()) setIsFollowing(false);
      }
    }

    loadFollowState();
  }, [currentUser, user]);

  async function handleFollowClick() {
    if (!currentUser || !user || busy) return;

    const wasFollowing = isFollowing;
    setBusy(true);
    setActionError("");

    // Anything the background check is about to say is now out of date: this
    // click is the newer truth.
    followGeneration.current += 1;

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
      setActionError(err.message || "Could not update follow status");
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

          {actionError && (
            <Typography color="error" variant="body2" sx={{ mt: 2 }}>
              {actionError}
            </Typography>
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
