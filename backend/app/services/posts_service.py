from app.services.ai import sentiment
from app.utils.db import Database
from app.utils.errors import failure


class PostsService:
    """Service for managing posts"""
    
    @staticmethod
    def fetch_posts(start=0, limit=10, user_id=None, following_only=False,
                    current_user_id=None):
        """
        Fetch posts with their like and comment counts.

        The counts are correlated subqueries rather than a GROUP BY join: two
        joins onto one-to-many tables would multiply rows against each other and
        inflate both counts.
        """
        params = []

        # Whether the viewer has liked each post. Signed-out visitors get 0
        # without the extra lookup.
        if current_user_id:
            liked_expr = ("EXISTS(SELECT 1 FROM likes "
                          "WHERE likes.post_id = posts.id AND likes.user_id = %s)"
                          " AS liked_by_me")
            params.append(current_user_id)
        else:
            liked_expr = "0 AS liked_by_me"

        sql = f"""
            SELECT posts.id, posts.user_id, posts.title, posts.body,
                   posts.image_url, posts.created_at,
                   users.name, users.profile_picture,
                   (SELECT COUNT(*) FROM likes
                     WHERE likes.post_id = posts.id) AS like_count,
                   (SELECT COUNT(*) FROM comments
                     WHERE comments.post_id = posts.id) AS comment_count,
                   {liked_expr}
            FROM posts
            JOIN users ON posts.user_id = users.id
        """

        conditions = []

        if following_only and current_user_id and not user_id:
            sql += " JOIN follows ON follows.following_id = posts.user_id "
            conditions.append("follows.follower_id = %s")
            params.append(current_user_id)

        if user_id:
            conditions.append("posts.user_id = %s")
            params.append(user_id)

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)

        sql += " ORDER BY posts.id DESC LIMIT %s OFFSET %s"
        params.extend([limit, start])

        try:
            posts = Database.execute_query(sql, params)
            for post in posts or []:
                # MySQL returns EXISTS as 0/1; the client wants a boolean.
                post['liked_by_me'] = bool(post.get('liked_by_me'))
            return {'success': True, 'posts': posts}
        except Exception as e:
            return failure('posts_service.fetch_posts', e,
                           'Could not load posts')

    @staticmethod
    def create_post(user_id, title, body, image_url=None):
        """Create a new post"""
        if not user_id or not title or not body:
            return {
                'success': False,
                'error': 'user_id, title, and body are required'
            }
        
        # Scored on the way in so a moderator sees it in the queue immediately.
        # Flagging holds content for review; it does not refuse to publish it.
        analysis = sentiment.analyze(f'{title} {body}')

        try:
            post_id = Database.execute_update(
                """
                INSERT INTO posts (user_id, title, body, image_url,
                                   sentiment_score, is_flagged)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, title, body, image_url or None,
                 analysis['score'], analysis['is_toxic'])
            )
            
            # Fetch the created post
            new_post = Database.execute_query(
                """
                SELECT
                    posts.id,
                    posts.user_id,
                    posts.title,
                    posts.body,
                    posts.image_url,
                    posts.created_at,
                    users.name,
                    users.profile_picture,
                    0 AS like_count,
                    0 AS comment_count,
                    0 AS liked_by_me
                FROM posts
                JOIN users ON posts.user_id = users.id
                WHERE posts.id = %s
                """,
                (post_id,),
                fetch_one=True
            )
            
            return {
                'success': True,
                'message': 'Post created successfully',
                'post': new_post
            }
        except Exception as e:
            return failure('posts_service.create_post', e,
                           'Could not create the post')
