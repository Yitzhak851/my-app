// my-YBO-app/src/components/ForgotPassword.jsx
//
// Step one of the password reset (requirement 2.a.i): ask for the email.

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
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/api";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(email.trim());
      // The server deliberately answers the same way for a registered and an
      // unregistered address, so this screen must not claim to know which.
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send the reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ minHeight: "70vh", display: "flex", justifyContent: "center", alignItems: "center", px: 2 }}>
      <Card sx={{ width: 380, p: 2 }}>
        <CardContent>
          <Typography variant="h5" fontWeight="bold" align="center">
            Forgot your password?
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3, mt: 1 }}>
            Enter your email and we will send you a link to choose a new one.
          </Typography>

          {sent ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                If that address has an account, a reset link is on its way.
              </Alert>
              <Typography variant="body2" color="text.secondary">
                The link expires in 30 minutes and can be used once.
              </Typography>
              <Button fullWidth component={Link} to="/login" sx={{ mt: 3 }}>
                Back to sign in
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                margin="normal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={busy || !email.trim()}
                sx={{ mt: 3 }}
              >
                {busy ? "Sending..." : "Send reset link"}
              </Button>

              <Button fullWidth component={Link} to="/login" sx={{ mt: 1 }}>
                Back to sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default ForgotPassword;
