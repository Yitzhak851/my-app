import secrets
from datetime import datetime, timedelta

from app.utils.db import Database


class SessionService:
    """
    Server-side sessions, the scheme taught in the course.

    The browser never receives anything about the user — only an opaque random
    token in an HttpOnly cookie. The mapping from token to account lives in the
    `sessions` table, which means:

      * the client cannot forge or edit its own identity
      * logging out actually ends the session, because the server deletes the row
      * a banned or deleted account loses access immediately, with no waiting
        for a token to expire
    """

    TTL_DAYS = 7

    # 48 random bytes, url-safe encoded. Far beyond guessing range.
    TOKEN_BYTES = 48

    @staticmethod
    def create(user_id):
        """Start a session and return (session_id, expires_at)."""
        session_id = secrets.token_urlsafe(SessionService.TOKEN_BYTES)
        expires_at = datetime.now() + timedelta(days=SessionService.TTL_DAYS)

        Database.execute_update(
            """
            INSERT INTO sessions (session_id, user_id, expires_at)
            VALUES (%s, %s, %s)
            """,
            (session_id, user_id, expires_at),
        )
        return session_id, expires_at

    @staticmethod
    def get_user(session_id):
        """
        Resolve a session token to its user, or None.

        Expiry and the ban flag are checked in SQL rather than in Python so an
        expired or banned session can never be treated as valid by mistake.
        """
        if not session_id:
            return None

        return Database.execute_query(
            """
            SELECT users.id, users.email, users.name, users.bio,
                   users.profile_picture, users.role, users.is_agent,
                   users.created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.session_id = %s
              AND sessions.expires_at > NOW()
              AND users.is_banned = FALSE
            """,
            (session_id,),
            fetch_one=True,
        )

    @staticmethod
    def destroy(session_id):
        """End one session (a normal logout)."""
        if not session_id:
            return
        Database.execute_update(
            "DELETE FROM sessions WHERE session_id = %s", (session_id,)
        )

    @staticmethod
    def destroy_all_for_user(user_id):
        """
        End every session an account has.

        Used after a password reset and when an account is banned: a stolen or
        forgotten session must not survive either event.
        """
        Database.execute_update(
            "DELETE FROM sessions WHERE user_id = %s", (user_id,)
        )

    @staticmethod
    def purge_expired():
        """Delete rows that are past their expiry. Safe to call at any time."""
        Database.execute_update("DELETE FROM sessions WHERE expires_at <= NOW()")
