// my-YBO-app/src/components/ResetPassword.jsx
//
// Step two of the password reset (requirement 2.a.i): the link from the email
// lands here with ?token=..., and the user chooses a new password.

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
} from "@mui/material";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/api";

const MIN_LENGTH = 8;

function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Checked here for a fast answer; the server enforces the same rule, since
    // this form is not the only way to reach the endpoint.
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== repeat) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      // Every session was ended server-side, so signing in again is required.
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err.message || "Could not reset the password");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Box sx={{ mt: 8, textAlign: "center", px: 2 }}>
        <Alert severity="error" sx={{ maxWidth: 420, mx: "auto" }}>
          This reset link is incomplete. Please request a new one.
        </Alert>
        <Button component={Link} to="/forgot-password" sx={{ mt: 2 }}>
          Request a new link
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "70vh", display: "flex", justifyContent: "center", alignItems: "center", px: 2 }}>
      <Card sx={{ width: 380, p: 2 }}>
        <CardContent>
          <Typography variant="h5" fontWeight="bold" align="center" sx={{ mb: 3 }}>
            Choose a new password
          </Typography>

          {done ? (
            <>
              <Alert severity="success">
                Your password has been changed. Taking you to the sign-in page...
              </Alert>
              <Button fullWidth component={Link} to="/login" sx={{ mt: 3 }}>
                Sign in now
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="New password"
                type="password"
                margin="normal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText={`At least ${MIN_LENGTH} characters`}
                required
              />
              <TextField
                fullWidth
                label="Repeat new password"
                type="password"
                margin="normal"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                required
              />

              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={busy}
                sx={{ mt: 3 }}
              >
                {busy ? "Saving..." : "Change password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default ResetPassword;
