// my-YBO-app/src/components/Search.jsx
//
// Standalone user search (course requirement 1.c.i): type a username, pick a
// result, land on that profile.

import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { fetchUsers } from "../api/api";

const DEBOUNCE_MS = 300;

function Search() {
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  // Identifies the most recent request so a slow earlier one cannot overwrite
  // the results of a later, more relevant search.
  const latest = useRef(0);

  useEffect(() => {
    const query = term.trim();

    if (!query) {
      setUsers([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    // Without this the component fired one request per keystroke.
    const timer = setTimeout(async () => {
      const requestId = ++latest.current;
      setLoading(true);
      try {
        const results = await fetchUsers(0, 10, query);
        if (requestId === latest.current) {
          setUsers(Array.isArray(results) ? results : []);
          setSearched(true);
        }
      } catch {
        if (requestId === latest.current) {
          setUsers([]);
          setSearched(true);
        }
      } finally {
        if (requestId === latest.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  return (
    <Box sx={{ width: "100%", maxWidth: 560, mx: "auto", my: 3, px: 2 }}>
      <TextField
        fullWidth
        label="Search users by name"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        slotProps={{ htmlInput: { "aria-label": "Search users by name" } }}
      />

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {!loading && searched && users.length === 0 && (
        <Typography sx={{ mt: 2, textAlign: "center" }} color="text.secondary">
          No users found.
        </Typography>
      )}

      <List>
        {users.map((user) => (
          // ListItemButton alone renders a bare <div role="button">. Wrapping it
          // in ListItem keeps the markup valid — a <ul> whose children are <li>.
          <ListItem key={user.id} disablePadding>
            <ListItemButton onClick={() => navigate(`/users/${user.id}`)}>
              <ListItemAvatar>
                <Avatar src={user.profile_picture} alt="" />
              </ListItemAvatar>
              <ListItemText
                primary={user.name || "Unknown user"}
                secondary={user.bio}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

export default Search;
