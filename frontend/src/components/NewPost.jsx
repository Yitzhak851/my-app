// my-YBO-app/src/components/NewPost.jsx

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { createPost } from "../api/api";
import Quill from "quill";
import "quill/dist/quill.snow.css";

function NewPost() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const editorRef = useRef(null);
  const quillRef = useRef(null);

  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (editorRef.current && !quillRef.current) {
      quillRef.current = new Quill(editorRef.current, {
        theme: "snow",
        placeholder: "Write your post content here...",
        modules: {
          toolbar: [
            ["bold", "italic", "underline"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link"],
            ["clean"],
          ],
        },
      });

      quillRef.current.on("text-change", () => {
        setBody(quillRef.current.root.innerHTML);
      });
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const plainText = quillRef.current?.getText().trim();

    if (!currentUser) {
      setError("You must be logged in to create a post");
      return;
    }

    if (!title.trim() || !plainText) {
      setError("Title and body are required");
      return;
    }

    try {
      await createPost({
        userId: currentUser.id,
        title,
        body,
        image_url: imageUrl,
      });

      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 7 }}>
      <Card sx={{ borderRadius: 2, p: 2, boxShadow: 3 }}>
        <CardContent>
          <Typography
            variant="h5"
            fontWeight="bold"
            align="center"
            sx={{ mb: 4 }}
          >
            Create New Post
          </Typography>

          <form onSubmit={handleSubmit}>
            <Typography align="center" fontWeight="bold" sx={{ mb: 1 }}>
              Title
            </Typography>

            <TextField
              fullWidth
              placeholder="Enter post title..."
              size="small"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              sx={{ mb: 3 }}
            />

            <Typography align="center" fontWeight="bold" sx={{ mb: 1 }}>
              Image URL (optional)
            </Typography>

            <TextField
              fullWidth
              placeholder="https://example.com/photo.jpg"
              size="small"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Typography align="center" fontWeight="bold" sx={{ mb: 1 }}>
              Body
            </Typography>

            <Box
              sx={{
                mb: 2,
                "& .ql-container": {
                  minHeight: "210px",
                  fontSize: "14px",
                },
                "& .ql-editor": {
                  minHeight: "210px",
                },
              }}
            >
              <Box ref={editorRef} />
            </Box>

            {error && (
              <Typography color="error" sx={{ mt: 2 }}>
                {error}
              </Typography>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              type="submit"
              sx={{
                mt: 1,
                py: 1.3,
                fontWeight: "bold",
                backgroundColor: "#5865f2",
                "&:hover": {
                  backgroundColor: "#4752c4",
                },
              }}
            >
              PUBLISH
            </Button>
          </form>
        </CardContent>
      </Card>
    </Container>
  );
}

export default NewPost;