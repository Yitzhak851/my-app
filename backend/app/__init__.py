from flask import Flask
from flask_cors import CORS
from app.config import get_config
from app.routes import auth_bp, posts_bp, users_bp, follow_bp
from app.utils.db import Database


def create_app():
    """Create and configure Flask application"""
    app = Flask(__name__)
    
    # Load configuration
    config = get_config()
    app.config.from_object(config)
    
    # Setup CORS
    CORS(app, resources={
        r"/api/*": {
            "origins": app.config['CORS_ORIGINS'],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(follow_bp)
    
    # Health check endpoint
    @app.route('/')
    def health_check():
        return {'message': 'Server is working'}, 200
    
    @app.route('/api/health')
    def api_health_check():
        return {'message': 'API is working'}, 200
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return {'error': 'Resource not found'}, 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return {'error': 'Internal server error'}, 500
    
    # Close database connection on app shutdown
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        Database.close_connection()
    
    return app
