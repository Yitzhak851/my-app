// my-YBO-app/src/components/About.jsx - This component renders an "About" page with information about the application and its features.

import { Box, Typography, Paper } from "@mui/material";

function About() {
  return (
    <Box sx={{ p: 4 }}>
      <Paper sx={{ p: 4, maxWidth: 800, mx: "auto" }}>
        <Typography variant="h4" sx={{ fontWeight: "bold", mb: 2 }}>
          About InstaRUNI
        </Typography>

        <Typography variant="body1" sx={{ mb: 2 }}>
          InstaRUNI is a social media application for RUNI students.
        </Typography>

        <Typography variant="body1">
          In this app, users can sign up, log in, create posts, view other users,
          and connect with the community.
        </Typography>
      </Paper>
    </Box>
  );
}

export default About;