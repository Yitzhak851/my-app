// my-YBO-app/src/components/PostInteractions.jsx
//
// Likes and comments for a single post (requirements 2.b.i and 2.b.ii).
//
// Kept out of SinglePost so the card stays about presentation and this file
// owns the interaction state.

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { useAuth } from "../auth/AuthContext";
import {
  createComment,
  deleteComment,
  fetchComments,
  fetchCommentSuggestions,
  likePost,
  unlikePost,
} from "../api/api";
import { timeAgo } from "./timeAgo";
import ReportButton from "./ReportButton";

const MAX_COMMENT_LENGTH = 1000;

function PostInteractions({ post }) {
  const { currentUser, isLoggedIn } = useAuth();

  const [liked, setLiked] = useState(Boolean(post.liked_by_me));
  const [likeCount, setLikeCount] = useState(Number(post.like_count) || 0);
  const [likeBusy, setLikeBusy] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null); // null = not loaded yet
  const [commentCount, setCommentCount] = useState(Number(post.comment_count) || 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [notice, setNotice] = useState("");

  const canModerate = ["admin", "moderator"].includes(currentUser?.role);

  async function toggleLike() {
    if (!isLoggedIn || likeBusy) return;

    const wasLiked = liked;
    setLikeBusy(true);
    // Optimistic, rolled back on failure. The server's count is authoritative
    // once it answers, because other people are liking at the same time.
    setLiked(!wasLiked);
    setLikeCount((n) => n + (wasLiked ? -1 : 1));
    setError("");

    try {
      const result = wasLiked ? await unlikePost(post.id) : await likePost(post.id);
      setLiked(result.liked);
      setLikeCount(result.count);
    } catch (err) {
      setLiked(wasLiked);
      setLikeCount((n) => n + (wasLiked ? 1 : -1));
      setError(err.message || "Could not update the like");
    } finally {
      setLikeBusy(false);
    }
  }

  async function toggleComments() {
    const opening = !showComments;
    setShowComments(opening);

    // Fetched on first open rather than with the feed, so a page of posts is
    // one request instead of one per post.
    if (opening && comments === null) {
      setLoadingComments(true);
      try {
        const list = await fetchComments(post.id);
        setComments(Array.isArray(list) ? list : []);
      } catch (err) {
        setError(err.message || "Could not load comments");
        setComments([]);
      } finally {
        setLoadingComments(false);
      }

      // Reply suggestions (requirement 2.c). Best-effort: if this fails the
      // comment box still works, it just has no shortcuts above it.
      if (isLoggedIn) {
        try {
          const { suggestions: list } = await fetchCommentSuggestions(post.id);
          setSuggestions(Array.isArray(list) ? list : []);
        } catch {
          setSuggestions([]);
        }
      }
    }
  }

  async function handleSubmitComment(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;

    setPosting(true);
    setError("");
    try {
      const { comment, flagged } = await createComment(post.id, body);
      setComments((prev) => [...(prev || []), comment]);
      setCommentCount((n) => n + 1);
      setDraft("");
      // The comment is published either way; the author simply deserves to know
      // a moderator will look at it.
      setNotice(flagged ? "Posted — a moderator will review this one." : "");
    } catch (err) {
      setError(err.message || "Could not post the comment");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(commentId) {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentCount((n) => Math.max(0, n - 1));
    } catch (err) {
      setError(err.message || "Could not delete the comment");
    }
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1 }} />

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          onClick={toggleLike}
          disabled={!isLoggedIn || likeBusy}
          aria-label={liked ? "Unlike this post" : "Like this post"}
          aria-pressed={liked}
          color={liked ? "error" : "default"}
          size="small"
        >
          {liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
        </IconButton>
        <Typography variant="body2" data-testid="like-count">
          {likeCount}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />
        <ReportButton postId={post.id} />
      </Box>

      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Button
          onClick={toggleComments}
          startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
          size="small"
          sx={{ ml: 1, textTransform: "none" }}
          aria-expanded={showComments}
        >
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </Button>
      </Box>

      {!isLoggedIn && (
        <Typography variant="caption" color="text.secondary">
          Sign in to like and comment.
        </Typography>
      )}

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      {notice && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          {notice}
        </Typography>
      )}

      {showComments && (
        <Box sx={{ mt: 2, textAlign: "start" }}>
          {loadingComments && <CircularProgress size={20} />}

          {!loadingComments && comments?.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No comments yet.
            </Typography>
          )}

          {comments?.map((comment) => (
            <Box key={comment.id} sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight="bold" component="span">
                {comment.name || "Unknown user"}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {timeAgo(comment.created_at)}
              </Typography>
              {/* Comment bodies are plain text and rendered as text — never as
                  HTML — so nothing a commenter types can become markup. */}
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {comment.body}
              </Typography>

              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                {(comment.user_id === currentUser?.id || canModerate) && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleDelete(comment.id)}
                    sx={{ textTransform: "none", p: 0, minWidth: 0 }}
                  >
                    Delete
                  </Button>
                )}
                <ReportButton commentId={comment.id} />
              </Box>
            </Box>
          ))}

          {isLoggedIn && (
            <Box component="form" onSubmit={handleSubmitComment} sx={{ mt: 2 }}>
              {suggestions.length > 0 && !draft && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Suggested replies:
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    {suggestions.map((text) => (
                      <Chip
                        key={text}
                        label={text}
                        size="small"
                        variant="outlined"
                        onClick={() => setDraft(text)}
                      />
                    ))}
                  </Box>
                </Box>
              )}
              <TextField
                fullWidth
                multiline
                minRows={2}
                size="small"
                placeholder="Write a comment..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                slotProps={{ htmlInput: { maxLength: MAX_COMMENT_LENGTH, "aria-label": "Write a comment" } }}
              />
              <Button
                type="submit"
                variant="contained"
                size="small"
                sx={{ mt: 1 }}
                disabled={posting || !draft.trim()}
              >
                {posting ? "Posting..." : "Comment"}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default PostInteractions;
