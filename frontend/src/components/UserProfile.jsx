// my-YBO-app/src/components/UserProfile.jsx

import { useEffect, useState } from "react";
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
import { followUser, unfollowUser, checkIfFollowing } from "../api/api";
import SinglePost from "./SinglePost";

function UserProfile() {
  const { id } = useParams();

  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [isFollowing, setIsFollowing] = useState(false);

  const { currentUser } = useAuth();

  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const response = await fetch(
          `http://localhost:5000/api/users/${id}`
        );

        const data = await response.json();

        setUser(data.user);
        setPosts(data.posts || []);
        setFollowers(data.user.followers || 0);
        setFollowing(data.user.following || 0);
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
        setError("Failed to load user profile");
      }
    }

    fetchUserProfile();
  }, [id]);

  useEffect(() => {
    async function checkFollowingStatus() {
      if (!currentUser || !user) return;
      if (currentUser.id === user.id) return;

      const result = await checkIfFollowing(currentUser.id, user.id);
      setIsFollowing(result.isFollowing);
    }

    checkFollowingStatus();
  }, [currentUser, user]);

  async function handleFollowClick() {
    if (!currentUser || !user) return;

    if (isFollowing) {
      await unfollowUser(currentUser.id, user.id);
      setIsFollowing(false);
      setFollowers((prev) => prev - 1);
    } else {
      await followUser(currentUser.id, user.id);
      setIsFollowing(true);
      setFollowers((prev) => prev + 1);
    }
  }

  if (error) {
    return (
      <Box sx={{ mt: 4, textAlign: "center" }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", mt: 4 }}>
      <Card>
        <CardContent>
          <Avatar
            src={user.profile_picture}
            alt={user.name}
            sx={{ width: 100, height: 100, mb: 2 }}
          />

          <Typography variant="h5">
            {user.name || "Unknown User"}
          </Typography>

          <Typography color="text.secondary">{user.email}</Typography>

          <Typography sx={{ mt: 2 }}>
            {user.bio || "No bio yet"}
          </Typography>

          <Box sx={{ display: "flex", gap: 4, mt: 3 }}>
            <Typography variant="body1">
              <strong>Followers:</strong> {followers}
            </Typography>

            <Typography variant="body1">
              <strong>Following:</strong> {following}
            </Typography>
          </Box>

          {currentUser && currentUser.id !== user.id && (
            <Button
              variant={isFollowing ? "outlined" : "contained"}
              onClick={handleFollowClick}
              sx={{ mt: 3 }}
            >
              {isFollowing ? "Unfollow" : "Follow"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mt: 4, mb: 2, textAlign: "center" }}>
        User Posts
      </Typography>

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <Button
          variant={viewMode === "grid" ? "contained" : "outlined"}
          onClick={() => setViewMode("grid")}
        >
          Grid
        </Button>

        <Button
          variant={viewMode === "list" ? "contained" : "outlined"}
          onClick={() => setViewMode("list")}
        >
          List
        </Button>
      </Box>

      {posts.length === 0 ? (
        <Typography sx={{ mt: 2 }}>
          This user has no posts yet.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              viewMode === "grid"
                ? "repeat(auto-fill, minmax(250px, 1fr))"
                : "1fr",
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