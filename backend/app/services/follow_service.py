from app.utils.db import Database
from app.models import Follow


class FollowService:
    """Service for managing follow relationships"""
    
    @staticmethod
    def follow_user(follower_id, following_id):
        """Follow a user"""
        if follower_id == following_id:
            return {
                'success': False,
                'error': 'Cannot follow yourself'
            }
        
        try:
            # Check if already following
            existing = Database.execute_query(
                "SELECT * FROM follows WHERE follower_id = %s AND following_id = %s",
                (follower_id, following_id),
                fetch_one=True
            )
            
            if existing:
                return {
                    'success': False,
                    'error': 'Already following this user'
                }
            
            Database.execute_update(
                """
                INSERT INTO follows (follower_id, following_id)
                VALUES (%s, %s)
                """,
                (follower_id, following_id)
            )
            
            return {
                'success': True,
                'message': 'User followed successfully'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def unfollow_user(follower_id, following_id):
        """Unfollow a user"""
        try:
            Database.execute_update(
                """
                DELETE FROM follows 
                WHERE follower_id = %s AND following_id = %s
                """,
                (follower_id, following_id)
            )
            
            return {
                'success': True,
                'message': 'User unfollowed successfully'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def check_if_following(follower_id, following_id):
        """Check if user is following another user"""
        try:
            result = Database.execute_query(
                """
                SELECT * FROM follows 
                WHERE follower_id = %s AND following_id = %s
                """,
                (follower_id, following_id),
                fetch_one=True
            )
            
            return {
                'success': True,
                'is_following': result is not None
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def get_followers(user_id):
        """Get list of followers for a user"""
        try:
            followers = Database.execute_query(
                """
                SELECT users.id, users.name, users.email, users.profile_picture
                FROM users
                JOIN follows ON users.id = follows.follower_id
                WHERE follows.following_id = %s
                """,
                (user_id,)
            )
            
            return {
                'success': True,
                'followers': followers
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def get_following(user_id):
        """Get list of users that a user is following"""
        try:
            following = Database.execute_query(
                """
                SELECT users.id, users.name, users.email, users.profile_picture
                FROM users
                JOIN follows ON users.id = follows.following_id
                WHERE follows.follower_id = %s
                """,
                (user_id,)
            )
            
            return {
                'success': True,
                'following': following
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
