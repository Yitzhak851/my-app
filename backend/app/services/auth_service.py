import bcrypt
import re
from app.utils.db import Database
from app.models import User


class AuthService:
    """Authentication service for user registration and login"""
    
    EMAIL_REGEX = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    
    @staticmethod
    def validate_email(email):
        """Validate email format"""
        return re.match(AuthService.EMAIL_REGEX, email) is not None
    
    @staticmethod
    def hash_password(password):
        """Hash password using bcrypt"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    @staticmethod
    def verify_password(password, hashed_password):
        """Verify password against hash"""
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    
    @staticmethod
    def signup(email, password, name=None):
        """Register a new user"""
        normalized_email = email.strip().lower()
        
        # Validate email format
        if not AuthService.validate_email(normalized_email):
            return {
                'success': False,
                'error': 'Invalid email format'
            }
        
        # Check if user already exists
        existing_user = Database.execute_query(
            "SELECT id FROM users WHERE email = %s",
            (normalized_email,),
            fetch_one=True
        )
        
        if existing_user:
            return {
                'success': False,
                'error': 'Email already exists'
            }
        
        try:
            # Hash password
            hashed_password = AuthService.hash_password(password)
            
            # Generate display name and avatar
            display_name = name or normalized_email.split('@')[0]
            profile_picture = f"https://api.dicebear.com/9.x/adventurer/svg?seed={display_name}"
            
            # Insert user
            user_id = Database.execute_update(
                """
                INSERT INTO users (email, password, name, bio, profile_picture)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (normalized_email, hashed_password, display_name, 'New user', profile_picture)
            )
            
            return {
                'success': True,
                'user': {
                    'id': user_id,
                    'email': normalized_email,
                    'name': display_name,
                    'bio': 'New user',
                    'profile_picture': profile_picture
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def login(email, password):
        """Authenticate a user"""
        normalized_email = email.strip().lower()
        
        try:
            # Get user by email
            user = Database.execute_query(
                "SELECT * FROM users WHERE email = %s",
                (normalized_email,),
                fetch_one=True
            )
            
            if not user:
                return {
                    'success': False,
                    'error': 'Invalid credentials'
                }
            
            # Verify password
            if not AuthService.verify_password(password, user['password']):
                return {
                    'success': False,
                    'error': 'Invalid credentials'
                }
            
            # Return user data (exclude password)
            return {
                'success': True,
                'user': {
                    'id': user['id'],
                    'email': user['email'],
                    'name': user['name'],
                    'bio': user['bio'],
                    'profile_picture': user['profile_picture']
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
