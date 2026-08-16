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
import {
  analyzeText,
  autocorrectText,
  createPost,
  generatePostDraft,
  uploadImage,
} from "../api/api";
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState("");
  const [toneWarning, setToneWarning] = useState(null);

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

  // ── writing help (requirement 2.c) ──────────────────────────────────────
  // Every one of these is a suggestion. Nothing rewrites the text without the
  // person pressing a button, and nothing blocks publishing.

  async function handleAutocorrect() {
    const plain = quillRef.current?.getText() || "";
    if (!plain.trim()) return;

    setAiBusy(true);
    setAiNotice("");
    try {
      const { corrected, changes } = await autocorrectText(plain);
      if (!changes?.length) {
        setAiNotice("No spelling suggestions — looks clean.");
      } else {
        quillRef.current.setText(corrected);
        setBody(quillRef.current.root.innerHTML);
        setAiNotice(
          `Fixed ${changes.length}: ` +
            changes.slice(0, 5).map((c) => `${c.from} → ${c.to}`).join(", ") +
            (changes.length > 5 ? "..." : "")
        );
      }
    } catch {
      setAiNotice("Suggestions are unavailable right now.");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleGenerateDraft() {
    setAiBusy(true);
    setAiNotice("");
    try {
      const draft = await generatePostDraft();
      if (!title.trim()) setTitle(draft.title);
      quillRef.current?.clipboard.dangerouslyPasteHTML(draft.body);
      setBody(quillRef.current?.root.innerHTML || draft.body);
      setAiNotice("Draft inserted — edit it into your own words.");
    } catch {
      setAiNotice("Could not generate a draft right now.");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCheckTone() {
    const plain = quillRef.current?.getText() || "";
    setAiBusy(true);
    setAiNotice("");
    try {
      const result = await analyzeText(`${title} ${plain}`);
      setToneWarning(result.is_toxic ? result : null);
      if (!result.is_toxic) setAiNotice("Tone check passed.");
    } catch {
      setToneWarning(null);
    } finally {
      setAiBusy(false);
    }
  }

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

            <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap", mb: 1 }}>
              <Button size="small" onClick={handleGenerateDraft} disabled={aiBusy}>
                Suggest a draft
              </Button>
              <Button size="small" onClick={handleAutocorrect} disabled={aiBusy}>
                Fix spelling
              </Button>
              <Button size="small" onClick={handleCheckTone} disabled={aiBusy}>
                Check tone
              </Button>
            </Box>

            {aiNotice && (
              <Alert severity="info" sx={{ mb: 2 }} onClose={() => setAiNotice("")}>
                {aiNotice}
              </Alert>
            )}

            {toneWarning && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                This reads as hostile{toneWarning.matches?.length
                  ? ` (${toneWarning.matches.join(", ")})`
                  : ""}. You can still publish it, but a moderator will see it.
              </Alert>
            )}
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
