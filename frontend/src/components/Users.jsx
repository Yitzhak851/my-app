// my-YBO-app/src/components/Users.jsx
//
// Browsable list of users with a name filter and "load more".
//
// It used to render <Search/> and pass it `search`/`setSearch` props that the
// component did not accept, so the box on this page filtered nothing. The
// filter now lives here, where the list state is.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import User from "./User";
import { fetchUsers } from "../api/api";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

function Users() {
  const [users, setUsers] = useState([]);
  const [term, setTerm] = useState("");
  const [appliedTerm, setAppliedTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  const inFlight = useRef(false);

  // Debounce so typing does not fire one request per character.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedTerm(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const load = useCallback(async (reset, currentCount, search) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const start = reset ? 0 : currentCount;
      const batch = await fetchUsers(start, PAGE_SIZE, search);
      const rows = Array.isArray(batch) ? batch : [];
      setUsers((prev) => (reset ? rows : [...prev, ...rows]));
      // Only claim there is more when a full page came back; the old code
      // advanced by a fixed 10 regardless and broke on the last page.
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(err.message || "Could not load users");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true, 0, appliedTerm);
  }, [appliedTerm, load]);

  return (
    <Container sx={{ mt: 4, mb: 6 }}>
      <Box sx={{ mb: 3, maxWidth: 480, mx: "auto" }}>
        <TextField
          fullWidth
          label="Filter by name"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Filter users by name" } }}
        />
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      <Paper sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Profile</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <User key={user.id} user={user} />
            ))}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Box sx={{ textAlign: "center", mt: 3 }}>
        {loading ? (
          <CircularProgress />
        ) : hasMore && users.length > 0 ? (
          <Button
            variant="contained"
            onClick={() => load(false, users.length, appliedTerm)}
          >
            Load More
          </Button>
        ) : null}
      </Box>
    </Container>
  );
}

export default Users;
