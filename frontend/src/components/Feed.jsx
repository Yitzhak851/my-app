// my-YBO-app/src/components/Feed.jsx

import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import SinglePost from "./SinglePost";
import ViewModeToggle from "./ViewModeToggle";
import { VIEW_MODES, gridColumnsFor } from "./viewMode";
import { fetchPosts } from "../api/api";
import { useAuth } from "../auth/AuthContext";

function Feed() {
  const { userId } = useParams();

  const [posts, setPosts] = useState([]);
  const [start, setStart] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState(VIEW_MODES.GRID);
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

      // The server resolves "following" from the session, so no user id here.
      const newPosts = await fetchPosts(
        currentStart,
        limit,
        userId,
        feedFilter === "following"
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
        // width:100% matters. #root is a column flex container, and a flex item
        // with `margin-inline: auto` does NOT stretch — it sizes to its content.
        // Without this the feed sat at ~1027px on any screen, which is why the
        // grid could only ever fit two columns.
        width: "100%",
        maxWidth: viewMode === VIEW_MODES.GRID ? 1320 : 700,
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

      <ViewModeToggle value={viewMode} onChange={setViewMode} sx={{ mb: 3 }} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: gridColumnsFor(viewMode, 300),
          gap: 3,
        }}
      >
        {posts.map((post) => (
          <SinglePost key={post.id} post={post} viewMode={viewMode} />
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