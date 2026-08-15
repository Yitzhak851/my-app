// my-YBO-app/src/components/ViewModeToggle.jsx
//
// Grid / List switch, shared by the feed and the profile page.
//
// It lives in one file because the two pages had their own copies with
// different button labels, and only one of them actually worked — the feed
// rendered the buttons but never told the post cards which mode was active.

import { Box, Button } from "@mui/material";
import { VIEW_MODES } from "./viewMode";

function ViewModeToggle({ value, onChange, sx }) {
  return (
    <Box
      role="group"
      aria-label="Post display mode"
      sx={{ display: "flex", justifyContent: "center", gap: 2, ...sx }}
    >
      {[
        [VIEW_MODES.GRID, "Grid"],
        [VIEW_MODES.LIST, "List"],
      ].map(([mode, label]) => (
        <Button
          key={mode}
          variant={value === mode ? "contained" : "outlined"}
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
        >
          {label}
        </Button>
      ))}
    </Box>
  );
}

export default ViewModeToggle;
