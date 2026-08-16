// my-YBO-app/src/components/ReportButton.jsx
//
// "Flag a post for review" (course requirement 2.e.ii).

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "../auth/AuthContext";
import { reportContent } from "../api/api";

// Mirrors VALID_REASONS on the server. The server rejects anything else, so a
// stale copy here fails safely rather than silently accepting junk.
const REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "hate", label: "Hate speech" },
  { value: "misinformation", label: "False information" },
  { value: "other", label: "Something else" },
];

function ReportButton({ postId = null, commentId = null }) {
  const { isLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!isLoggedIn) return null;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await reportContent({ postId, commentId, reason });
      setDone(true);
      setTimeout(() => setOpen(false), 1400);
    } catch (err) {
      setError(err.message || "Could not send the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="small"
        color="inherit"
        onClick={() => { setDone(false); setError(""); setOpen(true); }}
        sx={{ textTransform: "none", minWidth: 0 }}
      >
        Report
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Report this {postId ? "post" : "comment"}</DialogTitle>
        <DialogContent>
          {done ? (
            <Typography>Thanks — a moderator will take a look.</Typography>
          ) : (
            <>
              <TextField
                select
                fullWidth
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                sx={{ mt: 1 }}
              >
                {REASONS.map((r) => (
                  <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                ))}
              </TextField>
              {error && (
                <Typography color="error" variant="body2" sx={{ mt: 2 }}>{error}</Typography>
              )}
            </>
          )}
        </DialogContent>
        {!done && (
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={submit} disabled={busy}>
              {busy ? "Sending..." : "Report"}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
}

export default ReportButton;
