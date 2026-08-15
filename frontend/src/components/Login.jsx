// my-YBO-app/src/components/Login.jsx - This component renders a login form and handles user authentication by sending a POST request to the backend server.

import { useState } from "react";  // React hook for managing state in functional components
import { Box, Button, Card, CardContent, Divider, TextField, Typography, } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// This component renders a login form and handles user authentication by sending a POST request to the backend server. 
// It also displays any error messages that occur during the login process. Upon successful login, it redirects the user to the home page.
function Login() {
  // Initialize state and hooks
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // async function handleSubmit(e) => Handles the form submission for user login. 
  // It sends a POST request to the backend server with the email and password.
  // If the login is successful, it calls the login function from the AuthContext and redirects the user to the home page. If there is an error during the login process, it sets the error message to be displayed to the user.
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      login(data.user);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Box sx={{ minHeight: "80vh", display: "flex", justifyContent: "center", alignItems: "center", }}>
      <Card sx={{ width: 350, p: 2 }}>
        <CardContent>
          {/* ========= Login Typography =========  */}
          <Typography variant="h5" fontWeight="bold" align="center"> 
            Welcome Back 
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}> 
            Sign in to your account 
          </Typography>
          {/* ========= Form =========  */}
          <form onSubmit={handleSubmit}>
            {/* =========  Text Fields =========  */}
            {/* ========= Email TextField =========  */}
            <TextField fullWidth label="Email" margin="normal" value={email} onChange={(e) => setEmail(e.target.value)} slotProps={{ htmlInput: { "data-cy": "email", }, }} />
            {/* ========= Password TextField =========  */}
            <TextField fullWidth label="Password" type="password" margin="normal" value={password} onChange={(e) => setPassword(e.target.value)} slotProps={{ htmlInput: { "data-cy": "password", }, }} />
            {/* =========  Error Message =========  */}
            {error && (<Typography color="error" sx={{ mt: 2 }}> {error} </Typography>)}
            {/* =========  Submit Button =========  */}
            {/* ========= Login Button =========  */}
            <Button fullWidth variant="contained" sx={{ mt: 3 }} type="submit" data-cy="login-btn" > Login </Button>
          </form>
          {/* =========  Divider =========  */}
          <Divider sx={{ my: 3 }}> 
            OR 
          </Divider>
          {/* =========  Sign Up Button =========  */}
          <Button fullWidth variant="outlined" component={Link} to="/signup" data-cy="signup-btn" > Sign Up </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

// renders a login form and handles user authentication by sending a POST request to the backend server. 
export default Login;