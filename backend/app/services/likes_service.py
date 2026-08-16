from app.utils.db import Database


class LikesService:
    """
    Likes (course requirement 2.b.i).

    The `likes` table has a composite primary key on (user_id, post_id), so the
    database itself guarantees one like per person per post. That makes liking
    idempotent without a read-then-write race between two concurrent requests.
    """

    @staticmethod
    def like(user_id, post_id):
        if not LikesService._post_exists(post_id):
            return {'success': False, 'error': 'Post not found', 'status': 404}

        # INSERT IGNORE turns "already liked" into a no-op rather than an error,
        # which is what a double-click on the heart should do.
        Database.execute_update(
            "INSERT IGNORE INTO likes (user_id, post_id) VALUES (%s, %s)",
            (user_id, post_id),
        )
        return {'success': True, 'count': LikesService.count(post_id), 'liked': True}

    @staticmethod
    def unlike(user_id, post_id):
        if not LikesService._post_exists(post_id):
            return {'success': False, 'error': 'Post not found', 'status': 404}

        Database.execute_update(
            "DELETE FROM likes WHERE user_id = %s AND post_id = %s",
            (user_id, post_id),
        )
        return {'success': True, 'count': LikesService.count(post_id), 'liked': False}

    @staticmethod
    def count(post_id):
        row = Database.execute_query(
            "SELECT COUNT(*) AS count FROM likes WHERE post_id = %s",
            (post_id,),
            fetch_one=True,
        )
        return row['count'] if row else 0

    @staticmethod
    def _post_exists(post_id):
        return Database.execute_query(
            "SELECT id FROM posts WHERE id = %s", (post_id,), fetch_one=True
        ) is not None
