// my-YBO-app/src/components/Search.jsx - This component provides a search bar to find users by name or email and navigate to their profile page

import { useState } from "react";
import { Box, TextField, List, ListItem, ListItemText } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { fetchUsers } from "../api/api";

function Search() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  async function handleSearch(value) {
    setSearch(value);

    if (value.trim().length === 0) {
      setUsers([]);
      return;
    }

    const results = await fetchUsers(0, 10, value);
    setUsers(results);
  }

  return (
    <Box sx={{ maxWidth: 500, mx: "auto", my: 3 }}>
      <TextField fullWidth label="Search users" value={search} onChange={(e) => handleSearch(e.target.value)}/>
      <List>
        {users.map((user) => (
          
          <ListItem key={user.id} button onClick={() => navigate(`/users/${user.id}`)}>
            <ListItemText primary={user.name || user.email} secondary={user.email} />
          </ListItem>

        ))}      
      </List>
    </Box>
  );
}

export default Search;