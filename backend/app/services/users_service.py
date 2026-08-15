from app.utils.db import Database


class UsersService:
    """Service for managing users"""
    
    # Email is deliberately absent from every public projection. It is not
    # needed to display a user, and returning it made every address on the site
    # readable — and searchable — by anyone, signed in or not.
    PUBLIC_COLUMNS = "id, name, bio, profile_picture, role, is_agent, created_at"

    @staticmethod
    def fetch_users(start=0, limit=10, search=""):
        """List users, optionally filtered by username."""
        sql = f"""
            SELECT {UsersService.PUBLIC_COLUMNS}
            FROM users
        """
        params = []

        if search:
            # Requirement 1.c.i is search BY USERNAME. Matching on email as well
            # turned the search box into an address-harvesting tool.
            sql += " WHERE name LIKE %s"
            params.append(f"%{search}%")
        
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
                f"""
                SELECT {UsersService.PUBLIC_COLUMNS}
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
