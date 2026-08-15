// my-YBO-app/src/components/SinglePost.jsx

import { useState } from "react";
import { Card, CardContent, Typography, Button, Box } from "@mui/material";
import DOMPurify from "dompurify";
import "quill/dist/quill.snow.css";

function decodeHtml(html) {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

function timeAgo(dateString) {
  if (!dateString) return "";

  const postDate = new Date(dateString);
  const now = new Date();

  const diffMs = now - postDate;
  const diffMinutes = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "הרגע";
  if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`;

  if (diffHours < 24) {
    const minutes = diffMinutes % 60;
    if (minutes === 0) return `לפני ${diffHours} שעות`;
    return `לפני ${diffHours} שעות ו-${minutes} דקות`;
  }

  if (diffDays === 1) return "לפני יום אחד";
  return `לפני ${diffDays} ימים`;
}

function SinglePost({ post, viewMode = "list" }) {

  console.log("POST BODY:", post.body);

  const [expanded, setExpanded] = useState(false);

  const isGrid = viewMode === "grid";
  const fallbackImage = `https://picsum.photos/600/400?random=${post.id}`;
  const postImage = post.image_url || fallbackImage;

  const decodedBody = decodeHtml(post.body || "");
  const cleanBody = DOMPurify.sanitize(decodedBody);

  return (
    <Card sx={{ p: 2, height: "100%", overflow: "hidden" }}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            flexDirection: isGrid ? "column" : "row",
            gap: 3,
            alignItems: "flex-start",
          }}
        >
          <Box
            sx={{
              width: isGrid ? "100%" : 260,
              minWidth: isGrid ? "100%" : 260,
              height: isGrid ? 180 : 170,
              borderRadius: 2,
              overflow: "hidden",
              backgroundColor: "#eeeeee",
              border: "1px solid #ddd",
            }}
          >
            <Box
              component="img"
              src={postImage}
              alt={post.title}
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </Box>

          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              overflowWrap: "break-word",
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: "bold", mb: 1 }}>
              {post.title}
            </Typography>

            <Typography
              variant="body2"
              color="primary"
              sx={{ mb: 1, fontStyle: "italic" }}
            >
              {post.name || post.email}
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              הפוסט עלה {timeAgo(post.created_at)}
            </Typography>

            <Box
              className="ql-editor"
              sx={{
                p: "0 !important",
                textAlign: "left",
                maxHeight: expanded ? "none" : 120,
                overflow: "hidden",
                wordBreak: "break-word",

                "& p": {
                  margin: "0 0 8px 0",
                },

                "& ol, & ul": {
                  margin: "8px 0 8px 24px",
                  paddingLeft: "20px",
                  textAlign: "left",
                },

                "& li": {
                  marginBottom: "4px",
                },
              }}
              dangerouslySetInnerHTML={{ __html: cleanBody }}
            />

            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Button
                variant="contained"
                size="small"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show Less" : "Read More"}
              </Button>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default SinglePost;