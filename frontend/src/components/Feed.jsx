// my-YBO-app/src/components/Feed.jsx

import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import SinglePost from "./SinglePost";
import { fetchPosts } from "../api/api";
import { useAuth } from "../auth/AuthContext";

function Feed() {
  const { userId } = useParams();

  const [posts, setPosts] = useState([]);
  const [start, setStart] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [feedFilter, setFeedFilter] = useState("all");
  const [hasMore, setHasMore] = useState(true);

  const { currentUser } = useAuth();

  async function loadPosts(reset = false) {
    try {
      if (loading) return;
      if (!reset && !hasMore) return;

      setLoading(true);

      const currentStart = reset ? 0 : start;
      const limit = 10;

      const newPosts = await fetchPosts(
        currentStart,
        limit,
        userId,
        feedFilter === "following",
        currentUser?.id
      );

      setPosts((prevPosts) =>
        reset ? newPosts : [...prevPosts, ...newPosts]
      );

      setStart(currentStart + newPosts.length);
      setHasMore(newPosts.length === limit);
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPosts([]);
    setStart(0);
    setHasMore(true);
    loadPosts(true);
  }, [userId, feedFilter]);

  useEffect(() => {
    function handleScroll() {
      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200;

      if (nearBottom && !loading && hasMore) {
        loadPosts(false);
      }
    }

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [loading, hasMore, start, feedFilter, userId]);

  return (
    <Box
      sx={{
        maxWidth: viewMode === "grid" ? 1200 : 700,
        mx: "auto",
        mt: 4,
        mb: 4,
        px: 2,
      }}
    >
      {currentUser && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 2,
            mb: 3,
          }}
        >
          <Button
            variant={feedFilter === "all" ? "contained" : "outlined"}
            onClick={() => setFeedFilter("all")}
          >
            כל הפוסטים
          </Button>

          <Button
            variant={feedFilter === "following" ? "contained" : "outlined"}
            onClick={() => setFeedFilter("following")}
          >
            רק מי שאני עוקב אחריו
          </Button>
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 2,
          mb: 3,
        }}
      >
        <Button
          variant={viewMode === "grid" ? "contained" : "outlined"}
          onClick={() => setViewMode("grid")}
        >
          Grid View
        </Button>

        <Button
          variant={viewMode === "list" ? "contained" : "outlined"}
          onClick={() => setViewMode("list")}
        >
          List View
        </Button>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            viewMode === "grid"
              ? "repeat(auto-fit, minmax(320px, 1fr))"
              : "1fr",
          gap: 3,
        }}
      >
        {posts.map((post) => (
          <SinglePost key={post.id} post={post} />
        ))}
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && !hasMore && posts.length > 0 && (
        <Typography align="center" sx={{ mt: 4 }}>
          אין עוד פוסטים לטעון
        </Typography>
      )}
    </Box>
  );
}

export default Feed;