// Relative timestamps (course requirement 1.c.iii: "time ago", not a raw date).
//
// Extracted from SinglePost so comments can use the same wording as posts.

export function timeAgo(dateString) {
  if (!dateString) return "";

  const postDate = new Date(dateString);
  if (Number.isNaN(postDate.getTime())) return "";

  const diffMinutes = Math.floor((Date.now() - postDate.getTime()) / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "הרגע";
  if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`;

  if (diffHours < 24) {
    const minutes = diffMinutes % 60;
    if (minutes === 0) return `לפני ${diffHours} שעות`;
    return `לפני ${diffHours} שעות ו-${minutes} דקות`;
  }

  if (diffDays === 1) return "לפני יום אחד";
  return `לפני ${diffDays} ימים`;
}
