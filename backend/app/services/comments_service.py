from app.utils.db import Database

MAX_COMMENT_LENGTH = 1000


class CommentsService:
    """
    Comments (course requirement 2.b.ii).

    Flat by default, with `parent_id` allowing one level of replies. Comment
    bodies are stored and returned as PLAIN TEXT — unlike posts, which go
    through the rich-text editor and are sanitized on the way out. Keeping
    comments text-only removes a whole class of injection risk from the part of
    the site that is easiest for a stranger to write to.
    """

    @staticmethod
    def list_for_post(post_id):
        """Every comment on a post, oldest first so replies read in order."""
        comments = Database.execute_query(
            """
            SELECT comments.id, comments.post_id, comments.user_id,
                   comments.parent_id, comments.body, comments.created_at,
                   users.name, users.profile_picture
            FROM comments
            JOIN users ON users.id = comments.user_id
            WHERE comments.post_id = %s
            ORDER BY comments.created_at ASC, comments.id ASC
            """,
            (post_id,),
        )
        return {'success': True, 'comments': comments or []}

    @staticmethod
    def create(user_id, post_id, body, parent_id=None):
        text = (body or '').strip()

        if not text:
            return {'success': False, 'error': 'A comment cannot be empty', 'status': 400}
        if len(text) > MAX_COMMENT_LENGTH:
            return {
                'success': False,
                'status': 400,
                'error': f'A comment cannot be longer than {MAX_COMMENT_LENGTH} characters',
            }

        post = Database.execute_query(
            "SELECT id FROM posts WHERE id = %s", (post_id,), fetch_one=True
        )
        if not post:
            return {'success': False, 'error': 'Post not found', 'status': 404}

        if parent_id is not None:
            parent = Database.execute_query(
                "SELECT id, post_id FROM comments WHERE id = %s",
                (parent_id,),
                fetch_one=True,
            )
            # A reply must belong to the same post as its parent, otherwise a
            # comment could be smuggled onto a thread it does not belong to.
            if not parent or parent['post_id'] != int(post_id):
                return {'success': False, 'error': 'Parent comment not found', 'status': 400}

        comment_id = Database.execute_update(
            """
            INSERT INTO comments (post_id, user_id, parent_id, body)
            VALUES (%s, %s, %s, %s)
            """,
            (post_id, user_id, parent_id, text),
        )

        created = Database.execute_query(
            """
            SELECT comments.id, comments.post_id, comments.user_id,
                   comments.parent_id, comments.body, comments.created_at,
                   users.name, users.profile_picture
            FROM comments
            JOIN users ON users.id = comments.user_id
            WHERE comments.id = %s
            """,
            (comment_id,),
            fetch_one=True,
        )
        return {'success': True, 'comment': created}

    @staticmethod
    def delete(comment_id, actor):
        """
        Delete a comment.

        Allowed for its author, and for moderators and admins — the moderation
        dashboard needs to remove other people's content.
        """
        comment = Database.execute_query(
            "SELECT id, user_id FROM comments WHERE id = %s",
            (comment_id,),
            fetch_one=True,
        )
        if not comment:
            return {'success': False, 'error': 'Comment not found', 'status': 404}

        is_author = comment['user_id'] == actor['id']
        is_moderator = actor.get('role') in ('admin', 'moderator')
        if not (is_author or is_moderator):
            return {'success': False, 'error': 'You cannot delete this comment', 'status': 403}

        Database.execute_update("DELETE FROM comments WHERE id = %s", (comment_id,))
        return {'success': True}

    @staticmethod
    def count_for_post(post_id):
        row = Database.execute_query(
            "SELECT COUNT(*) AS count FROM comments WHERE post_id = %s",
            (post_id,),
            fetch_one=True,
        )
        return row['count'] if row else 0
