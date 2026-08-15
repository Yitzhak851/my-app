// my-YBO-app/src/components/NewPost.jsx
//
// Create a post: title, an optional image, and rich text (requirement 1.e).
//
// The image is a real file upload. Before this the form only took a URL to an
// image hosted somewhere else, which does not satisfy "create a post (text and
// image)" — nothing was ever uploaded.

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { createPost, uploadImage } from "../api/api";
import Quill from "quill";
import "quill/dist/quill.snow.css";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = "image/png,image/jpeg,image/gif,image/webp";

function NewPost() {
  const navigate = useNavigate();

  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  // Object URLs hold the file in memory until they are revoked.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    setError("");

    if (!file) return;

    if (!ACCEPTED.split(",").includes(file.type)) {
      setError("Please choose a PNG, JPEG, GIF or WEBP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is larger than 5 MB.");
      event.target.value = "";
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;

    setImageFile(file);
    setPreviewUrl(url);
  }

  function clearImage() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setImageFile(null);
    setPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const plainText = quillRef.current?.getText().trim();

    if (!title.trim() || !plainText) {
      setError("Title and body are required");
      return;
    }

    setSubmitting(true);
    try {
      // Upload first, so a failed upload does not leave a post with a broken
      // image reference.
      let imageUrl = null;
      if (imageFile) {
        const uploaded = await uploadImage(imageFile);
        imageUrl = uploaded.url;
      }

      await createPost({ title: title.trim(), body, image_url: imageUrl });
      navigate("/");
    } catch (err) {
      setError(err.message || "Could not publish the post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 7, mb: 6 }}>
      <Card sx={{ borderRadius: 2, p: 2, boxShadow: 3 }}>
        <CardContent>
          <Typography variant="h5" fontWeight="bold" align="center" sx={{ mb: 4 }}>
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
              Image (optional)
            </Typography>

            <Box sx={{ mb: 3, textAlign: "center" }}>
              <Button variant="outlined" component="label" disabled={submitting}>
                Choose image
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  hidden
                  onChange={handleFileChange}
                  data-testid="image-input"
                />
              </Button>

              {previewUrl && (
                <Box sx={{ mt: 2 }}>
                  <Box
                    component="img"
                    src={previewUrl}
                    alt="Preview of the image you selected"
                    sx={{
                      maxWidth: "100%",
                      maxHeight: 240,
                      borderRadius: 2,
                      display: "block",
                      mx: "auto",
                      border: "1px solid #ddd",
                    }}
                  />
                  <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
                    {imageFile?.name}
                  </Typography>
                  <IconButton
                    aria-label="Remove the selected image"
                    onClick={clearImage}
                    size="small"
                  >
                    <Typography variant="body2">Remove</Typography>
                  </IconButton>
                </Box>
              )}
            </Box>

            <Typography align="center" fontWeight="bold" sx={{ mb: 1 }}>
              Body
            </Typography>
            <Box
              sx={{
                mb: 2,
                "& .ql-container": { minHeight: "210px", fontSize: "14px" },
                "& .ql-editor": { minHeight: "210px", textAlign: "start" },
              }}
            >
              <Box ref={editorRef} />
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              type="submit"
              disabled={submitting}
              sx={{
                mt: 2,
                py: 1.3,
                fontWeight: "bold",
                backgroundColor: "#5865f2",
                "&:hover": { backgroundColor: "#4752c4" },
              }}
            >
              {submitting ? <CircularProgress size={24} color="inherit" /> : "PUBLISH"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Container>
  );
}

export default NewPost;
