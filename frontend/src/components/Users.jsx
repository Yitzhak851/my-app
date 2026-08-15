// my-YBO-app/src/component/Users.jsx - display a list of users with pagination and search functionality

import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Container, Paper, Table, TableBody, TableCell, TableHead, TableRow, } from "@mui/material";
import Search from "./Search";
import User from "./User";
import { fetchUsers } from "../api/api";

function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(0);
  const [loading, setLoading] = useState(false);

  async function loadUsers(reset = false) {
    setLoading(true);
    const currentStart = reset ? 0 : start;
    const newUsers = await fetchUsers(currentStart, 10, search);
    setUsers(reset ? newUsers : [...users, ...newUsers]);
    setStart(currentStart + 10);
    setLoading(false);
  }

  useEffect(() => { loadUsers(true); }, [search]);

  return (
    <Container sx={{ mt: 4 }}>
      <Box sx={{ mb: 3 }}> 
        <Search search={search} setSearch={setSearch} /> 
      </Box>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Followers</TableCell>
              <TableCell>Following</TableCell>
              <TableCell>Profile</TableCell>
            </TableRow>
          </TableHead>
          <TableBody> {users.map((user) => (<User key={user.id} user={user} />))} </TableBody>
        </Table>
      </Paper>

      <Box sx={{ textAlign: "center", mt: 3 }}>
        {loading ? (<CircularProgress />) : (<Button variant="contained" onClick={() => loadUsers(false)}> Load More </Button>)}
      </Box>
    </Container>
  );
}

export default Users;