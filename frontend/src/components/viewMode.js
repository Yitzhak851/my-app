// Display-mode constants and layout helper, shared by the feed and the profile.
//
// Kept out of ViewModeToggle.jsx because a file that exports both a component
// and plain values breaks React Fast Refresh (and ESLint flags it).

export const VIEW_MODES = { GRID: "grid", LIST: "list" };

/** Grid template for the container holding post cards. */
export function gridColumnsFor(viewMode, minWidth = 300) {
  // minWidth is the SMALLEST a card may be before the browser drops a column.
  // Keep it well under a third of a typical laptop content width (~1000px),
  // otherwise a few pixels decide between three columns and one.
  return viewMode === VIEW_MODES.GRID
    ? `repeat(auto-fill, minmax(${minWidth}px, 1fr))`
    : "1fr";
}
