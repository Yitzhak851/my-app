"""
"Suggested users" (optional requirement 3.e.i).

The rule is the one every social network starts with: **people followed by the
people you follow.** If four of the accounts you follow all follow the same
person, that person is probably worth seeing. The count of those shared
connections is both the ranking and the explanation shown to the user — "4
people you follow" is a reason, where a bare list of names is not.

A new account follows nobody, so it has no mutual connections and would see an
empty box. That is the least useful moment to show someone nothing, so the list
falls back to the accounts with the most followers — which is a weaker signal,
and is labelled as such rather than dressed up as personalisation.
"""
from app.utils.db import Database
from app.utils.errors import failure

# Enough to fill a sidebar, few enough that the query stays cheap.
DEFAULT_LIMIT = 5
MAX_LIMIT = 20

# Never suggested: an account cannot be suggested to itself, a banned account
# should not be promoted, and someone already followed is not a suggestion.
_PUBLIC_COLUMNS = 'u.id, u.name, u.bio, u.profile_picture, u.is_agent'


class SuggestionsService:

    @staticmethod
    def for_user(user_id, limit=DEFAULT_LIMIT):
        """Ranked suggestions for `user_id`, with the reason for each."""
        limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))

        try:
            suggestions = SuggestionsService._by_mutual_follows(user_id, limit)

            # Top up rather than replace: someone who follows two people still
            # gets their two real suggestions first, then popular accounts.
            if len(suggestions) < limit:
                already = {s['id'] for s in suggestions}
                for row in SuggestionsService._by_follower_count(user_id, limit):
                    if row['id'] not in already:
                        suggestions.append(row)
                    if len(suggestions) == limit:
                        break

            return {'success': True, 'suggestions': suggestions}
        except Exception as e:
            return failure('suggestions_service.for_user', e,
                           'Could not load suggestions')

    @staticmethod
    def _by_mutual_follows(user_id, limit):
        """
        People followed by the people this user follows.

        `mine` is who the viewer follows; `theirs` is who those accounts follow.
        The NOT EXISTS clause drops anyone the viewer already follows —
        without it the strongest suggestion is always someone they follow
        already, because that is exactly who their circle overlaps on.
        """
        rows = Database.execute_query(
            f"""
            SELECT {_PUBLIC_COLUMNS}, COUNT(*) AS mutual_count
            FROM follows AS mine
            JOIN follows AS theirs ON theirs.follower_id = mine.following_id
            JOIN users AS u ON u.id = theirs.following_id
            WHERE mine.follower_id = %s
              AND u.id <> %s
              AND u.is_banned = FALSE
              AND NOT EXISTS (
                  SELECT 1 FROM follows AS already
                  WHERE already.follower_id = %s AND already.following_id = u.id
              )
            GROUP BY u.id, u.name, u.bio, u.profile_picture, u.is_agent
            ORDER BY mutual_count DESC, u.id ASC
            LIMIT %s
            """,
            (user_id, user_id, user_id, limit),
        )
        return [SuggestionsService._shape(row, 'mutual') for row in rows or []]

    @staticmethod
    def _by_follower_count(user_id, limit):
        """The fallback: who most people follow."""
        rows = Database.execute_query(
            f"""
            SELECT {_PUBLIC_COLUMNS}, COUNT(f.follower_id) AS follower_count
            FROM users AS u
            LEFT JOIN follows AS f ON f.following_id = u.id
            WHERE u.id <> %s
              AND u.is_banned = FALSE
              AND NOT EXISTS (
                  SELECT 1 FROM follows AS already
                  WHERE already.follower_id = %s AND already.following_id = u.id
              )
            GROUP BY u.id, u.name, u.bio, u.profile_picture, u.is_agent
            ORDER BY follower_count DESC, u.id ASC
            LIMIT %s
            """,
            (user_id, user_id, limit),
        )
        return [SuggestionsService._shape(row, 'popular') for row in rows or []]

    @staticmethod
    def _shape(row, basis):
        """
        One shape for both queries, with the reason attached.

        `email` is not in the projection — this list is shown to someone who
        does not know these people, which is precisely when an address must not
        be handed out.
        """
        mutual = int(row.get('mutual_count') or 0)
        return {
            'id': row['id'],
            'name': row.get('name'),
            'bio': row.get('bio'),
            'profile_picture': row.get('profile_picture'),
            'is_agent': bool(row.get('is_agent')),
            'basis': basis,
            'mutual_count': mutual,
            'followers': int(row.get('follower_count') or 0),
            'reason': (
                f'Followed by {mutual} {"person" if mutual == 1 else "people"} you follow'
                if basis == 'mutual' else 'Popular right now'
            ),
        }
