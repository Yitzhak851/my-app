from app.utils.db import Database
from app.models import Post


class PostsService:
    """Service for managing posts"""
    
    @staticmethod
    def fetch_posts(start=0, limit=10, user_id=None, following_only=False, current_user_id=None):
        """Fetch posts with optional filters"""
        sql = """
            SELECT posts.*, users.email, users.name, users.profile_picture
            FROM posts
            JOIN users ON posts.user_id = users.id
        """
        params = []
        
        if following_only and current_user_id and not user_id:
            sql += """
                JOIN follows ON follows.following_id = posts.user_id
                WHERE follows.follower_id = %s
            """
            params.append(current_user_id)
        
        if user_id:
            sql += " WHERE posts.user_id = %s"
            params.append(user_id)
        
        sql += " ORDER BY posts.id DESC LIMIT %s OFFSET %s"
        params.extend([limit, start])
        
        try:
            posts = Database.execute_query(sql, params)
            return {
                'success': True,
                'posts': posts
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def create_post(user_id, title, body, image_url=None):
        """Create a new post"""
        if not user_id or not title or not body:
            return {
                'success': False,
                'error': 'user_id, title, and body are required'
            }
        
        try:
            post_id = Database.execute_update(
                """
                INSERT INTO posts (user_id, title, body, image_url)
                VALUES (%s, %s, %s, %s)
                """,
                (user_id, title, body, image_url or None)
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
                    users.email,
                    users.profile_picture
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
            return {
                'success': False,
                'error': str(e)
            }
