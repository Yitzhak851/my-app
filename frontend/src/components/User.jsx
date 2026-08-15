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
          <Box>
            <Typography fontWeight="bold">
              {user.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" >
              {user.email}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      {/* ======= Followers =======  */}
      <TableCell>
        <Typography>
          Followers: {user.followers || 0}
        </Typography>
      </TableCell>
      {/* ======= Following =======  */}
      <TableCell>
        <Typography>
          Following: {user.following || 0}
        </Typography>
      </TableCell>
      {/* ======= View profile =======  */}
      <TableCell>
        <Button variant="contained" size="small" onClick={() => navigate(`/user/${user.id}`)} >
          View Profile
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default User;