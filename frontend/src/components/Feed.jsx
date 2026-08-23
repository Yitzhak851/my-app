// my-YBO-app/src/components/Feed.jsx

import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { Link, useParams } from "react-router-dom";
import SinglePost from "./SinglePost";
import SuggestedUsers from "./SuggestedUsers";
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
  const [error, setError] = useState("");

  const { currentUser } = useAuth();

  // A request that was cut short because the page is going away is not a
  // failure anyone needs to be told about — and the component is gone, so
  // setting state on it is pointless.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Identifies the newest request. Switching filter starts a new one, and any
  // older reply that arrives afterwards is discarded rather than applied on
  // top of it.
  const generation = useRef(0);
  // Guards only the scroll path, so two "load the next page" calls cannot
  // fire at once. A filter change must never be blocked by it.
  const appending = useRef(false);

  async function loadPosts(reset = false) {
    // `if (loading) return` used to guard both paths, and it was wrong for the
    // filter buttons: clicking one while the first page was still loading
    // cleared the posts, hit the guard, returned immediately — and the earlier
    // request's `finally` then turned the spinner off. The result was a blank
    // feed with no posts, no spinner and no error, which looks exactly like a
    // broken server. A switch of filter has to supersede what is in flight,
    // not be dropped by it.
    if (!reset && (appending.current || !hasMore)) return;

    const requestId = ++generation.current;
    if (!reset) appending.current = true;

    try {
      setLoading(true);
      setError("");

      const currentStart = reset ? 0 : start;
      const limit = 10;

      // The server resolves "following" from the session, so no user id here.
      const newPosts = await fetchPosts(
        currentStart,
        limit,
        userId,
        feedFilter === "following"
      );

      // A reply to a request that has since been superseded describes the
      // wrong feed. Dropping it is the whole point of the generation number.
      if (generation.current !== requestId) return;

      setPosts((prevPosts) =>
        reset ? newPosts : [...prevPosts, ...newPosts]
      );

      setStart(currentStart + newPosts.length);
      setHasMore(newPosts.length === limit);
    } catch (err) {
      if (!mounted.current || generation.current !== requestId) return;
      // The feed used to swallow this into console.error, so a backend that was
      // down produced a blank page with no explanation and no way to retry.
      setError(err.message || "Could not load posts");
    } finally {
      if (!reset) appending.current = false;
      if (mounted.current && generation.current === requestId) setLoading(false);
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
        // Room for the sidebar alongside the widest grid.
        maxWidth: viewMode === VIEW_MODES.GRID ? 1640 : 1020,
        mx: "auto",
        mt: 4,
        mb: 4,
        px: 2,
        display: "flex",
        gap: 3,
        alignItems: "flex-start",
      }}
    >
      <Box
        sx={{
          // minWidth: 0 is what stops a grid child from forcing the whole
          // flex row wider than the viewport — a flex item's default
          // min-width is auto, which means "at least my content".
          minWidth: 0,
          flexGrow: 1,
          maxWidth: viewMode === VIEW_MODES.GRID ? 1320 : 700,
          mx: "auto",
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

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => loadPosts(true)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Box sx={{ display: { xs: "block", lg: "none" } }}>
        <SuggestedUsers />
      </Box>

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

      {/* An empty feed needs to say WHICH feed is empty and why. "אין עדיין
          פוסטים להצגה" on the personal feed, one click after seeing ten posts
          on the global one, reads as a broken page — the actual reason is
          that this person does not follow anybody yet. */}
      {!loading && !error && posts.length === 0 && (
        feedFilter === "following" ? (
          <Box sx={{ mt: 5, textAlign: "center" }} data-testid="empty-following">
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              אין כאן פוסטים מהאנשים שאתה עוקב אחריהם.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              אם עדיין לא עקבת אחרי אף אחד — זה המקום להתחיל.
            </Typography>
            <Button variant="contained" component={Link} to="/users">
              למצוא אנשים לעקוב אחריהם
            </Button>
            <Button sx={{ ml: 1 }} onClick={() => setFeedFilter("all")}>
              חזרה לכל הפוסטים
            </Button>
          </Box>
        ) : (
          <Typography align="center" color="text.secondary" sx={{ mt: 4 }}>
            אין עדיין פוסטים להצגה
          </Typography>
        )
      )}

      {!loading && !hasMore && posts.length > 0 && (
        <Typography align="center" sx={{ mt: 4 }}>
          אין עוד פוסטים לטעון
        </Typography>
      )}
      </Box>

      {/* The sidebar (optional requirement 3.e.i). Hidden below lg, where
          there is no room beside the feed — the panel is then shown above the
          posts instead, so a phone still gets it. */}
      <Box sx={{ width: 300, flexShrink: 0, display: { xs: "none", lg: "block" } }}>
        <SuggestedUsers />
      </Box>
    </Box>
  );
}

export default Feed;