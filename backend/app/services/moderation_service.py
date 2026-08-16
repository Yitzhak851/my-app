"""
Reporting and moderation (course requirement 2.e.ii).

Two ways content reaches a moderator:

  * a person presses "Report" on a post or a comment
  * the sentiment scorer flags it automatically when it is written

Both land in the same queue, because a moderator should not have to check two
places, and because the automatic flag is a hint rather than a verdict.
"""
from app.utils.db import Database

VALID_REASONS = {
    'spam': 'Spam or advertising',
    'harassment': 'Harassment or abuse',
    'hate': 'Hate speech',
    'misinformation': 'False information',
    'other': 'Something else',
}


class ModerationService:

    # ─────────────────────────────────────────────────────── reporting ──────
    @staticmethod
    def report(reporter_id, reason, post_id=None, comment_id=None):
        if reason not in VALID_REASONS:
            return {'success': False, 'error': 'Unknown report reason', 'status': 400}

        if not post_id and not comment_id:
            return {'success': False, 'error': 'Nothing to report', 'status': 400}
        if post_id and comment_id:
            return {'success': False, 'error': 'Report one item at a time', 'status': 400}

        table, target = ('posts', post_id) if post_id else ('comments', comment_id)
        exists = Database.execute_query(
            f"SELECT id FROM {table} WHERE id = %s", (target,), fetch_one=True
        )
        if not exists:
            return {'success': False, 'error': 'That content no longer exists', 'status': 404}

        # Reporting the same thing twice should not fill the queue with copies.
        duplicate = Database.execute_query(
            """
            SELECT id FROM reports
            WHERE reporter_id = %s AND status = 'open'
              AND (post_id <=> %s) AND (comment_id <=> %s)
            """,
            (reporter_id, post_id, comment_id),
            fetch_one=True,
        )
        if duplicate:
            return {'success': True, 'already_reported': True}

        Database.execute_update(
            """
            INSERT INTO reports (reporter_id, post_id, comment_id, reason)
            VALUES (%s, %s, %s, %s)
            """,
            (reporter_id, post_id, comment_id, reason),
        )
        return {'success': True, 'already_reported': False}

    # ──────────────────────────────────────────────────────── the queue ─────
    @staticmethod
    def queue(status='open'):
        """Reports plus enough of the reported content to judge it."""
        reports = Database.execute_query(
            """
            SELECT reports.id, reports.reason, reports.status, reports.created_at,
                   reports.post_id, reports.comment_id,
                   reporter.name  AS reporter_name,
                   posts.title    AS post_title,
                   posts.body     AS post_body,
                   posts.is_flagged AS post_flagged,
                   post_author.id   AS post_author_id,
                   post_author.name AS post_author_name,
                   comments.body    AS comment_body,
                   comment_author.id   AS comment_author_id,
                   comment_author.name AS comment_author_name
            FROM reports
            JOIN users AS reporter ON reporter.id = reports.reporter_id
            LEFT JOIN posts    ON posts.id = reports.post_id
            LEFT JOIN users AS post_author ON post_author.id = posts.user_id
            LEFT JOIN comments ON comments.id = reports.comment_id
            LEFT JOIN users AS comment_author ON comment_author.id = comments.user_id
            WHERE reports.status = %s
            ORDER BY reports.created_at DESC
            LIMIT 100
            """,
            (status,),
        )
        return {'success': True, 'reports': reports or []}

    @staticmethod
    def auto_flagged():
        """Content the sentiment scorer held for review, with no human report."""
        posts = Database.execute_query(
            """
            SELECT posts.id, posts.title, posts.body, posts.sentiment_score,
                   posts.created_at, users.id AS author_id, users.name AS author_name
            FROM posts
            JOIN users ON users.id = posts.user_id
            WHERE posts.is_flagged = TRUE
            ORDER BY posts.id DESC
            LIMIT 50
            """
        ) or []
        comments = Database.execute_query(
            """
            SELECT comments.id, comments.post_id, comments.body,
                   comments.sentiment_score, comments.created_at,
                   users.id AS author_id, users.name AS author_name
            FROM comments
            JOIN users ON users.id = comments.user_id
            WHERE comments.is_flagged = TRUE
            ORDER BY comments.id DESC
            LIMIT 50
            """
        ) or []
        return {'success': True, 'posts': posts, 'comments': comments}

    # ─────────────────────────────────────────────────────────── actions ────
    @staticmethod
    def resolve(report_id, moderator_id, action):
        """
        Close a report. `action` is 'actioned' (content removed) or 'dismissed'.

        Deleting the content is a separate, explicit call — a moderator may
        legitimately close a report without removing anything.
        """
        if action not in ('actioned', 'dismissed'):
            return {'success': False, 'error': 'Unknown action', 'status': 400}

        report = Database.execute_query(
            "SELECT id FROM reports WHERE id = %s", (report_id,), fetch_one=True
        )
        if not report:
            return {'success': False, 'error': 'Report not found', 'status': 404}

        Database.execute_update(
            """
            UPDATE reports
            SET status = %s, reviewed_by = %s, reviewed_at = NOW()
            WHERE id = %s
            """,
            (action, moderator_id, report_id),
        )
        return {'success': True}

    @staticmethod
    def delete_post(post_id):
        post = Database.execute_query(
            "SELECT id FROM posts WHERE id = %s", (post_id,), fetch_one=True
        )
        if not post:
            return {'success': False, 'error': 'Post not found', 'status': 404}
        # Comments, likes and reports on it go too, via ON DELETE CASCADE.
        Database.execute_update("DELETE FROM posts WHERE id = %s", (post_id,))
        return {'success': True}

    @staticmethod
    def clear_flag(kind, item_id):
        """Mark auto-flagged content as reviewed and fine."""
        if kind not in ('post', 'comment'):
            return {'success': False, 'error': 'Unknown item type', 'status': 400}
        table = 'posts' if kind == 'post' else 'comments'
        Database.execute_update(
            f"UPDATE {table} SET is_flagged = FALSE WHERE id = %s", (item_id,)
        )
        return {'success': True}

    # ───────────────────────────────────────────────────────────── users ────
    @staticmethod
    def list_users(search='', limit=50):
        sql = """
            SELECT id, email, name, role, is_agent, is_banned, created_at,
                   (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id) AS post_count
            FROM users
        """
        params = []
        if search:
            sql += " WHERE name LIKE %s OR email LIKE %s"
            params.extend([f'%{search}%', f'%{search}%'])
        sql += " ORDER BY id ASC LIMIT %s"
        params.append(limit)
        return {'success': True, 'users': Database.execute_query(sql, params) or []}

    @staticmethod
    def set_ban(actor, user_id, banned):
        """
        Ban or unban an account.

        Banning ends every session that account holds, so the effect is
        immediate rather than lasting until a cookie expires.
        """
        if actor['id'] == user_id:
            return {'success': False, 'error': 'You cannot ban yourself', 'status': 400}

        target = Database.execute_query(
            "SELECT id, role FROM users WHERE id = %s", (user_id,), fetch_one=True
        )
        if not target:
            return {'success': False, 'error': 'User not found', 'status': 404}
        if target['role'] == 'admin':
            return {'success': False, 'error': 'Admins cannot be banned', 'status': 403}

        Database.execute_update(
            "UPDATE users SET is_banned = %s WHERE id = %s", (bool(banned), user_id)
        )

        if banned:
            from app.services.session_service import SessionService
            SessionService.destroy_all_for_user(user_id)

        return {'success': True, 'is_banned': bool(banned)}

    @staticmethod
    def set_role(actor, user_id, role):
        """Change someone's role. Admin only, enforced at the route."""
        if role not in ('user', 'moderator', 'admin'):
            return {'success': False, 'error': 'Unknown role', 'status': 400}
        if actor['id'] == user_id:
            # Otherwise the last admin can demote themselves and lock everyone out.
            return {'success': False, 'error': 'You cannot change your own role', 'status': 400}

        target = Database.execute_query(
            "SELECT id FROM users WHERE id = %s", (user_id,), fetch_one=True
        )
        if not target:
            return {'success': False, 'error': 'User not found', 'status': 404}

        Database.execute_update(
            "UPDATE users SET role = %s WHERE id = %s", (role, user_id)
        )
        return {'success': True, 'role': role}
