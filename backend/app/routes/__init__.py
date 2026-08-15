from .auth_routes import auth_bp
from .posts_routes import posts_bp
from .users_routes import users_bp
from .follow_routes import follow_bp

__all__ = ['auth_bp', 'posts_bp', 'users_bp', 'follow_bp']
