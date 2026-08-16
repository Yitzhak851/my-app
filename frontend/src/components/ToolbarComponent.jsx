// my-YBO-app/src/components/ToolbarComponent.jsx

import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/logo.png";

// Buttons keep their full labels but give up padding on a narrow screen, which
// is what lets the whole bar fit in two rows instead of scrolling sideways.
const COMPACT = {
  px: { xs: 0.75, sm: 1 },
  minWidth: 0,
  fontSize: { xs: "0.72rem", sm: "0.875rem" },
};

function ToolbarComponent() {
  const { currentUser, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  // logout() now ends the session on the server, so it is asynchronous.
  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <AppBar position="static">
      {/* Wrapping is what makes the bar usable on a phone (requirement 3.b).
          Everything used to sit in one non-wrapping row: signed in as an admin
          the content measured 663px inside a 390px viewport, so the whole page
          scrolled sideways and Logout was off-screen. */}
      <Toolbar
        sx={{
          flexWrap: "wrap",
          rowGap: 0.5,
          px: { xs: 1, sm: 2 },
          minHeight: { xs: "auto", sm: 64 },
          py: { xs: 1, sm: 0 },
        }}
      >
        {/* Logo */}
        <Button
          color="inherit"
          component={Link}
          to="/about"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            textTransform: "none",
            mr: { xs: 1, sm: 3 },
            px: { xs: 0.5, sm: 1 },
          }}
        >
          <img
            src={logo}
            alt="InstaRUNI Logo"
            style={{
              width: "36px",
              height: "36px",
              objectFit: "contain",
            }}
          />

          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
            InstaRUNI
          </Typography>
        </Button>

        {/* New Post */}
        {isLoggedIn && (
          <Button
            variant="contained"
            color="warning"
            component={Link}
            to="/new-post"
          >
            + New Post
          </Button>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Navigation */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0, sm: 1 },
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Button color="inherit" component={Link} to="/" sx={COMPACT}>
            Home
          </Button>

          <Button color="inherit" component={Link} to="/users" sx={COMPACT}>
            Users
          </Button>

          {isLoggedIn && (
            <Button
              color="inherit"
              component={Link}
              to={`/users/${currentUser.id}`}
              sx={COMPACT}
            >
              My Profile
            </Button>
          )}

          {/* Only shown to staff; the server enforces it regardless. */}
          {["admin", "moderator"].includes(currentUser?.role) && (
            <Button color="inherit" component={Link} to="/admin" sx={COMPACT}>
              Moderation
            </Button>
          )}

          {isLoggedIn ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                ml: { xs: 0.5, sm: 2 },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                  color: "white",
                  // The widest single item in the bar, and not something you
                  // navigate with. Hidden where the space is needed.
                  display: { xs: "none", md: "block" },
                }}
              >
                {currentUser.email}
              </Typography>

              <Button
                color="warning"
                onClick={handleLogout}
                sx={{
                  p: 0,
                  minWidth: "auto",
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                }}
              >
                Logout
              </Button>
            </Box>
          ) : (
            <Button color="inherit" component={Link} to="/login" sx={COMPACT}>
              Login
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default ToolbarComponent;