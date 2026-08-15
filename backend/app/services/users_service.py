from app.utils.db import Database
from app.models import User


class UsersService:
    """Service for managing users"""
    
    @staticmethod
    def fetch_users(start=0, limit=10, search=""):
        """Fetch users with optional search"""
        sql = """
            SELECT id, email, name, bio, profile_picture, created_at
            FROM users
        """
        params = []
        
        if search:
            sql += " WHERE name LIKE %s OR email LIKE %s"
            search_term = f"%{search}%"
            params.extend([search_term, search_term])
        
        sql += " LIMIT %s OFFSET %s"
        params.extend([limit, start])
        
        try:
            users = Database.execute_query(sql, params)
            return {
                'success': True,
                'users': users
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def get_user_by_id(user_id):
        """Get user by ID"""
        try:
            user = Database.execute_query(
                """
                SELECT id, email, name, bio, profile_picture, created_at
                FROM users
                WHERE id = %s
                """,
                (user_id,),
                fetch_one=True
            )
            
            if not user:
                return {
                    'success': False,
                    'error': 'User not found'
                }
            
            return {
                'success': True,
                'user': user
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def get_user_follow_stats(user_id):
        """Get follow statistics for a user"""
        try:
            # Count followers
            followers = Database.execute_query(
                "SELECT COUNT(*) as count FROM follows WHERE following_id = %s",
                (user_id,),
                fetch_one=True
            )
            
            # Count following
            following = Database.execute_query(
                "SELECT COUNT(*) as count FROM follows WHERE follower_id = %s",
                (user_id,),
                fetch_one=True
            )
            
            # Count posts
            posts = Database.execute_query(
                "SELECT COUNT(*) as count FROM posts WHERE user_id = %s",
                (user_id,),
                fetch_one=True
            )
            
            return {
                'success': True,
                'followers': followers['count'],
                'following': following['count'],
                'posts': posts['count']
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
