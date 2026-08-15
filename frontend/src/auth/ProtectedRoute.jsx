// my-YBO-app/src/auth/ProtectedRoute.jsx
//
// Hides routes that need a signed-in user.
//
// This is a convenience for the person using the app, NOT a security boundary.
// Anyone can open the browser console and render whatever they like — the real
// enforcement is @login_required on the server, which rejects the request.

import { Box, CircularProgress } from "@mui/material";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

function ProtectedRoute({ children }) {
  const { isLoggedIn, loading } = useAuth();
  const location = useLocation();

  // On a page refresh the session is confirmed by an API call. Redirecting
  // before that answer arrives would bounce a signed-in user to the login page.
  if (loading) {
    return (
      <Box sx={{ mt: 8, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isLoggedIn) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default ProtectedRoute;
