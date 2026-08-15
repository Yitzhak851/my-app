// my-YBO-app/src/components/User.jsx
// This component renders a single user inside the users table.

import { Avatar, Box, Button, TableCell, TableRow, Typography, } from "@mui/material";
import { useNavigate } from "react-router-dom";

function User({ user }) {
  
  const navigate = useNavigate();

  return (
    <TableRow>
      {/* ===== User details ===== */}
      <TableCell>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, }} >
          <Avatar src={user.profile_picture} alt={user.name} sx={{ width: 50, height: 50 }} />
          <Box sx={{ textAlign: "start" }}>
            <Typography fontWeight="bold">
              {user.name || "Unknown user"}
            </Typography>
            {user.bio && (
              <Typography variant="body2" color="text.secondary">
                {user.bio}
              </Typography>
            )}
          </Box>
        </Box>
      </TableCell>
      {/* ======= View profile ======= */}
      <TableCell>
        <Button variant="contained" size="small" onClick={() => navigate(`/user/${user.id}`)} >
          View Profile
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default User;