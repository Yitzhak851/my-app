// my-YBO-app/src/components/ToolbarComponent.jsx

import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/logo.png";

function ToolbarComponent() {
  const { currentUser, isLoggedIn, logout } = useAuth();

  return (
    <AppBar position="static">
      <Toolbar>
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
            mr: 3,
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button color="inherit" component={Link} to="/">
            Home
          </Button>

          <Button color="inherit" component={Link} to="/users">
            Users
          </Button>

          {isLoggedIn && (
            <Button
              color="inherit"
              component={Link}
              to={`/users/${currentUser.id}`}
            >
              My Profile
            </Button>
          )}

          {isLoggedIn ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                ml: 2,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                  color: "white",
                }}
              >
                {currentUser.email}
              </Typography>

              <Button
                color="warning"
                onClick={logout}
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
            <Button color="inherit" component={Link} to="/login">
              Login
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default ToolbarComponent;