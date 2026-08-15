// my-YBO-app/src/components/Signup.jsx - Signup component for user registration
import { useState } from "react";
import { Box, Button,Card, CardContent, TextField, Typography, } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function Signup() {
  
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setError("Invalid email format");
      return;
    }

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Signup failed");
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
          <Typography variant="h5" fontWeight="bold" align="center"> 
            Create Account
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
            Sign up for a new account
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField fullWidth label="Email" type="email" margin="normal" value={email} onChange={(e) => setEmail(e.target.value)}/>
            <TextField fullWidth label="Password" type="password" margin="normal" value={password} onChange={(e) => setPassword(e.target.value)}/>
            <TextField fullWidth label="Repeat Password" type="password" margin="normal" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)}/>
            {error && (<Typography color="error" sx={{ mt: 2 }}> {error} </Typography> )}
            <Button fullWidth variant="contained" sx={{ mt: 3 }} type="submit"> 
              Sign Up
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Signup;